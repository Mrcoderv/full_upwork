import express from "express";
import { authenticateUser } from '../controllers/authController.js'; // om du har detta
import Meeting from "../models/Meeting.js";
import logger from "../utils/logger.js";


const router = express.Router();

// GET: Alla möten
router.get('/meetings', authenticateUser, async (req, res) => {
    try {
        const { role } = req.user;
        const { page = 1, limit = 100, sort = 'start:desc', bookedBy, studentName } = req.query;

        let query = {};

        // SECURITY: Non-admins can only query their own role's meetings.
        // But respect the bookedBy parameter if provided (for route-based filtering)
        if (role === 'syv' || role === 'specped') {
            // If bookedBy is provided in query, use it (for route-based filtering)
            // Otherwise, default to user's role for security
            if (bookedBy && (bookedBy === 'syv' || bookedBy === 'specped')) {
                query.bookedBy = bookedBy;
            } else {
                query.bookedBy = role;
            }
        } else if (role === 'admin' || role === 'systemadmin') {
            // Admins MUST specify bookedBy when viewing role-specific appointment pages
            // This ensures separate lists for syv/appointments and specped/appointments
            if (bookedBy) {
                query.bookedBy = bookedBy;
            } else {
                // If no bookedBy specified, admins see all meetings (for calendar view)
                // This is intentional for the /kalender view
            }
        }

        logger.debug({ userRole: role, bookedByParam: bookedBy, finalQuery: query }, "GET /meetings - Query filter")

        // Add filtering by student name if provided
        if (studentName) {
            query['student.name'] = new RegExp(studentName, 'i');
        }

        const [sortField, sortOrder] = sort.split(':');
        const sortOptions = { [sortField]: sortOrder === 'desc' ? -1 : 1 };

        const skip = (parseInt(page) - 1) * parseInt(limit);

        const meetings = await Meeting.find(query)
            .populate({
                path: 'createdBy',
                select: 'username email',
                model: 'User'
            })
            .sort(sortOptions)
            .skip(skip)
            .limit(parseInt(limit))
            .lean(); // Use lean for performance

        const total = await Meeting.countDocuments(query);

        res.json({
            data: meetings,
            pagination: {
                total,
                page: parseInt(page),
                limit: parseInt(limit),
                totalPages: Math.ceil(total / limit),
            }
        });
    } catch (err) {
        logger.error({ err }, "Failed to fetch meetings")
        res.status(500).json({ error: 'Serverfel vid hämtning av möten' });
    }
});

// POST: Skapa nytt möte
router.post('/meetings', authenticateUser, async (req, res) => {
    try {
        const { userId } = req.user;
        const {
            title,
            start,
            end,
            location,
            studentId,
            studentName,
            personalNumber,
            bookedBy,
            info // 👈 Destructure new field
        } = req.body;

        if (!studentId || !start || !title || !bookedBy) {
            return res.status(400).json({ error: 'Obligatoriska fält saknas' });
        }

        const startDate = new Date(start);
        const endDate = end ? new Date(end) : new Date(start);
        if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
            return res.status(400).json({ error: 'Ogiltigt datum eller tid' });
        }
        if (end && endDate.getTime() <= startDate.getTime()) {
            return res.status(400).json({ error: 'Sluttid måste vara efter starttid' });
        }

        // Validate bookedBy value
        const validBookedByValues = ['syv', 'specped', 'admin', 'systemadmin'];
        if (!validBookedByValues.includes(bookedBy)) {
            return res.status(400).json({ error: `Invalid bookedBy value: ${bookedBy}. Must be one of: ${validBookedByValues.join(', ')}` });
        }

        logger.info({ title, studentId, studentName, bookedBy, createdBy: userId, userRole: req.user.role }, "Creating meeting")

        const saved = await new Meeting({
            title,
            start: startDate,
            end: end ? endDate : startDate,
            location,
            student: {
                id: studentId,
                name: studentName,
                personalNumber
            },
            bookedBy, // This should be 'specped' or 'syv' based on the route context
            info, // 👈 Save the new field
            createdBy: userId,
            createdAt: new Date()
        }).save();

        logger.info({ _id: saved._id, bookedBy: saved.bookedBy, studentName: saved.student.name }, "Meeting created")

        res.status(201).json(saved);
    } catch (err) {
        logger.error({ err }, "Failed to save meeting")
        res.status(500).json({ error: 'Serverfel vid sparande av möte' });
    }
});

// PUT: Uppdatera möte (t.ex. för att ändra datum/tid via drag-n-drop)
router.put('/meetings/:id', authenticateUser, async (req, res) => {
    try {
        const { start, end } = req.body;
        const updates = {};
        if (start) {
            const startDate = new Date(start);
            if (isNaN(startDate.getTime())) {
                return res.status(400).json({ error: "Ogiltigt startdatum" });
            }
            updates.start = startDate;
        }
        if (end) {
            const endDate = new Date(end);
            if (isNaN(endDate.getTime())) {
                return res.status(400).json({ error: "Ogiltigt slutdatum" });
            }
            updates.end = endDate;
        }
        if (updates.start && updates.end && updates.end.getTime() <= updates.start.getTime()) {
            return res.status(400).json({ error: "Sluttid måste vara efter starttid" });
        }
        const meeting = await Meeting.findByIdAndUpdate(
            req.params.id,
            updates,
            { new: true }
        );
        if (!meeting) {
            return res.status(404).json({ error: "Möte hittades inte" });
        }
        res.json(meeting);
    } catch (err) {
        logger.error({ err }, "Failed to update meeting")
        res.status(500).json({ error: 'Serverfel vid uppdatering av möte' });
    }
});

// PUT: Uppdatera elevens examenackommodationer (specped/admin)
router.put('/students/:id/exam-accommodations', authenticateUser, async (req, res) => {
    try {
        const { id } = req.params;
        const { extraTime, computer, separateRoom, notes } = req.body;

        // Validate that the user has permission
        const { role, userId } = req.user;
        const isAdmin = ['admin', 'systemadmin'].includes(role);
        const isSpecped = role === 'specped';

        if (!isAdmin && !isSpecped) {
            return res.status(403).json({ error: "Behörighet saknas för att uppdatera examenackommodationer" });
        }

        const student = await Student.findByIdAndUpdate(
            id,
            {
                examAccommodations: {
                    extraTime: extraTime !== undefined ? extraTime : undefined,
                    computer: computer !== undefined ? computer : undefined,
                    separateRoom: separateRoom !== undefined ? separateRoom : undefined,
                    notes: notes !== undefined ? notes : undefined,
                },
            },
            { new: true }
        );

        if (!student) {
            return res.status(404).json({ error: "Elev hittades inte" });
        }

        logger.info({ studentId: student._id, role, extraTime, computer, separateRoom, notes }, "Exam accommodations updated");
        res.json(student);
    } catch (err) {
        logger.error({ err }, "Failed to update exam accommodations");
        res.status(500).json({ error: 'Serverfel vid uppdatering av examenackommodationer' });
    }
});

// DELETE /meetings/:id: Add a new, secure endpoint for deleting meetings.
router.delete('/meetings/:id', authenticateUser, async (req, res) => {
    try {
        const { role, userId } = req.user;
        const { id } = req.params;

        const meeting = await Meeting.findById(id);

        if (!meeting) {
            return res.status(404).json({ error: "Möte hittades inte" });
        }

        // AUTHORIZATION: User must be creator or admin.
        const isAdmin = role === 'admin' || role === 'systemadmin';
        const isCreator = meeting.createdBy && meeting.createdBy.toString() === userId.toString();

        if (!isAdmin && !isCreator) {
            return res.status(403).json({ error: "Behörighet saknas för att radera detta möte" });
        }

        await Meeting.findByIdAndDelete(id);
        res.status(204).send();
    } catch (err) {
        logger.error({ err }, "Failed to delete meeting")
        res.status(500).json({ error: 'Serverfel vid radering av möte' });
    }
});


export default router;
