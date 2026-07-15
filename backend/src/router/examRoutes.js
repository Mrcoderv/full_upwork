import express from "express";
import mongoose from "mongoose";
const router = express.Router();
import Student from "../models/Student.js";
import Teacher from "../models/Teacher.js";
import Exam from "../models/Provning.js";
import CalendarEvent from "../models/Event.js";
import StudentEnrollment from "../models/StudentEnrollment.js";
import { isAuthenticated, hasRole } from "../middleware/auth.js";
import { createGlobalNotification } from "../controllers/notificationController.js"; // Lägg till högst upp
import Notification from "../models/Notification.js";

function calculateExamDate(requestedMonth) {
    const months = {
        Januari: 0,
        Februari: 1,
        Mars: 2,
        April: 3,
        Maj: 4,
        Juni: 5,
        Juli: 6,
        Augusti: 7,
        September: 8,
        Oktober: 9,
        November: 10,
        December: 11,
    };

    const month = months[requestedMonth];
    const year = new Date().getFullYear();

    if (month === undefined) {
        console.error("Ogiltigt månad:", requestedMonth);
        return null;
    }

    return new Date(Date.UTC(year, month, 15));
}

function getNextMonth(currentMonth) {
    const months = {
        Januari: 0,
        Februari: 1,
        Mars: 2,
        April: 3,
        Maj: 4,
        Juni: 5,
        Juli: 6,
        Augusti: 7,
        September: 8,
        Oktober: 9,
        November: 10,
        December: 11,
    };

    const monthIndex = months[currentMonth];
    if (monthIndex === undefined) return null;

    const newMonth = (monthIndex + 1) % 12;
    const yearAdjustment = newMonth === 0 ? 1 : 0;
    const newYear = new Date().getFullYear() + yearAdjustment;

    return `${newYear}-${(newMonth + 1).toString().padStart(2, "0")}`;
}

router.post("/exams", isAuthenticated, hasRole(['admin', 'systemadmin']), async (req, res) => {
    try {
        // Clean up the request body
        const examData = { ...req.body };

        // Handle empty teacherId - remove it if it's empty string
        if (examData.teacherId === "") {
            delete examData.teacherId;
        }

        // Handle empty paymentDate
        if (examData.paymentDate === "") {
            delete examData.paymentDate;
        }

        const exam = new Exam(examData);
        const savedExam = await exam.save();

        // 🔔 Skapa global notis till admin
        await createGlobalNotification(
            "new_exam_registered",
            `Ny prövning registrerad för ${exam.name} (${exam.course})`
        );

        res.status(201).json(savedExam);
    } catch (err) {
        console.error("Error saving exam:", err.message);

        // Provide more specific error messages
        if (err.name === "ValidationError") {
            const validationErrors = Object.values(err.errors).map(
                (e) => e.message
            );
            return res.status(400).json({
                error: "Validation failed",
                details: validationErrors,
            });
        }

        res.status(500).json({ error: "Failed to register exam." });
    }
});

router.put("/exams/:id", isAuthenticated, hasRole(['admin', 'systemadmin']), async (req, res) => {
    try {
        const updatedExam = await Exam.findByIdAndUpdate(req.params.id, req.body, { new: true });
        if (!updatedExam) {
            return res.status(404).json({ error: "Prövning not found." });
        }
        res.json(updatedExam);
    } catch (err) {
        console.error("Error updating exam:", err.message);
        res.status(500).json({ error: "Failed to update exam." });
    }
});

// GET all exams (Admin)
router.get("/admin/exams", isAuthenticated, hasRole(['admin', 'systemadmin']), async (req, res) => {
    try {
        const exams = await Exam.find({}).populate({
            path: "teacherId",
            populate: {
                path: "userId",
                select: "username",
            },
        });
        res.json(exams);
    } catch (err) {
        console.error("Error fetching exams for admin:", err.message);
        res.status(500).json({ error: "Failed to fetch exams." });
    }
});

router.get("/exams", isAuthenticated, async (req, res) => {
    try {
        let query = {};

        // If user is a teacher, filter exams by their teacherId
        if (req.user.role === "teacher") {
            // Find the teacher record for this user
            const teacher = await Teacher.findOne({ userId: req.user.userId });

            if (!teacher) {
                return res
                    .status(403)
                    .json({ error: "Teacher profile not found" });
            }

            // Filter exams by this teacher's ID
            query.teacherId = teacher._id;
            console.log(`🔍 Teacher ${teacher._id} fetching their exams`);
        }

        const exams = await Exam.find(query).populate({
            path: "teacherId",
            populate: {
                path: "userId",
                select: "username",
            },
        });
        // 🔔 Skapa notiser för kommande prövningar (3-4 veckor före månadsslut)
        const now = new Date();
        const currentYear = now.getFullYear();

        const months = [
            "Januari",
            "Februari",
            "Mars",
            "April",
            "Maj",
            "Juni",
            "Juli",
            "Augusti",
            "September",
            "Oktober",
            "November",
            "December",
        ];

        for (const exam of exams) {
            if (
                !exam.requestedMonth ||
                !exam.teacherId ||
                exam.status !== "intresse"
            )
                continue;

            const monthIndex = months.indexOf(exam.requestedMonth);
            if (monthIndex === -1) continue;

            const endOfMonth = new Date(currentYear, monthIndex + 1, 0); // sista dagen i månaden
            const diffDays = Math.ceil(
                (endOfMonth - now) / (1000 * 60 * 60 * 24)
            );

            if (diffDays >= 21 && diffDays <= 30) {
                const exists = await Notification.findOne({
                    teacher: exam.teacherId._id,
                    examId: exam._id,
                });
                if (!exists) {
                    const message = `Ny prövningselev: ${exam.name} (${exam.course}) önskar skriva i ${exam.requestedMonth}`;
                    await Notification.create({
                        teacher: exam.teacherId._id,
                        message,
                        examId: exam._id,
                    });
                }
            }
        }

        res.json(exams);
    } catch (err) {
        console.error("Error fetching exams:", err.message);
        res.status(500).json({ error: "Failed to fetch exams." });
    }
});

router.post("/calendar-events", isAuthenticated, async (req, res) => {
    try {
        const event = new CalendarEvent(req.body);
        await event.save();
        res.status(201).json({ message: "Event sparat", event });
    } catch (error) {
        console.error("❌ Fel vid manuell event-skapning:", error.message);
        res.status(500).json({ error: "Kunde inte spara event." });
    }
});

router.get("/calendar-events", isAuthenticated, async (req, res) => {
    try {
        let query = {
            // Exclude "slutprov" type events - these should come from /calendar-events/syncable instead
            // to avoid duplicates and ensure they're always up-to-date from enrollments
            "extendedProps.type": { $ne: "slutprov" }
        };

        // If user is a teacher, filter events by their teacherId
        if (req.user.role === "teacher") {
            // Find the teacher record for this user
            const teacher = await Teacher.findOne({ userId: req.user.userId });

            if (!teacher) {
                return res
                    .status(403)
                    .json({ error: "Teacher profile not found" });
            }

            // Filter events by this teacher's ID
            query.teacherId = teacher._id;
            console.log(
                `🔍 Teacher ${teacher._id} fetching their calendar events (excluding slutprov/exam type)`
            );
        }

        const events = await CalendarEvent.find(query);
        
        // Fix titles for any remaining events (shouldn't be any exam/slutprov, but just in case)
        const fixedEvents = events.map(event => {
            if (event.extendedProps?.type === "slutprov") {
                // Shouldn't happen, but fix title if it does
                if (event.extendedProps?.teacher) {
                    event.title = event.extendedProps.teacher;
                }
            }
            return event;
        });
        
        res.json(fixedEvents);
    } catch (err) {
        console.error("❌ Fel vid hämtning:", err);
        res.status(500).json({ error: "Kunde inte hämta sparade event" });
    }
});

// IMPORTANT: This route must come BEFORE /calendar-events/:id to avoid route conflicts
router.put(
    "/calendar-events/move-group",
    isAuthenticated,
    async (req, res) => {
        // Check if transactions are supported (they require a replica set)
        // For local development with standalone MongoDB, skip transactions
        let session = null;
        let useTransaction = false;

        // Only attempt transactions in production or if explicitly enabled
        // For local dev, skip transactions to avoid "replica set" errors
        const isProduction = process.env.NODE_ENV === 'production';
        const enableTransactions = process.env.ENABLE_MONGODB_TRANSACTIONS === 'true';

        if (isProduction || enableTransactions) {
            try {
                session = await mongoose.startSession();
                await session.startTransaction();
                useTransaction = true;
            } catch (error) {
                // If transactions aren't supported, continue without them
                console.log("⚠️ Transactions not supported, proceeding without transaction:", error.message);
                if (session) {
                    try {
                        session.endSession();
                    } catch (e) {
                        // Ignore
                    }
                }
                session = null;
                useTransaction = false;
            }
        } else {
            console.log("ℹ️ Running without transactions (local development mode)");
        }

        try {
            const { teacherId, fromDate, toDate, courseInstanceIds } = req.body;
            if (!teacherId || !fromDate || !toDate) {
                return res
                    .status(400)
                    .json({ error: "Missing teacherId, fromDate or toDate" });
            }

            // Permission check: Only admins or the responsible teacher can move events
            // Support both role (singular) and roles (array) for backward compatibility
            const userRole =
                req.user.role || (req.user.roles && req.user.roles[0]) || null;
            const userRoles =
                req.user.roles || (req.user.role ? [req.user.role] : []);

            const isAdmin = userRoles.some((role) =>
                ["admin", "systemadmin"].includes(role)
            );
            let isResponsibleTeacher = false;

            if (userRoles.includes("teacher")) {
                const teacherQuery = Teacher.findOne({
                    userId: req.user.userId,
                });
                if (useTransaction && session) {
                    teacherQuery.session(session);
                }
                const teacher = await teacherQuery;
                if (
                    teacher &&
                    teacher._id.toString() === teacherId.toString()
                ) {
                    isResponsibleTeacher = true;
                }
            }

            if (!isAdmin && !isResponsibleTeacher) {
                return res.status(403).json({
                    error: "Only admins or the responsible teacher can move exam dates",
                });
            }

            // Parse dates and create them at local midnight to avoid timezone issues
            const fromKey = new Date(fromDate);
            const toKey = new Date(toDate);
            
            // Create dates at local midnight (not UTC) to avoid timezone shifts
            const fromLocal = new Date(
                fromKey.getFullYear(),
                fromKey.getMonth(),
                fromKey.getDate(),
                0, 0, 0, 0
            );
            const toLocal = new Date(
                toKey.getFullYear(),
                toKey.getMonth(),
                toKey.getDate(),
                0, 0, 0, 0
            );

            // Date range for the fromDate - use local midnight, not UTC
            // This ensures we match dates correctly regardless of timezone
            const fromDateStart = new Date(
                fromKey.getFullYear(),
                fromKey.getMonth(),
                fromKey.getDate(),
                0, 0, 0, 0
            );
            const fromDateEnd = new Date(
                fromKey.getFullYear(),
                fromKey.getMonth(),
                fromKey.getDate(),
                23, 59, 59, 999
            );

            // Prepare options for updateMany operations
            const updateOptions = useTransaction && session ? { session } : {};

            // 1. Update enrollments
            console.log(`[MOVE-GROUP] Updating enrollments for teacher ${teacherId} from ${fromDate} to ${toDate}`);
            console.log(`[MOVE-GROUP] Date range: ${fromDateStart.toISOString()} to ${fromDateEnd.toISOString()}`);
            
            // First, find enrollments that match to see what we're working with
            // Try multiple queries to catch all possible enrollments:
            // 1. By teacherId and slutprovDate
            // 2. By courseInstanceId's responsibleTeacher and slutprovDate (if courseInstanceIds provided)
            const matchingEnrollmentsQuery1 = await StudentEnrollment.find({
                teacherId,
                slutprovDate: {
                    $gte: fromDateStart,
                    $lte: fromDateEnd,
                },
            }).populate('courseInstanceId', 'slutprovDate responsibleTeacher');
            
            let matchingEnrollmentsQuery2 = [];
            if (courseInstanceIds && Array.isArray(courseInstanceIds) && courseInstanceIds.length > 0) {
                matchingEnrollmentsQuery2 = await StudentEnrollment.find({
                    courseInstanceId: { $in: courseInstanceIds },
                    slutprovDate: {
                        $gte: fromDateStart,
                        $lte: fromDateEnd,
                    },
                }).populate('courseInstanceId', 'slutprovDate responsibleTeacher');
            }
            
            // Combine and deduplicate
            const allMatchingEnrollments = [
                ...matchingEnrollmentsQuery1,
                ...matchingEnrollmentsQuery2.filter(e2 => 
                    !matchingEnrollmentsQuery1.some(e1 => e1._id.toString() === e2._id.toString())
                )
            ];
            
            console.log(`[MOVE-GROUP] Found ${allMatchingEnrollments.length} matching enrollments`);
            allMatchingEnrollments.forEach(e => {
                console.log(`  - Enrollment ${e._id}: student=${e.studentId}, courseInstance=${e.courseInstanceId?._id}, teacherId=${e.teacherId}, currentSlutprovDate=${e.slutprovDate}`);
            });
            
            // Update enrollments by teacherId and date
            const enrollmentsUpdateResult1 = await StudentEnrollment.updateMany(
                {
                    teacherId,
                    slutprovDate: {
                        $gte: fromDateStart,
                        $lte: fromDateEnd,
                    },
                },
                { $set: { slutprovDate: toLocal } },
                updateOptions
            );
            
            // Also update enrollments by courseInstanceId if provided
            let enrollmentsUpdateResult2 = { modifiedCount: 0 };
            if (courseInstanceIds && Array.isArray(courseInstanceIds) && courseInstanceIds.length > 0) {
                enrollmentsUpdateResult2 = await StudentEnrollment.updateMany(
                    {
                        courseInstanceId: { $in: courseInstanceIds },
                        slutprovDate: {
                            $gte: fromDateStart,
                            $lte: fromDateEnd,
                        },
                    },
                    { $set: { slutprovDate: toLocal } },
                    updateOptions
                );
            }
            
            const totalEnrollmentsUpdated = Math.max(
                enrollmentsUpdateResult1.modifiedCount,
                enrollmentsUpdateResult2.modifiedCount,
                allMatchingEnrollments.length
            );
            
            console.log(`[MOVE-GROUP] Updated ${totalEnrollmentsUpdated} enrollments (by teacher: ${enrollmentsUpdateResult1.modifiedCount}, by courseInstance: ${enrollmentsUpdateResult2.modifiedCount})`);

            // 2. Update CourseInstance.slutprovDate
            // First, find all course instances that have enrollments with the old date
            const { default: CourseInstance } = await import(
                "../models/CourseInstance.js"
            );
            
            // Get unique course instance IDs from the matching enrollments
            const courseInstanceIdsFromEnrollments = [...new Set(
                allMatchingEnrollments
                    .map(e => e.courseInstanceId?._id?.toString())
                    .filter(id => id)
            )];
            
            // Also include courseInstanceIds from the request if provided
            const allCourseInstanceIds = [
                ...courseInstanceIdsFromEnrollments,
                ...(courseInstanceIds && Array.isArray(courseInstanceIds) ? courseInstanceIds.map(id => id.toString()) : [])
            ];
            const uniqueCourseInstanceIds = [...new Set(allCourseInstanceIds)];
            
            console.log(`[MOVE-GROUP] Course instance IDs to update:`, uniqueCourseInstanceIds);
            
            let courseInstancesUpdated = 0;
            if (uniqueCourseInstanceIds.length > 0) {
                // Update all CourseInstances that have enrollments being moved
                // Use findByIdAndUpdate for each to set the flag to prevent pre-save hook recalculation
                for (const instanceId of uniqueCourseInstanceIds) {
                    try {
                        const instance = await CourseInstance.findById(instanceId);
                        if (instance && instance.responsibleTeacher?.toString() === teacherId.toString()) {
                            instance.slutprovDate = toLocal;
                            instance._slutprovDateExplicitlySet = true; // Prevent pre-save hook from recalculating
                            if (useTransaction && session) {
                                await instance.save({ session });
                            } else {
                                await instance.save();
                            }
                            courseInstancesUpdated++;
                            console.log(`📅 Updated CourseInstance ${instanceId} from ${fromDate} to ${toDate}`);
                        }
                    } catch (err) {
                        console.error(`❌ Error updating CourseInstance ${instanceId}:`, err);
                    }
                }
                
                // Also update ALL enrollments for these course instances (not just those with matching date)
                // This ensures enrollments stay in sync with course instance
                const enrollmentsForInstances = await StudentEnrollment.updateMany(
                    {
                        courseInstanceId: { $in: uniqueCourseInstanceIds },
                    },
                    { $set: { slutprovDate: toLocal } },
                    updateOptions
                );
                console.log(`[MOVE-GROUP] Updated ${enrollmentsForInstances.modifiedCount} enrollments for course instances (all enrollments, not just matching date)`);
            } else {
                // If no courseInstanceIds provided, try to find course instances by teacher and date
                const courseInstancesByDate = await CourseInstance.find({
                    responsibleTeacher: teacherId,
                    slutprovDate: {
                        $gte: fromDateStart,
                        $lte: fromDateEnd,
                    },
                });
                
                if (courseInstancesByDate.length > 0) {
                    console.log(`[MOVE-GROUP] Found ${courseInstancesByDate.length} course instances by date, updating them`);
                    for (const instance of courseInstancesByDate) {
                        try {
                            instance.slutprovDate = toLocal;
                            instance._slutprovDateExplicitlySet = true; // Prevent pre-save hook from recalculating
                            if (useTransaction && session) {
                                await instance.save({ session });
                            } else {
                                await instance.save();
                            }
                            courseInstancesUpdated++;
                        } catch (err) {
                            console.error(`❌ Error updating CourseInstance ${instance._id}:`, err);
                        }
                    }
                    
                    // Update ALL enrollments for these course instances
                    const instanceIds = courseInstancesByDate.map(ci => ci._id);
                    const enrollmentsForInstances = await StudentEnrollment.updateMany(
                        {
                            courseInstanceId: { $in: instanceIds },
                        },
                        { $set: { slutprovDate: toLocal } },
                        updateOptions
                    );
                    console.log(
                        `📅 Updated ${courseInstancesUpdated} CourseInstances (by date) and ${enrollmentsForInstances.modifiedCount} enrollments from ${fromDate} to ${toDate}`
                    );
                }
            }

            // 3. Update students with manual finalExamDate (OPTIMIZED)
            const studentUpdateResult = await Student.updateMany(
                {
                    teacherId,
                    finalExamDate: {
                        $gte: fromDateStart,
                        $lte: fromDateEnd,
                    },
                },
                { $set: { finalExamDate: toLocal } },
                updateOptions
            );

            // 4. Update or move CalendarEvents for this teacher and date
            // Find existing calendar events for the old date - use local midnight for consistency
            const oldDateStartForEvents = new Date(
                fromKey.getFullYear(),
                fromKey.getMonth(),
                fromKey.getDate(),
                0, 0, 0, 0
            );
            const oldDateEndForEvents = new Date(
                fromKey.getFullYear(),
                fromKey.getMonth(),
                fromKey.getDate(),
                23, 59, 59, 999
            );
            const newDateStartForEvents = new Date(
                toKey.getFullYear(),
                toKey.getMonth(),
                toKey.getDate(),
                0, 0, 0, 0
            );

            const oldEvents = await CalendarEvent.find({
                start: {
                    $gte: oldDateStartForEvents,
                    $lte: oldDateEndForEvents,
                },
                "extendedProps.type": "slutprov",
                ...(teacherId ? { "extendedProps.teacherId": teacherId } : { "extendedProps.teacherId": { $exists: false } }),
            });

            let calendarEventsUpdated = 0;
            const courseInstanceIdsFromEvents = new Set();
            
            for (const event of oldEvents) {
                // Collect courseInstanceIds from the event's extendedProps
                // This links the calendar event to its course instances
                if (event.extendedProps?.courseInstanceIds && Array.isArray(event.extendedProps.courseInstanceIds)) {
                    event.extendedProps.courseInstanceIds.forEach(id => {
                        const idStr = id?.toString ? id.toString() : String(id);
                        if (idStr) {
                            courseInstanceIdsFromEvents.add(idStr);
                        }
                    });
                    console.log(`[MOVE-GROUP] CalendarEvent ${event._id} has courseInstanceIds:`, Array.from(courseInstanceIdsFromEvents));
                }
                
                // Update the event's start date to the new date (at local midnight)
                event.start = newDateStartForEvents;
                if (useTransaction && session) {
                    await event.save({ session });
                } else {
                    await event.save();
                }
                calendarEventsUpdated++;
                console.log(`📅 Moved CalendarEvent ${event._id} from ${fromDate} to ${toDate}`);
            }
            
            // 5. Update course instances from calendar events' courseInstanceIds
            // This ensures course instances are updated when their linked calendar event is moved
            if (courseInstanceIdsFromEvents.size > 0) {
                const eventCourseInstanceIds = Array.from(courseInstanceIdsFromEvents);
                console.log(`[MOVE-GROUP] Updating ${eventCourseInstanceIds.length} course instances linked to calendar events:`, eventCourseInstanceIds);
                
                // Add these to the unique course instance IDs if not already there
                eventCourseInstanceIds.forEach(id => {
                    if (!uniqueCourseInstanceIds.includes(id)) {
                        uniqueCourseInstanceIds.push(id);
                    }
                });
                
                // Update each course instance
                for (const instanceId of eventCourseInstanceIds) {
                    try {
                        const instance = await CourseInstance.findById(instanceId);
                        if (instance) {
                            // Update the course instance's slutprovDate to match the new exam date
                            instance.slutprovDate = toLocal;
                            instance._slutprovDateExplicitlySet = true; // Prevent pre-save hook from recalculating
                            if (useTransaction && session) {
                                await instance.save({ session });
                            } else {
                                await instance.save();
                            }
                            courseInstancesUpdated++;
                            console.log(`📅 Updated CourseInstance ${instanceId} from calendar event link from ${fromDate} to ${toDate}`);
                            
                            // Also update ALL enrollments for this course instance
                            const enrollmentsForInstance = await StudentEnrollment.updateMany(
                                { courseInstanceId: instanceId },
                                { $set: { slutprovDate: toLocal } },
                                updateOptions
                            );
                            console.log(`[MOVE-GROUP] Updated ${enrollmentsForInstance.modifiedCount} enrollments for course instance ${instanceId} (from calendar event link)`);
                        }
                    } catch (err) {
                        console.error(`❌ Error updating CourseInstance ${instanceId} from calendar event:`, err);
                    }
                }
            }

            // Commit the transaction if we're using one
            if (useTransaction && session) {
                await session.commitTransaction();
            }

            res.json({
                message: "Group moved successfully",
                enrollmentsModified: totalEnrollmentsUpdated,
                courseInstancesModified: courseInstancesUpdated,
                studentsModified: studentUpdateResult.modifiedCount,
                calendarEventsModified: calendarEventsUpdated,
            });
        } catch (error) {
            // If an error occurred and we're using a transaction, abort it
            if (useTransaction && session) {
                try {
                    await session.abortTransaction();
                } catch (abortError) {
                    console.error("Error aborting transaction:", abortError);
                }
            }
            console.error(
                "❌ Failed to move group:",
                error
            );
            res.status(500).json({
                error: "Failed to move group. The operation was rolled back.",
            });
        } finally {
            // End the session if we created one
            if (session) {
                try {
                    session.endSession();
                } catch (endError) {
                    console.error("Error ending session:", endError);
                }
            }
        }
    }
);

router.put("/calendar-events/:id", isAuthenticated, async (req, res) => {
    try {
        const { id } = req.params;
        const updateFields = req.body;

        let updatedEvent = null;

        // Check if id is a composite key (contains underscore and date) or a MongoDB ObjectId
        if (id.includes('_') && id.match(/^[0-9a-fA-F]{24}_\d{4}-\d{2}-\d{2}$/)) {
            // Composite ID format: teacherId_dateKey (e.g., "69658fe7d298356eaedaf34b_2025-12-29")
            // Split only on first underscore to separate teacherId from dateKey
            const underscoreIndex = id.indexOf('_');
            const teacherIdStr = id.substring(0, underscoreIndex);
            const dateKey = id.substring(underscoreIndex + 1); // Everything after first underscore is the date
            
            // Parse the date from dateKey (format: YYYY-MM-DD)
            const [year, month, day] = dateKey.split('-').map(Number);
            
            // Create date ranges in both local and UTC to handle timezone differences
            const startOfDayLocal = new Date(year, month - 1, day, 0, 0, 0, 0);
            const endOfDayLocal = new Date(year, month - 1, day, 23, 59, 59, 999);
            
            // Also create UTC versions (events might be stored in UTC)
            const startOfDayUTC = new Date(dateKey + "T00:00:00.000Z");
            const endOfDayUTC = new Date(dateKey + "T23:59:59.999Z");

            // Find the CalendarEvent by teacherId and date (try both local and UTC)
            const query = {
                $or: [
                    {
                        start: {
                            $gte: startOfDayLocal,
                            $lte: endOfDayLocal,
                        }
                    },
                    {
                        start: {
                            $gte: startOfDayUTC,
                            $lte: endOfDayUTC,
                        }
                    }
                ],
                "extendedProps.type": "slutprov",
            };

            // Convert teacherId string to ObjectId if it's a valid ObjectId
            if (teacherIdStr.match(/^[0-9a-fA-F]{24}$/)) {
                const mongoose = (await import("mongoose")).default;
                query["extendedProps.teacherId"] = new mongoose.Types.ObjectId(teacherIdStr);
            } else {
                query["extendedProps.teacherId"] = { $exists: false };
            }

            // Find the event
            console.log(`🔍 Looking for calendar event with query:`, JSON.stringify(query, null, 2));
            let existingEvent = await CalendarEvent.findOne(query);
            
            if (!existingEvent) {
                // Try a broader date range query (might be timezone issue)
                const broaderQuery = {
                    start: {
                        $gte: new Date(startOfDayUTC.getTime() - 24 * 60 * 60 * 1000), // One day before
                        $lte: new Date(endOfDayUTC.getTime() + 24 * 60 * 60 * 1000), // One day after
                    },
                    "extendedProps.type": "slutprov",
                };
                if (teacherIdStr.match(/^[0-9a-fA-F]{24}$/)) {
                    const mongoose = (await import("mongoose")).default;
                    broaderQuery["extendedProps.teacherId"] = new mongoose.Types.ObjectId(teacherIdStr);
                } else {
                    broaderQuery["extendedProps.teacherId"] = { $exists: false };
                }
                console.log(`🔍 Trying broader date range query:`, JSON.stringify(broaderQuery, null, 2));
                existingEvent = await CalendarEvent.findOne(broaderQuery);
            }
            
            if (existingEvent) {
                // Update the found event - merge extendedProps if provided
                if (updateFields.extendedProps) {
                    // Deep merge extendedProps to preserve existing fields
                    existingEvent.extendedProps = {
                        ...existingEvent.extendedProps,
                        ...updateFields.extendedProps,
                        // Preserve students array from update (this is the authoritative list after manual edits)
                        students: updateFields.extendedProps.students || existingEvent.extendedProps.students
                    };
                }
                // Update title - use teacher name if provided in extendedProps, otherwise use updateFields.title
                // But don't use titles with course names (containing "Slutprov" or " - ")
                if (updateFields.extendedProps?.teacher) {
                    existingEvent.title = updateFields.extendedProps.teacher;
                } else if (updateFields.title && !updateFields.title.includes("Slutprov") && !updateFields.title.includes(" - ")) {
                    existingEvent.title = updateFields.title;
                } else if (existingEvent.extendedProps?.teacher) {
                    existingEvent.title = existingEvent.extendedProps.teacher;
                }
                if (updateFields.start) existingEvent.start = updateFields.start;
                if (updateFields.color) existingEvent.color = updateFields.color;
                
                updatedEvent = await existingEvent.save();
                console.log(`✅ Updated calendar event ${existingEvent._id} (composite key: ${id}) with ${updatedEvent.extendedProps?.students?.length || 0} students`);
            } else {
                // Event doesn't exist - create it from the updateFields
                console.log(`⚠️ Calendar event not found, creating new one for composite key: ${id}`);
                
                // Determine title - prefer teacher name, fallback to generic title
                let eventTitle = "Okänd lärare";
                if (updateFields.extendedProps?.teacher) {
                    eventTitle = updateFields.extendedProps.teacher;
                } else if (updateFields.title && !updateFields.title.includes("Slutprov") && !updateFields.title.includes(" - ")) {
                    eventTitle = updateFields.title;
                }
                
                // Create new event with the provided data
                const mongoose = (await import("mongoose")).default;
                const newEvent = new CalendarEvent({
                    title: eventTitle,
                    start: startOfDayUTC, // Use UTC date to match how events are stored
                    color: updateFields.color || "#ff6b6b",
                    extendedProps: {
                        type: updateFields.extendedProps?.type || "slutprov", // Use type from updateFields or default to "slutprov"
                        teacherId: teacherIdStr.match(/^[0-9a-fA-F]{24}$/) ? new mongoose.Types.ObjectId(teacherIdStr) : undefined,
                        ...(updateFields.extendedProps || {})
                    }
                });
                
                updatedEvent = await newEvent.save();
                console.log(`✅ Created new calendar event ${updatedEvent._id} (composite key: ${id}) with ${updatedEvent.extendedProps?.students?.length || 0} students`);
            }
        } else {
            // Regular MongoDB ObjectId - use findByIdAndUpdate
            updatedEvent = await CalendarEvent.findByIdAndUpdate(
                id,
                updateFields,
                { new: true }
            );

            if (!updatedEvent) {
                return res.status(404).json({ error: "Event hittades inte" });
            }
        }

        res.json({ message: "✅ Event uppdaterat", event: updatedEvent });
    } catch (err) {
        console.error("❌ Fel vid uppdatering av event:", err.message);
        res.status(500).json({ error: "Kunde inte uppdatera event" });
    }
});

router.get("/calendar-events/syncable", isAuthenticated, async (req, res) => {
    function pickFirstNonEmpty(arr, field) {
        return (
            (arr.find((e) => e[field] && e[field] !== "") || {})[field] || ""
        );
    }
    function localDateKey(dateInput) {
        const d = new Date(dateInput);
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, "0");
        const day = String(d.getDate()).padStart(2, "0");
        return `${y}-${m}-${day}`;
    }

    try {
        console.log("🔍 /calendar-events/syncable called");

        let studentQuery = {
            finalExamDate: { $ne: null },
            dropout: { $ne: true },
        };

        let enrollmentQuery = {
            slutprovDate: { $ne: null },
            status: { $in: ["enrolled", "active"] },
        };

        // Lärare: filtrera på deras elever
        let teacherFilter = null;
        if (req.user.role === "teacher") {
            const teacher = await Teacher.findOne({ userId: req.user.userId });
            if (!teacher) {
                return res
                    .status(403)
                    .json({ error: "Teacher profile not found" });
            }
            teacherFilter = teacher._id;
            studentQuery.teacherId = teacher._id;
            // For enrollments, we'll filter after populating to check both teacherId and courseInstance.responsibleTeacher
            // Remove the teacherId filter from enrollmentQuery so we can check both
            console.log(
                `🔍 Teacher ${teacher._id} fetching their syncable calendar events`
            );
        }

        // Manuellda slutprov (studenter med finalExamDate)
        const studentsWithFinalExam = await Student.find(studentQuery).populate(
            {
                path: "teacherId",
                populate: { path: "userId", select: "username" },
            }
        );
        await Student.populate(studentsWithFinalExam, {
            path: "education.refId",
            model: "Course",
            select: "courseName courseCode",
        });
        console.log(
            "📅 Students with finalExamDate:",
            studentsWithFinalExam.length
        );

        // Automatiska kurs-slutprov (från enrollments)
        // Fetch all enrollments first, then filter after populating to check both teacherId and courseInstance.responsibleTeacher
        const allEnrollmentsWithSlutprov = await StudentEnrollment.find(
            enrollmentQuery
        )
            .populate({
                path: "studentId",
                populate: {
                    path: "teacherId",
                    populate: { path: "userId", select: "username" },
                },
            })
            .populate("mainCourseId")
            .populate({
                path: "courseInstanceId",
                populate: {
                    path: "responsibleTeacher",
                    populate: { path: "userId", select: "username" },
                },
            })
            .populate({
                path: "teacherId",
                populate: { path: "userId", select: "username" },
            });
        
        // Filter enrollments for teachers: include if teacherId matches OR courseInstance.responsibleTeacher matches
        let enrollmentsToProcess = allEnrollmentsWithSlutprov;
        if (teacherFilter) {
            enrollmentsToProcess = allEnrollmentsWithSlutprov.filter((enrollment) => {
                // Check if enrollment.teacherId matches
                const enrollmentTeacherId = enrollment.teacherId?._id?.toString() || enrollment.teacherId?.toString();
                const matchesEnrollmentTeacher = enrollmentTeacherId === teacherFilter.toString();
                
                // Check if courseInstance.responsibleTeacher matches
                const courseInstanceTeacherId = enrollment.courseInstanceId?.responsibleTeacher?._id?.toString() || 
                                               enrollment.courseInstanceId?.responsibleTeacher?.toString();
                const matchesCourseInstanceTeacher = courseInstanceTeacherId === teacherFilter.toString();
                
                return matchesEnrollmentTeacher || matchesCourseInstanceTeacher;
            });
            console.log(
                `🔍 Filtered enrollments for teacher ${teacherFilter}: ${enrollmentsToProcess.length} out of ${allEnrollmentsWithSlutprov.length}`
            );
        }
        
        // Filter out enrollments where the student is a dropout
        const enrollmentsWithSlutprov = enrollmentsToProcess.filter(
            (enrollment) => !enrollment.studentId || !enrollment.studentId.dropout
        );
        
        console.log(
            "📅 Enrollments with slutprovDate (after filtering dropouts):",
            enrollmentsWithSlutprov.length,
            "(filtered from",
            allEnrollmentsWithSlutprov.length,
            "total)"
        );
        enrollmentsWithSlutprov.forEach((e) => {
            console.log(
                "  - Student:",
                e.studentId?.name,
                "Course:",
                e.mainCourseId?.courseName,
                "Date:",
                e.slutprovDate,
                "Teacher:",
                e.teacherId?.userId?.username ||
                    e.studentId?.teacherId?.userId?.username ||
                    "None"
            );
        });

        const grouped = {};

        // ----------- GRUPPERA MANUELLA SLUTPROV -----------
        for (const student of studentsWithFinalExam) {
            try {
                if (!student.finalExamDate) {
                    console.warn("skip, saknar finalExamDate", student.name);
                    continue;
                }
                
                // Allow students without teacherId - they'll be grouped separately
                if (!student.teacherId || !student.teacherId.userId) {
                    console.warn(`⚠️ Student ${student.name} has no teacherId, will group by date only`);
                }

                const dateKey = localDateKey(student.finalExamDate);
                // Handle students without teacherId - use a default key
                const teacherId = student.teacherId?._id?.toString() || null;
                const key = teacherId ? `${teacherId}_${dateKey}` : `no_teacher_${dateKey}`;

                // Hitta kursnamn
                let courseName = null;
                if (Array.isArray(student.education)) {
                    const edu = student.education.find((e) => {
                        if (e.type !== "Course" || !e.startDate || !e.endDate)
                            return false;
                        const start = new Date(e.startDate).setHours(
                            0,
                            0,
                            0,
                            0
                        );
                        const end = new Date(e.endDate).setHours(0, 0, 0, 0);
                        const exam = new Date(dateKey).setHours(0, 0, 0, 0);
                        return (
                            exam >= start &&
                            exam <= end &&
                            e.refId &&
                            typeof e.refId === "object" &&
                            e.refId.courseName
                        );
                    });
                    if (
                        edu &&
                        edu.refId &&
                        typeof edu.refId === "object" &&
                        edu.refId.courseName
                    ) {
                        courseName = edu.refId.courseName;
                    }
                }
                if (!courseName) {
                    const enrollment = await StudentEnrollment.findOne({
                        studentId: student._id,
                        endDate: {
                            $gte: new Date(dateKey),
                            $lt: new Date(
                                new Date(dateKey).getTime() +
                                    24 * 60 * 60 * 1000
                            ),
                        },
                    }).populate("mainCourseId");
                    if (
                        enrollment &&
                        enrollment.mainCourseId &&
                        enrollment.mainCourseId.courseName
                    ) {
                        courseName = enrollment.mainCourseId.courseName;
                    }
                }

                // Exam-/närvaroinfo från student-dokumentet
                const attended = student.attendedExam || false;
                const paidExamFee = student.paidExamFee || false;
                const studentExamTime = student.examTime || "";
                const studentExamMunicipality = student.examMunicipality || "";
                const studentExamLocation = student.examLocation || "";

                // Get attendance data for this specific student and event
                const { default: ExamAttendance } = await import(
                    "../models/ExamAttendance.js"
                );
                const startOfDay = new Date(dateKey + "T00:00:00.000Z");
                const endOfDay = new Date(dateKey + "T23:59:59.999Z");

                // Look for attendance record for this student's exam date
                const attendanceRecord = student.teacherId?._id ? await ExamAttendance.findOne({
                    examDate: { $gte: startOfDay, $lte: endOfDay },
                    teacherId: student.teacherId._id,
                    studentId: student._id,
                }) : null;

                // Use attendance data if available, otherwise fallback to student data
                const finalAttended = attendanceRecord
                    ? attendanceRecord.attended
                    : attended;
                const finalPaidExamFee = attendanceRecord
                    ? attendanceRecord.paidExamFee
                    : paidExamFee;
                const finalExamTime = attendanceRecord
                    ? attendanceRecord.examTime
                    : studentExamTime;
                const finalExamMunicipality = attendanceRecord
                    ? attendanceRecord.examMunicipality
                    : studentExamMunicipality;
                const finalExamLocation = attendanceRecord
                    ? attendanceRecord.examLocation
                    : studentExamLocation;

                if (!grouped[key]) {
                    // Samla samma tid/kommun/plats bland gruppen
                    const sameTime = studentsWithFinalExam
                        .filter(
                            (s) =>
                                s.finalExamDate &&
                                new Date(s.finalExamDate)
                                    .toISOString()
                                    .split("T")[0] === dateKey &&
                                // Match teacherId if available, or both have no teacherId
                                ((teacherId && s.teacherId && s.teacherId._id.toString() === teacherId) ||
                                 (!teacherId && !s.teacherId))
                        )
                        .map((s) => ({
                            time: s.examTime,
                            municipality: s.examMunicipality,
                            location: s.examLocation,
                        }));

                    // Get the most common exam info from attendance records for this event
                    const { default: ExamAttendance } = await import(
                        "../models/ExamAttendance.js"
                    );
                    const startOfDay = new Date(dateKey + "T00:00:00.000Z");
                    const endOfDay = new Date(dateKey + "T23:59:59.999Z");

                    // Debug the query parameters
                    console.log(`🔍 Querying ExamAttendance with:`);
                    console.log(`🔍   dateKey: ${dateKey}`);
                    console.log(`🔍   startOfDay: ${startOfDay}`);
                    console.log(`🔍   endOfDay: ${endOfDay}`);
                    console.log(
                        `🔍   teacherId: ${
                            student.teacherId._id
                        } (type: ${typeof student.teacherId._id})`
                    );

                    // Find attendance records and filter out dropout students
                    const allAttendanceRecords = student.teacherId?._id ? await ExamAttendance.find({
                        examDate: { $gte: startOfDay, $lte: endOfDay },
                        teacherId: student.teacherId._id,
                    }).populate("studentId", "dropout") : [];
                    
                    // Filter out records for dropout students
                    const attendanceRecords = allAttendanceRecords.filter(
                        (record) => !record.studentId || !record.studentId.dropout
                    );

                    // Get the most common exam info from attendance records or fallback to student data
                    const recordsWithTime = attendanceRecords.filter(
                        (r) => r.examTime && r.examTime.trim() !== ""
                    );
                    const recordsWithMunicipality = attendanceRecords.filter(
                        (r) =>
                            r.examMunicipality &&
                            r.examMunicipality.trim() !== ""
                    );
                    const recordsWithLocation = attendanceRecords.filter(
                        (r) => r.examLocation && r.examLocation.trim() !== ""
                    );

                    // Debug logging
                    console.log(
                        `🔍 Event ${key} - Found ${attendanceRecords.length} attendance records`
                    );
                    console.log(
                        `🔍 Records with time: ${recordsWithTime.length}, with municipality: ${recordsWithMunicipality.length}, with location: ${recordsWithLocation.length}`
                    );
                    if (recordsWithTime.length > 0)
                        console.log(
                            `🔍 First time record: ${recordsWithTime[0].examTime}`
                        );
                    if (recordsWithMunicipality.length > 0)
                        console.log(
                            `🔍 First municipality record: ${recordsWithMunicipality[0].examMunicipality}`
                        );
                    if (recordsWithLocation.length > 0)
                        console.log(
                            `🔍 First location record: ${recordsWithLocation[0].examLocation}`
                        );

                    // Get the most common values (or first if all are the same)
                    const eventExamTime =
                        recordsWithTime.length > 0
                            ? recordsWithTime[0].examTime
                            : pickFirstNonEmpty(sameTime, "time") ||
                              studentExamTime ||
                              "";
                    const eventExamMunicipality =
                        recordsWithMunicipality.length > 0
                            ? recordsWithMunicipality[0].examMunicipality
                            : pickFirstNonEmpty(sameTime, "municipality") ||
                              studentExamMunicipality ||
                              "";
                    const eventExamLocation =
                        recordsWithLocation.length > 0
                            ? recordsWithLocation[0].examLocation
                            : pickFirstNonEmpty(sameTime, "location") ||
                              studentExamLocation ||
                              "";

                    console.log(
                        `🔍 Final event exam info - Time: "${eventExamTime}", Municipality: "${eventExamMunicipality}", Location: "${eventExamLocation}"`
                    );

                    const startDate = new Date(dateKey + "T12:00:00.000Z"); // noon UTC to avoid TZ drift
                    grouped[key] = {
                        id: teacherId ? `${teacherId}_${dateKey}` : `no_teacher_${dateKey}`,
                        title: student.teacherId?.userId?.username || "Okänd lärare",
                        start: dateKey + "T12:00:00.000Z",
                        color: student.teacherId?.colorCode || "#999999",
                        extendedProps: {
                            teacher: student.teacherId?.userId?.username || "Okänd lärare",
                            teacherId: student.teacherId?._id || null,
                            type: "slutprov",
                            examMunicipality: eventExamMunicipality,
                            examLocation: eventExamLocation,
                            examTime: eventExamTime,
                            courseName: courseName || null,
                            students: [],
                        },
                    };
                }

                // Check if student is already in this event to avoid duplicates
                const existingStudentIndex = grouped[
                    key
                ].extendedProps.students.findIndex(
                    (s) => s._id.toString() === student._id.toString()
                );

                if (existingStudentIndex === -1) {
                    // Student not in event yet, add them
                    grouped[key].extendedProps.students.push({
                        _id: student._id,
                        name: student.name,
                        personalNumber: student.personalNumber,
                        additionalInfo: student.additionalInfo || "",
                        attended: finalAttended,
                        paidExamFee: finalPaidExamFee,
                        examTime: finalExamTime,
                        examMunicipality: finalExamMunicipality,
                        examLocation: finalExamLocation,
                        courseName: courseName || null,
                        finalExamDate: student.finalExamDate,
                    });
                } else {
                    // Student already exists, update their course info (they might have multiple courses)
                    const existingStudent =
                        grouped[key].extendedProps.students[
                            existingStudentIndex
                        ];
                    if (
                        courseName &&
                        !existingStudent.courseName.includes(courseName)
                    ) {
                        existingStudent.courseName = `${existingStudent.courseName}, ${courseName}`;
                    }
                    // Update attendance info if this enrollment has more recent data
                    existingStudent.attended = finalAttended;
                    existingStudent.paidExamFee = finalPaidExamFee;
                    existingStudent.examTime = finalExamTime;
                    existingStudent.examMunicipality = finalExamMunicipality;
                    existingStudent.examLocation = finalExamLocation;
                }

                console.log(
                    `🔍 Manual - Added student ${student.name} with finalExamDate: ${student.finalExamDate}`
                );
            } catch (err) {
                console.warn(
                    "Fel i studentsWithFinalExam-loopen:",
                    err.message,
                    student
                );
            }
        }

        // ----------- GRUPPERA AUTOMATISKA KURS-SLUTPROV -----------
        for (const enrollment of enrollmentsWithSlutprov) {
            try {
                if (
                    !enrollment.slutprovDate ||
                    !enrollment.studentId ||
                    !enrollment.mainCourseId
                )
                    continue;

                const student = enrollment.studentId;
                const course = enrollment.mainCourseId;

                const dateKey = localDateKey(enrollment.slutprovDate);

                // Lärare: ALWAYS prefer course instance's responsibleTeacher if it exists
                // This ensures students in the same course instance are grouped together
                let teacherId = null;
                let teacherUsername = "Unknown";
                let teacherColor = "#999999";

                // Priority: courseInstance.responsibleTeacher > enrollment.teacherId > student.teacherId
                if (enrollment.courseInstanceId?.responsibleTeacher) {
                    const responsibleTeacher = enrollment.courseInstanceId.responsibleTeacher;
                    teacherId = responsibleTeacher;
                    // Check if userId is populated (it should be from the populate chain above)
                    if (responsibleTeacher.userId) {
                        teacherUsername = responsibleTeacher.userId.username || "Unknown";
                        teacherColor = responsibleTeacher.colorCode || "#999999";
                    } else {
                        // If not populated, fetch it
                        const { default: Teacher } = await import("../models/Teacher.js");
                        const fullTeacher = await Teacher.findById(responsibleTeacher._id || responsibleTeacher)
                            .populate("userId", "username");
                        if (fullTeacher && fullTeacher.userId) {
                            teacherUsername = fullTeacher.userId.username || "Unknown";
                            teacherColor = fullTeacher.colorCode || "#999999";
                        }
                    }
                } else if (enrollment.teacherId) {
                    teacherId = enrollment.teacherId;
                    if (enrollment.teacherId.userId) {
                        teacherUsername = enrollment.teacherId.userId.username || "Unknown";
                        teacherColor = enrollment.teacherId.colorCode || "#999999";
                    }
                } else if (student.teacherId) {
                    teacherId = student.teacherId;
                    if (student.teacherId.userId) {
                        teacherUsername = student.teacherId.userId.username || "Unknown";
                        teacherColor = student.teacherId.colorCode || "#999999";
                    }
                }
                
                // If still no teacher found, skip this enrollment
                if (!teacherId) {
                    console.log(
                        `⚠️ No teacher found for student ${student.name} in course ${course.courseName}`
                    );
                    continue;
                }

                const key = `${teacherId._id.toString()}_${dateKey}`;

                const { default: ExamAttendance } = await import(
                    "../models/ExamAttendance.js"
                );

                // Datumrange för att hantera timezone
                const startOfDay = new Date(dateKey + "T00:00:00.000Z");
                const endOfDay = new Date(dateKey + "T23:59:59.999Z");

                const attendanceRecord = await ExamAttendance.findOne({
                    examDate: { $gte: startOfDay, $lte: endOfDay },
                    teacherId: teacherId._id,
                    studentId: student._id,
                });

                const attended = attendanceRecord
                    ? attendanceRecord.attended
                    : false;
                const paidExamFee = attendanceRecord
                    ? attendanceRecord.paidExamFee
                    : false;
                const examTime = attendanceRecord
                    ? attendanceRecord.examTime
                    : "";
                const examMunicipality = attendanceRecord
                    ? attendanceRecord.examMunicipality
                    : "";
                const examLocation = attendanceRecord
                    ? attendanceRecord.examLocation
                    : "";

                if (!grouped[key]) {
                    const startDate = new Date(dateKey + "T00:00:00");

                    // Get the most common exam info from attendance records for this event
                    const { default: ExamAttendance } = await import(
                        "../models/ExamAttendance.js"
                    );
                    const startOfDay = new Date(dateKey + "T00:00:00.000Z");
                    const endOfDay = new Date(dateKey + "T23:59:59.999Z");

                    // Debug the query parameters for auto events
                    console.log(`🔍 Auto Querying ExamAttendance with:`);
                    console.log(`🔍   dateKey: ${dateKey}`);
                    console.log(`🔍   startOfDay: ${startOfDay}`);
                    console.log(`🔍   endOfDay: ${endOfDay}`);
                    console.log(
                        `🔍   teacherId: ${
                            teacherId._id
                        } (type: ${typeof teacherId._id})`
                    );

                    const attendanceRecords = await ExamAttendance.find({
                        examDate: { $gte: startOfDay, $lte: endOfDay },
                        teacherId: teacherId._id,
                    });

                    // Get the most common exam info from attendance records
                    const recordsWithTime = attendanceRecords.filter(
                        (r) => r.examTime && r.examTime.trim() !== ""
                    );
                    const recordsWithMunicipality = attendanceRecords.filter(
                        (r) =>
                            r.examMunicipality &&
                            r.examMunicipality.trim() !== ""
                    );
                    const recordsWithLocation = attendanceRecords.filter(
                        (r) => r.examLocation && r.examLocation.trim() !== ""
                    );

                    // Debug logging
                    console.log(
                        `🔍 Auto Event ${key} - Found ${attendanceRecords.length} attendance records`
                    );
                    console.log(
                        `🔍 Auto Records with time: ${recordsWithTime.length}, with municipality: ${recordsWithMunicipality.length}, with location: ${recordsWithLocation.length}`
                    );
                    if (recordsWithTime.length > 0)
                        console.log(
                            `🔍 Auto First time record: ${recordsWithTime[0].examTime}`
                        );
                    if (recordsWithMunicipality.length > 0)
                        console.log(
                            `🔍 Auto First municipality record: ${recordsWithMunicipality[0].examMunicipality}`
                        );
                    if (recordsWithLocation.length > 0)
                        console.log(
                            `🔍 Auto First location record: ${recordsWithLocation[0].examLocation}`
                        );

                    const eventExamTime =
                        recordsWithTime.length > 0
                            ? recordsWithTime[0].examTime
                            : student.examTime || "";
                    const eventExamMunicipality =
                        recordsWithMunicipality.length > 0
                            ? recordsWithMunicipality[0].examMunicipality
                            : student.examMunicipality || "";
                    const eventExamLocation =
                        recordsWithLocation.length > 0
                            ? recordsWithLocation[0].examLocation
                            : student.examLocation || "";

                    console.log(
                        `🔍 Auto Final event exam info - Time: "${eventExamTime}", Municipality: "${eventExamMunicipality}", Location: "${eventExamLocation}"`
                    );

                    grouped[key] = {
                        id: `${teacherId._id}_${dateKey}`,
                        title: teacherUsername,
                        start: dateKey + "T12:00:00.000Z",
                        color: teacherColor,
                        extendedProps: {
                            teacher: teacherUsername,
                            teacherId: teacherId._id,
                            type: "slutprov",
                            examMunicipality: eventExamMunicipality,
                            examLocation: eventExamLocation,
                            examTime: eventExamTime,
                            courseName: course.courseName,
                            courseInstanceIds: [],
                            students: [],
                        },
                    };
                }

                // Check if student is already in this event to avoid duplicates
                const existingStudentIndex = grouped[
                    key
                ].extendedProps.students.findIndex(
                    (s) => s._id.toString() === student._id.toString()
                );

                // Add courseInstanceId to the array if not already present
                if (enrollment.courseInstanceId) {
                    const instanceId =
                        enrollment.courseInstanceId._id?.toString() ||
                        enrollment.courseInstanceId.toString();
                    if (
                        !grouped[key].extendedProps.courseInstanceIds.includes(
                            instanceId
                        )
                    ) {
                        grouped[key].extendedProps.courseInstanceIds.push(
                            instanceId
                        );
                    }
                }

                if (existingStudentIndex === -1) {
                    // Student not in event yet, add them
                    grouped[key].extendedProps.students.push({
                        _id: student._id,
                        name: student.name,
                        personalNumber: student.personalNumber,
                        additionalInfo: student.additionalInfo || "",
                        attended,
                        paidExamFee,
                        examTime,
                        examMunicipality,
                        examLocation,
                        courseName: course.courseName,
                        finalExamDate: enrollment.slutprovDate, // Use the enrollment's exam date
                        courseInstanceId:
                            enrollment.courseInstanceId?._id?.toString() ||
                            enrollment.courseInstanceId?.toString() ||
                            null,
                    });
                } else {
                    // Student already exists, update their course info (they might have multiple courses)
                    const existingStudent =
                        grouped[key].extendedProps.students[
                            existingStudentIndex
                        ];
                    if (
                        !existingStudent.courseName.includes(course.courseName)
                    ) {
                        existingStudent.courseName = `${existingStudent.courseName}, ${course.courseName}`;
                    }
                    // Update attendance info if this enrollment has more recent data
                    if (attendanceRecord) {
                        existingStudent.attended = attended;
                        existingStudent.paidExamFee = paidExamFee;
                        existingStudent.examTime = examTime;
                        existingStudent.examMunicipality = examMunicipality;
                        existingStudent.examLocation = examLocation;
                    }
                }

                console.log(
                    `🔍 Auto - Added student ${student.name} with finalExamDate: ${enrollment.slutprovDate}`
                );
            } catch (err) {
                console.warn(
                    "Fel i enrollmentsWithSlutprov-loopen:",
                    err.message,
                    enrollment
                );
            }
        }

        console.log("📅 Final grouped events:", Object.keys(grouped).length);
        
        // Ensure all events use teacher name as title (not course name)
        for (const [key, event] of Object.entries(grouped)) {
            // Always use teacher name as title
            if (event.extendedProps?.teacher) {
                event.title = event.extendedProps.teacher;
            }
        }
        
        // Check for existing CalendarEvent documents and merge their student lists
        // This ensures that manually removed students don't get added back
        for (const [key, event] of Object.entries(grouped)) {
            try {
                // Extract teacherId and dateKey from the composite key
                const parts = key.split('_');
                if (parts.length >= 2) {
                    const teacherIdStr = parts[0];
                    const dateKey = parts.slice(1).join('_'); // Handle dates with underscores
                    
                    // Build query to find existing CalendarEvent
                    const [year, month, day] = dateKey.split('-').map(Number);
                    const startOfDayUTC = new Date(dateKey + "T00:00:00.000Z");
                    const endOfDayUTC = new Date(dateKey + "T23:59:59.999Z");
                    
                    // Check for both "slutprov" and "exam" types (events might be saved with either)
                    const eventQuery = {
                        start: {
                            $gte: startOfDayUTC,
                            $lte: endOfDayUTC,
                        },
                        "extendedProps.type": "slutprov",
                    };
                    
                    // Add teacherId filter if it's a valid ObjectId
                    if (teacherIdStr !== 'no_teacher' && teacherIdStr.match(/^[0-9a-fA-F]{24}$/)) {
                        const mongoose = (await import("mongoose")).default;
                        eventQuery["extendedProps.teacherId"] = new mongoose.Types.ObjectId(teacherIdStr);
                    } else {
                        eventQuery["extendedProps.teacherId"] = { $exists: false };
                    }
                    
                    // Find existing CalendarEvent(s) - there might be duplicates that need merging
                    // Use a broader query to catch ALL events for this teacher/date, regardless of title or type
                    const broaderQuery = {
                        start: {
                            $gte: startOfDayUTC,
                            $lte: endOfDayUTC,
                        }
                    };
                    
                    // Add teacherId filter if it's a valid ObjectId
                    if (teacherIdStr !== 'no_teacher' && teacherIdStr.match(/^[0-9a-fA-F]{24}$/)) {
                        const mongoose = (await import("mongoose")).default;
                        broaderQuery["extendedProps.teacherId"] = new mongoose.Types.ObjectId(teacherIdStr);
                    } else {
                        broaderQuery["extendedProps.teacherId"] = { $exists: false };
                    }
                    
                    const existingCalendarEvents = await CalendarEvent.find(broaderQuery).sort({ createdAt: -1 });
                    console.log(`🔍 Found ${existingCalendarEvents.length} existing CalendarEvent(s) for ${key} (teacher: ${teacherIdStr}, date: ${dateKey})`);
                    if (existingCalendarEvents.length > 0) {
                        existingCalendarEvents.forEach(evt => {
                            console.log(`  - Event ${evt._id}: title="${evt.title}", type="${evt.extendedProps?.type}", students=${evt.extendedProps?.students?.length || 0}`);
                        });
                    }
                    
                    if (existingCalendarEvents.length > 0) {
                        // If multiple events exist for the same teacher/date, merge them and delete duplicates
                        if (existingCalendarEvents.length > 1) {
                            console.log(`⚠️ Found ${existingCalendarEvents.length} duplicate CalendarEvents for ${key}, merging them`);
                            
                            // Use the most recent event as the base, but merge all student lists
                            const baseEvent = existingCalendarEvents[0];
                            const allSavedStudents = new Map();
                            
                            // Collect all students from all duplicate events
                            existingCalendarEvents.forEach(dupEvent => {
                                if (dupEvent.extendedProps?.students) {
                                    dupEvent.extendedProps.students.forEach(student => {
                                        const studentId = student._id?.toString();
                                        if (studentId && !allSavedStudents.has(studentId)) {
                                            allSavedStudents.set(studentId, student);
                                        }
                                    });
                                }
                            });
                            
                            // Delete duplicate events (keep only the first one)
                            for (let i = 1; i < existingCalendarEvents.length; i++) {
                                await CalendarEvent.findByIdAndDelete(existingCalendarEvents[i]._id);
                                console.log(`🗑️ Deleted duplicate CalendarEvent ${existingCalendarEvents[i]._id}`);
                            }
                            
                            // Update the base event with merged students and fix title to use teacher name
                            baseEvent.extendedProps.students = Array.from(allSavedStudents.values());
                            // Always use teacher name as title, not course name
                            const teacherName = baseEvent.extendedProps?.teacher || event.extendedProps?.teacher;
                            if (teacherName) {
                                baseEvent.title = teacherName;
                                baseEvent.extendedProps.teacher = teacherName;
                            } else if (baseEvent.title && (baseEvent.title.includes("Slutprov") || baseEvent.title.includes(" - "))) {
                                // Title has course name but no teacher - this shouldn't happen, but fix it
                                baseEvent.title = "Okänd lärare";
                                console.log(`⚠️ Fixed duplicate event title from "${baseEvent.title}" to "Okänd lärare"`);
                            }
                            await baseEvent.save();
                            console.log(`✅ Fixed and saved merged CalendarEvent ${baseEvent._id} with title "${baseEvent.title}"`);
                            
                            // Use the base event for merging
                            const existingCalendarEvent = baseEvent;
                            
                            // Use the saved student list as the authoritative source
                            const savedStudents = Array.from(allSavedStudents.values());
                            const savedStudentIds = new Set(savedStudents.map(s => s._id?.toString()).filter(Boolean));
                            
                            // Create a map of dynamically generated students by ID for merging
                            const dynamicStudentsMap = new Map();
                            if (event.extendedProps.students) {
                                event.extendedProps.students.forEach(student => {
                                    const studentId = student._id?.toString();
                                    if (studentId) {
                                        dynamicStudentsMap.set(studentId, student);
                                    }
                                });
                            }
                            
                            // Merge: Use saved students as base, but update with latest data from dynamic students
                            const mergedStudents = savedStudents.map(savedStudent => {
                                const studentId = savedStudent._id?.toString();
                                const dynamicStudent = dynamicStudentsMap.get(studentId);
                                
                                // If we have dynamic data for this student, merge it (preserve saved data but update with latest)
                                if (dynamicStudent) {
                                    return {
                                        ...savedStudent, // Keep saved data (attendance, etc.)
                                        ...dynamicStudent, // Update with latest enrollment data
                                        // Preserve manually set fields from saved event
                                        attended: savedStudent.attended !== undefined ? savedStudent.attended : dynamicStudent.attended,
                                        additionalInfo: savedStudent.additionalInfo || dynamicStudent.additionalInfo || "",
                                    };
                                }
                                // If student is in saved event but not in dynamic (manually added?), keep them
                                return savedStudent;
                            });
                            
                            // Replace the students array with the merged version
                            event.extendedProps.students = mergedStudents;
                            
                            // ALWAYS use teacher name as title (not course name) - ensure consistency
                            // Never use saved title if it contains course names
                            // Recalculate teacherName (prioritize event, then existingCalendarEvent)
                            // Note: teacherName was already declared above, so we just reassign it
                            const finalTeacherName = event.extendedProps?.teacher || existingCalendarEvent.extendedProps?.teacher || teacherName;
                            if (finalTeacherName) {
                                event.title = finalTeacherName;
                                // Also update the saved event in database to fix it permanently
                                if (existingCalendarEvent.title !== finalTeacherName) {
                                    const oldTitle = existingCalendarEvent.title;
                                    existingCalendarEvent.title = finalTeacherName;
                                    existingCalendarEvent.extendedProps.teacher = finalTeacherName;
                                    await existingCalendarEvent.save();
                                    console.log(`✅ Fixed CalendarEvent ${existingCalendarEvent._id} title from "${oldTitle}" to "${finalTeacherName}"`);
                                }
                            } else {
                                // No teacher name available - use generic
                                event.title = "Okänd lärare";
                                if (existingCalendarEvent.title !== "Okänd lärare") {
                                    const oldTitle = existingCalendarEvent.title;
                                    existingCalendarEvent.title = "Okänd lärare";
                                    await existingCalendarEvent.save();
                                    console.log(`⚠️ Fixed CalendarEvent ${existingCalendarEvent._id} title from "${oldTitle}" to "Okänd lärare" (no teacher found)`);
                                }
                            }
                            
                            // Also preserve other extendedProps from the saved event (like exam info)
                            if (existingCalendarEvent.extendedProps.examTime) {
                                event.extendedProps.examTime = existingCalendarEvent.extendedProps.examTime;
                            }
                            if (existingCalendarEvent.extendedProps.examMunicipality) {
                                event.extendedProps.examMunicipality = existingCalendarEvent.extendedProps.examMunicipality;
                            }
                            if (existingCalendarEvent.extendedProps.examLocation) {
                                event.extendedProps.examLocation = existingCalendarEvent.extendedProps.examLocation;
                            }
                            
                            console.log(`✅ Merged ${existingCalendarEvents.length} duplicate CalendarEvents for ${key} - using ${mergedStudents.length} students`);
                        } else {
                            // Single existing event - merge normally
                            const existingCalendarEvent = existingCalendarEvents[0];
                            
                            if (existingCalendarEvent.extendedProps?.students) {
                                // Use the saved student list as the authoritative source
                                const savedStudents = existingCalendarEvent.extendedProps.students || [];
                                const savedStudentIds = new Set(
                                    savedStudents.map(s => s._id?.toString()).filter(Boolean)
                                );
                                
                                // Create a map of dynamically generated students by ID for merging
                                const dynamicStudentsMap = new Map();
                                if (event.extendedProps.students) {
                                    event.extendedProps.students.forEach(student => {
                                        const studentId = student._id?.toString();
                                        if (studentId) {
                                            dynamicStudentsMap.set(studentId, student);
                                        }
                                    });
                                }
                                
                                // Merge: Use saved students as base, but update with latest data from dynamic students
                                const mergedStudents = savedStudents.map(savedStudent => {
                                    const studentId = savedStudent._id?.toString();
                                    const dynamicStudent = dynamicStudentsMap.get(studentId);
                                    
                                    // If we have dynamic data for this student, merge it (preserve saved data but update with latest)
                                    if (dynamicStudent) {
                                        return {
                                            ...savedStudent, // Keep saved data (attendance, etc.)
                                            ...dynamicStudent, // Update with latest enrollment data
                                            // Preserve manually set fields from saved event
                                            attended: savedStudent.attended !== undefined ? savedStudent.attended : dynamicStudent.attended,
                                            additionalInfo: savedStudent.additionalInfo || dynamicStudent.additionalInfo || "",
                                        };
                                    }
                                    // If student is in saved event but not in dynamic (manually added?), keep them
                                    return savedStudent;
                                });
                                
                                // Replace the students array with the merged version
                                event.extendedProps.students = mergedStudents;
                                
                                // Always use teacher name as title (not course name) - ensure consistency
                                const teacherName = event.extendedProps?.teacher || existingCalendarEvent.extendedProps?.teacher;
                                if (teacherName) {
                                    event.title = teacherName;
                                    // Also update the saved event in database to fix it permanently
                                    if (existingCalendarEvent.title !== teacherName) {
                                        const oldTitle = existingCalendarEvent.title;
                                        existingCalendarEvent.title = teacherName;
                                        existingCalendarEvent.extendedProps.teacher = teacherName;
                                        await existingCalendarEvent.save();
                                        console.log(`✅ Fixed CalendarEvent ${existingCalendarEvent._id} title from "${oldTitle}" to "${teacherName}"`);
                                    }
                                } else {
                                    // No teacher name available - use generic
                                    event.title = "Okänd lärare";
                                    if (existingCalendarEvent.title !== "Okänd lärare") {
                                        const oldTitle = existingCalendarEvent.title;
                                        existingCalendarEvent.title = "Okänd lärare";
                                        await existingCalendarEvent.save();
                                        console.log(`⚠️ Fixed CalendarEvent ${existingCalendarEvent._id} title from "${oldTitle}" to "Okänd lärare" (no teacher found)`);
                                    }
                                }
                                
                                // Also preserve other extendedProps from the saved event (like exam info)
                                if (existingCalendarEvent.extendedProps.examTime) {
                                    event.extendedProps.examTime = existingCalendarEvent.extendedProps.examTime;
                                }
                                if (existingCalendarEvent.extendedProps.examMunicipality) {
                                    event.extendedProps.examMunicipality = existingCalendarEvent.extendedProps.examMunicipality;
                                }
                                if (existingCalendarEvent.extendedProps.examLocation) {
                                    event.extendedProps.examLocation = existingCalendarEvent.extendedProps.examLocation;
                                }
                                
                                console.log(`✅ Merged saved CalendarEvent for ${key} - using ${mergedStudents.length} students (${savedStudents.length} saved, ${dynamicStudentsMap.size} dynamic)`);
                            }
                        }
                    }
                }
            } catch (err) {
                console.error(`❌ Error checking existing CalendarEvent for key ${key}:`, err);
                // Continue with dynamically generated event if check fails
            }
        }
        
        // Final safety filter: Remove any dropout students from events' students arrays
        // This ensures that even if a student was added before being marked as dropout,
        // they will be filtered out when the events are returned
        const allStudentIds = new Set();
        Object.values(grouped).forEach(event => {
            if (event.extendedProps && event.extendedProps.students) {
                event.extendedProps.students.forEach(student => {
                    if (student._id) {
                        allStudentIds.add(student._id.toString());
                    }
                });
            }
        });
        
        // Fetch dropout status for all students in one query
        if (allStudentIds.size > 0) {
            const studentIdsArray = Array.from(allStudentIds);
            const dropoutStudents = await Student.find({
                _id: { $in: studentIdsArray },
                dropout: true
            }).select('_id');
            
            const dropoutStudentIds = new Set(
                dropoutStudents.map(s => s._id.toString())
            );
            
            // Remove dropout students from all events
            let totalRemoved = 0;
            Object.values(grouped).forEach(event => {
                if (event.extendedProps && event.extendedProps.students) {
                    const beforeCount = event.extendedProps.students.length;
                    event.extendedProps.students = event.extendedProps.students.filter(
                        student => !dropoutStudentIds.has(student._id.toString())
                    );
                    const afterCount = event.extendedProps.students.length;
                    totalRemoved += (beforeCount - afterCount);
                }
            });
            
            if (totalRemoved > 0) {
                console.log(`🗑️ Filtered out ${totalRemoved} dropout student(s) from events`);
            }
        }
        
        // Final pass: Ensure all events use teacher name as title (not course name) and deduplicate
        const finalEventsMap = new Map(); // teacherId_dateKey -> event
        
        Object.values(grouped).forEach(event => {
            // CRITICAL: Always use teacher name as title, never course name
            // This must happen BEFORE deduplication to ensure consistent keys
            if (event.extendedProps?.teacher) {
                event.title = event.extendedProps.teacher;
            } else if (event.title && (event.title.includes("Slutprov") || event.title.includes(" - "))) {
                // Title has course name, but no teacher - use generic
                event.title = "Okänd lärare";
                console.log(`⚠️ Fixed event title from "${event.title}" to "Okänd lärare" (no teacher found)`);
            }
            
            // Deduplicate by teacherId and date
            // Normalize teacherId to string (handle both ObjectId and string formats)
            let teacherId = null;
            if (event.extendedProps?.teacherId) {
                if (event.extendedProps.teacherId._id) {
                    teacherId = event.extendedProps.teacherId._id.toString();
                } else if (typeof event.extendedProps.teacherId === 'object' && event.extendedProps.teacherId.toString) {
                    teacherId = event.extendedProps.teacherId.toString();
                } else {
                    teacherId = String(event.extendedProps.teacherId);
                }
            }
            const teacherIdStr = teacherId || "no_teacher";
            
            // Normalize dateKey (ensure it's in YYYY-MM-DD format)
            let dateKey = event.start;
            if (dateKey instanceof Date) {
                const d = new Date(dateKey);
                dateKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
            } else if (typeof dateKey === 'string' && !dateKey.match(/^\d{4}-\d{2}-\d{2}$/)) {
                // If it's a string but not in the right format, try to parse it
                const d = new Date(dateKey);
                dateKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
            }
            
            const dedupKey = `${teacherIdStr}_${dateKey}`;
            
            if (finalEventsMap.has(dedupKey)) {
                // Merge students from duplicate events
                const existingEvent = finalEventsMap.get(dedupKey);
                if (!existingEvent) {
                    console.error(`❌ Error: existingEvent is null for key ${dedupKey}`);
                    return; // Use return instead of continue in forEach callback
                }
                if (!existingEvent.extendedProps) {
                    existingEvent.extendedProps = {};
                }
                if (!existingEvent.extendedProps.students) {
                    existingEvent.extendedProps.students = [];
                }
                const existingStudentIds = new Set(
                    existingEvent.extendedProps.students.map(s => s._id?.toString())
                );
                
                // Add students from current event that aren't already in existing event
                const studentsToAdd = (event.extendedProps?.students || []).filter(student => {
                    const studentId = student._id?.toString();
                    return studentId && !existingStudentIds.has(studentId);
                });
                
                studentsToAdd.forEach(student => {
                    existingEvent.extendedProps.students.push(student);
                });
                
                // CRITICAL: Ensure title is always teacher name, never course name
                if (existingEvent.extendedProps?.teacher) {
                    existingEvent.title = existingEvent.extendedProps.teacher;
                } else if (event.extendedProps?.teacher) {
                    existingEvent.title = event.extendedProps.teacher;
                    existingEvent.extendedProps.teacher = event.extendedProps.teacher;
                } else if (existingEvent.title && (existingEvent.title.includes("Slutprov") || existingEvent.title.includes(" - "))) {
                    existingEvent.title = "Okänd lärare";
                }
                
                console.log(`🔀 Deduplicated event ${dedupKey} (title: "${event.title}") - merged ${studentsToAdd.length} students into existing event (final title: "${existingEvent.title}")`);
            } else {
                // Ensure students array exists
                if (!event.extendedProps.students) {
                    event.extendedProps.students = [];
                }
                
                // CRITICAL: Final check - ensure title is teacher name, not course name
                if (event.extendedProps?.teacher) {
                    event.title = event.extendedProps.teacher;
                } else if (event.title && (event.title.includes("Slutprov") || event.title.includes(" - "))) {
                    event.title = "Okänd lärare";
                    console.log(`⚠️ Fixed event title from course name to "Okänd lärare" for ${dedupKey}`);
                }
                
                finalEventsMap.set(dedupKey, event);
                console.log(`✅ Added event ${dedupKey} with title "${event.title}" and ${event.extendedProps?.students?.length || 0} students`);
            }
        });
        
        const finalEvents = Array.from(finalEventsMap.values());
        
        // FINAL SAFETY CHECK: Ensure no events with course names in titles are returned
        const sanitizedEvents = finalEvents.map(event => {
            // If title still contains course name indicators, fix it
            if (event.title && (event.title.includes("Slutprov") || event.title.includes(" - "))) {
                if (event.extendedProps?.teacher) {
                    const oldTitle = event.title;
                    event.title = event.extendedProps.teacher;
                    console.log(`🔧 Final safety fix: Changed event title from "${oldTitle}" to "${event.title}"`);
                } else {
                    const oldTitle = event.title;
                    event.title = "Okänd lärare";
                    console.log(`🔧 Final safety fix: Changed event title from "${oldTitle}" to "Okänd lärare" (no teacher)`);
                }
            }
            return event;
        });
        
        console.log(`📅 Returning ${sanitizedEvents.length} deduplicated events (from ${Object.keys(grouped).length} grouped events)`);
        
        res.json(sanitizedEvents);
    } catch (err) {
        console.error("❌ Fel vid synk:", err.message, err.stack);
        res.status(500).json({ error: "Kunde inte hämta synkade events." });
    }
});

// POST: Cleanup and fix calendar event titles (use teacher names instead of course names)
router.post("/calendar-events/fix-titles", isAuthenticated, async (req, res) => {
    try {
        if (req.user.role !== "admin" && req.user.role !== "systemadmin") {
            return res.status(403).json({ error: "Only admins can fix event titles" });
        }

        // CalendarEvent is already imported at the top, but we need Teacher
        const { default: Teacher } = await import("../models/Teacher.js");

        // Find all calendar events with "slutprov" type
        const events = await CalendarEvent.find({
            "extendedProps.type": "slutprov"
        });

        let fixed = 0;
        let deleted = 0;
        const eventsByKey = new Map(); // teacherId_dateKey -> events

        // Group events by teacherId and date
        for (const event of events) {
            const teacherId = event.extendedProps?.teacherId;
            const startDate = new Date(event.start);
            const dateKey = `${startDate.getFullYear()}-${String(startDate.getMonth() + 1).padStart(2, '0')}-${String(startDate.getDate()).padStart(2, '0')}`;
            
            // Normalize teacherId to string
            let teacherIdStr = null;
            if (teacherId) {
                if (teacherId._id) {
                    teacherIdStr = teacherId._id.toString();
                } else if (typeof teacherId === 'object' && teacherId.toString) {
                    teacherIdStr = teacherId.toString();
                } else {
                    teacherIdStr = String(teacherId);
                }
            }
            
            const key = teacherIdStr ? `${teacherIdStr}_${dateKey}` : `no_teacher_${dateKey}`;
            if (!eventsByKey.has(key)) {
                eventsByKey.set(key, []);
            }
            eventsByKey.get(key).push(event);
        }

        // For each group, merge duplicates and fix titles
        for (const [key, duplicateEvents] of eventsByKey.entries()) {
            if (duplicateEvents.length > 1) {
                // Keep the first one, merge students, delete others
                const baseEvent = duplicateEvents[0];
                const allStudents = new Map();
                
                duplicateEvents.forEach(dupEvent => {
                    if (dupEvent.extendedProps?.students) {
                        dupEvent.extendedProps.students.forEach(student => {
                            const studentId = student._id?.toString();
                            if (studentId && !allStudents.has(studentId)) {
                                allStudents.set(studentId, student);
                            }
                        });
                    }
                });

                baseEvent.extendedProps.students = Array.from(allStudents.values());
                
                // Fix title to use teacher name
                if (baseEvent.extendedProps?.teacher) {
                    baseEvent.title = baseEvent.extendedProps.teacher;
                } else {
                    // Try to get teacher name from Teacher model
                    const teacher = await Teacher.findById(baseEvent.extendedProps?.teacherId).populate("userId", "username");
                    if (teacher && teacher.userId) {
                        baseEvent.title = teacher.userId.username;
                        baseEvent.extendedProps.teacher = teacher.userId.username;
                    }
                }
                
                await baseEvent.save();
                fixed++;

                // Delete duplicates
                for (let i = 1; i < duplicateEvents.length; i++) {
                    await CalendarEvent.findByIdAndDelete(duplicateEvents[i]._id);
                    deleted++;
                }
            } else if (duplicateEvents.length === 1) {
                // Fix title for single event
                const event = duplicateEvents[0];
                const oldTitle = event.title;
                
                if (event.extendedProps?.teacher) {
                    event.title = event.extendedProps.teacher;
                } else {
                    // Try to get teacher name from Teacher model
                    const teacher = await Teacher.findById(event.extendedProps?.teacherId).populate("userId", "username");
                    if (teacher && teacher.userId) {
                        event.title = teacher.userId.username;
                        event.extendedProps.teacher = teacher.userId.username;
                    }
                }
                
                if (event.title !== oldTitle) {
                    await event.save();
                    fixed++;
                }
            }
        }

        res.json({ 
            message: `Fixed ${fixed} event(s) and deleted ${deleted} duplicate(s)`,
            fixed,
            deleted
        });
    } catch (err) {
        console.error("❌ Error fixing event titles:", err);
        res.status(500).json({ error: "Kunde inte fixa event-titlar" });
    }
});

// DELETE old duplicate "slutprov" type calendar events (cleanup endpoint)
router.delete("/calendar-events/cleanup-slutprov", isAuthenticated, async (req, res) => {
    try {
        // Only admins can clean up
        if (!["admin", "systemadmin"].includes(req.user.role)) {
            return res.status(403).json({ error: "Only admins can clean up calendar events" });
        }

        // Delete all CalendarEvents with type "slutprov"
        // These should be generated dynamically from enrollments via /calendar-events/syncable
        const result = await CalendarEvent.deleteMany({
            "extendedProps.type": "slutprov"
        });

        res.json({
            message: `Deleted ${result.deletedCount} old slutprov calendar events`,
            deletedCount: result.deletedCount
        });
    } catch (err) {
        console.error("❌ Fel vid cleanup:", err.message);
        res.status(500).json({ error: "Kunde inte rensa events." });
    }
});

// GET specific calendar event by ID
router.get("/calendar-events/:id", isAuthenticated, async (req, res) => {
    try {
        const { id } = req.params;
        const event = await CalendarEvent.findById(id);

        if (!event) {
            return res.status(404).json({ error: "Event hittades inte" });
        }

        res.json(event);
    } catch (err) {
        console.error("❌ Fel vid hämtning av event:", err.message);
        res.status(500).json({ error: "Kunde inte hämta event." });
    }
});

// GET attendance data for a specific event (date + teacher)
router.get("/calendar-events/attendance/:date/:teacherId", isAuthenticated, async (req, res) => {
    try {
        const { date, teacherId } = req.params;

        // Handle date conversion properly to avoid timezone issues
        const examDate = new Date(date);
        const dateKey =
            examDate.getFullYear() +
            "-" +
            String(examDate.getMonth() + 1).padStart(2, "0") +
            "-" +
            String(examDate.getDate()).padStart(2, "0");

        const startOfDay = new Date(dateKey + "T00:00:00.000Z");
        const endOfDay = new Date(dateKey + "T23:59:59.999Z");

        const { default: ExamAttendance } = await import(
            "../models/ExamAttendance.js"
        );

        // Find all attendance records for this date/teacher
        const allAttendanceRecords = await ExamAttendance.find({
            examDate: { $gte: startOfDay, $lte: endOfDay },
            teacherId: teacherId,
        }).populate("studentId", "dropout").select(
            "studentId attended paidExamFee examTime examMunicipality examLocation"
        );

        // Filter out dropout students
        const attendanceRecords = allAttendanceRecords.filter(
            (record) => !record.studentId || !record.studentId.dropout
        );

        res.json(attendanceRecords);
    } catch (error) {
        console.error("❌ Error fetching attendance data:", error);
        res.status(500).json({ error: "Failed to fetch attendance data" });
    }
});

router.put("/update-exam/:id", isAuthenticated, async (req, res) => {
    const { id } = req.params;
    const { examTime, examMunicipality, examLocation } = req.body;

    if (!id || id.length !== 24) {
        return res.status(400).json({ error: "Ogiltigt student-ID" });
    }

    try {
        const student = await Student.findById(id);
        if (!student) {
            return res.status(404).json({ error: "Studenten hittades inte" });
        }

        // Uppdatera endast dessa tre fält
        if (examTime) student.examTime = examTime;
        if (examMunicipality) student.examMunicipality = examMunicipality;
        if (examLocation) student.examLocation = examLocation;

        await student.save();

        res.json({ message: "✅ Slutprov uppdaterat", student });
    } catch (error) {
        console.error("❌ Fel vid uppdatering av prov:", error.message);
        res.status(500).json({ error: "Serverfel", details: error.message });
    }
});

router.put("/mark-attendance/:personalNumber", isAuthenticated, async (req, res) => {
    console.log("📌 API /mark-attendance anropad! Data mottagen:", req.body);
    try {
        const { personalNumber } = req.params;

        // Trim whitespace/newlines
        const normalizedPN = personalNumber.trim();

        const student = await Student.findOne({ personalNumber: normalizedPN });

        console.log("🔍 Hittade student:", student);
        if (!student) {
            return res.status(404).json({ message: "Student not found" });
        }

        // ✅ Markera närvaro
        student.attendedExam = req.body.attended;
        await student.save();

        console.log("✅ Attendance marked for:", student);
        res.json({ message: "Attendance marked", student });
    } catch (error) {
        console.error("❌ Error marking attendance:", error.message);
        res.status(500).json({ message: "Server error", error: error.message });
    }
});

router.post("/examtime-location", isAuthenticated, async (req, res) => {
    const { studentIds, examTime, examMunicipality, examLocation } = req.body;

    if (!studentIds || !Array.isArray(studentIds) || studentIds.length === 0) {
        return res.status(400).json({ message: "Inga student-ID:n angivna" });
    }

    try {
        const result = await Student.updateMany(
            { _id: { $in: studentIds } },
            {
                $set: {
                    examTime,
                    examMunicipality,
                    examLocation,
                },
            }
        );

        console.log("✅ Uppdaterade studenter:", result.modifiedCount);
        res.status(200).json({
            message: "Provinfo uppdaterad",
            updatedCount: result.modifiedCount,
        });
    } catch (error) {
        console.error("❌ Fel vid uppdatering av exam:", error.message);
        res.status(500).json({ message: "Serverfel", error: error.message });
    }
});

// Get attendance statistics for a student
router.get("/attendance-stats/:studentId", isAuthenticated, async (req, res) => {
    try {
        const { studentId } = req.params;
        const { default: ExamAttendance } = await import(
            "../models/ExamAttendance.js"
        );

        const attendanceRecords = await ExamAttendance.find({ studentId })
            .populate("teacherId", "userId")
            .populate("courseId", "courseName")
            .sort({ examDate: -1 });

        const totalExams = attendanceRecords.length;
        const attendedExams = attendanceRecords.filter(
            (r) => r.attended
        ).length;
        const attendanceRate =
            totalExams > 0
                ? ((attendedExams / totalExams) * 100).toFixed(1)
                : 0;

        const stats = {
            totalExams,
            attendedExams,
            missedExams: totalExams - attendedExams,
            attendanceRate: parseFloat(attendanceRate),
            recentExams: attendanceRecords.slice(0, 10), // Last 10 exams
            byCourse: {},
        };

        // Group by course
        attendanceRecords.forEach((record) => {
            const courseName = record.courseName;
            if (!stats.byCourse[courseName]) {
                stats.byCourse[courseName] = {
                    total: 0,
                    attended: 0,
                    missed: 0,
                };
            }
            stats.byCourse[courseName].total++;
            if (record.attended) {
                stats.byCourse[courseName].attended++;
            } else {
                stats.byCourse[courseName].missed++;
            }
        });

        res.json(stats);
    } catch (error) {
        console.error("❌ Error getting attendance stats:", error);
        res.status(500).json({ error: "Failed to get attendance statistics" });
    }
});

router.delete("/exams/:id", isAuthenticated, hasRole(['admin', 'systemadmin']), async (req, res) => {
    try {
        const examId = req.params.id;
        const exam = await Exam.findByIdAndDelete(examId);
        if (!exam) {
            return res.status(404).json({ error: "Prövning hittades inte." });
        }
        res.json({ message: "Prövning raderad.", exam });
    } catch (err) {
        console.error("Fel vid radering av prövning:", err.message);
        res.status(500).json({ error: "Kunde inte radera prövning." });
    }
});

// PATCH: Batch update attendance for a specific event (date + teacher)
router.post("/calendar-events/mark-attendance", isAuthenticated, async (req, res) => {
    console.log("🚀 mark-attendance endpoint called!");
    console.log("📥 Request body:", req.body);
    console.log("📥 Request method:", req.method);
    console.log("📥 Request URL:", req.url);
    console.log("📥 Request headers:", req.headers);
    try {
        const {
            date,
            teacherId,
            students,
            courseName,
            courseId,
            examTime: eventExamTime,
            examMunicipality: eventExamMunicipality,
            examLocation: eventExamLocation,
        } = req.body;
        console.log("🔍 mark-attendance called with:", {
            date,
            teacherId,
            students,
            courseName,
            courseId,
        });

        if (!date || !teacherId || !Array.isArray(students)) {
            return res
                .status(400)
                .json({ error: "Missing date, teacherId, or students array" });
        }

        // Import models
        const { default: Student } = await import("../models/Student.js");
        const { default: ExamAttendance } = await import(
            "../models/ExamAttendance.js"
        );

        // Handle date conversion properly to avoid timezone issues
        const examDate = new Date(date);
        // Use the local date from the frontend, not UTC
        const dateKey =
            examDate.getFullYear() +
            "-" +
            String(examDate.getMonth() + 1).padStart(2, "0") +
            "-" +
            String(examDate.getDate()).padStart(2, "0");
        console.log(`🔍 Original date: ${date}`);
        console.log(`🔍 Parsed examDate: ${examDate}`);
        console.log(`🔍 Generated dateKey: ${dateKey}`);

        // Note: Events are dynamic and not stored in CalendarEvent collection
        // Exam info is stored in ExamAttendance records and retrieved via /calendar-events/syncable

        const updatePromises = students.map(async (student) => {
            try {
                const studentDoc = await Student.findById(student._id);
                if (!studentDoc) {
                    console.log(`❌ Student not found: ${student._id}`);
                    return {
                        success: false,
                        studentId: student._id,
                        error: "Student not found",
                    };
                }

                // Find or create exam attendance record
                const startOfDay = new Date(dateKey + "T00:00:00.000Z");
                const endOfDay = new Date(dateKey + "T23:59:59.999Z");

                console.log(
                    `🔍 Looking for existing attendance record for student ${student._id} on date ${dateKey} with teacher ${teacherId}`
                );
                let attendanceRecord = await ExamAttendance.findOne({
                    examDate: { $gte: startOfDay, $lte: endOfDay },
                    teacherId: teacherId,
                    studentId: student._id,
                });

                if (!attendanceRecord) {
                    console.log(
                        `🔍 No existing record found, creating new ExamAttendance record`
                    );
                    // Create new attendance record
                    attendanceRecord = new ExamAttendance({
                        examDate: new Date(dateKey + "T00:00:00.000Z"),
                        courseName: courseName || "Unknown Course",
                        courseId: courseId,
                        teacherId: teacherId,
                        studentId: student._id,
                        studentName: studentDoc.name,
                        personalNumber: studentDoc.personalNumber,
                        attended: !!student.attended,
                        paidExamFee: !!student.paidExamFee,
                        examTime: student.examTime || eventExamTime || "",
                        examMunicipality:
                            student.examMunicipality ||
                            eventExamMunicipality ||
                            "",
                        examLocation:
                            student.examLocation || eventExamLocation || "",
                        recordedBy: req.user?._id,
                    });
                    console.log(`🔍 Created new ExamAttendance record:`, {
                        examDate: attendanceRecord.examDate,
                        teacherId: attendanceRecord.teacherId,
                        studentId: attendanceRecord.studentId,
                        examTime: attendanceRecord.examTime,
                        examMunicipality: attendanceRecord.examMunicipality,
                        examLocation: attendanceRecord.examLocation,
                    });
                } else {
                    console.log(`🔍 Found existing record, updating it`);
                    // Update existing record
                    attendanceRecord.attended = !!student.attended;
                    attendanceRecord.paidExamFee = !!student.paidExamFee;
                    attendanceRecord.updatedAt = new Date();
                    attendanceRecord.updatedBy = req.user?._id;
                    // Tillåt event-nivå override om student-fält saknas
                    if (student.examTime || eventExamTime)
                        attendanceRecord.examTime =
                            student.examTime || eventExamTime;
                    if (student.examMunicipality || eventExamMunicipality)
                        attendanceRecord.examMunicipality =
                            student.examMunicipality || eventExamMunicipality;
                    if (student.examLocation || eventExamLocation)
                        attendanceRecord.examLocation =
                            student.examLocation || eventExamLocation;
                }

                console.log(`🔍 About to save attendance record...`);
                await attendanceRecord.save();
                console.log(
                    `🔍 Successfully saved attendance record with ID: ${attendanceRecord._id}`
                );
                console.log(
                    `💾 Saved attendance record: ${attendanceRecord._id} for student ${studentDoc.name} - attended: ${attendanceRecord.attended}`
                );
                console.log(`💾 Saved examDate: ${attendanceRecord.examDate}`);
                console.log(
                    `💾 Saved teacherId: ${attendanceRecord.teacherId}`
                );
                console.log(
                    `💾 Saved studentId: ${attendanceRecord.studentId}`
                );

                // Note: Exam info is stored in ExamAttendance records
                // Event-level info is retrieved via /calendar-events/syncable

                // Update student's exam history
                const existingHistoryIndex = studentDoc.examHistory.findIndex(
                    (h) => {
                        const historyDate = h.examDate
                            .toISOString()
                            .split("T")[0];
                        return (
                            historyDate === dateKey &&
                            h.teacherId.toString() === teacherId.toString()
                        );
                    }
                );

                if (existingHistoryIndex >= 0) {
                    // Update existing history entry
                    studentDoc.examHistory[existingHistoryIndex].attended =
                        !!student.attended;
                    studentDoc.examHistory[existingHistoryIndex].updatedAt =
                        new Date();
                } else {
                    // Add new history entry
                    studentDoc.examHistory.push({
                        examDate: new Date(dateKey + "T00:00:00.000Z"),
                        courseName: courseName || "Unknown Course",
                        courseId: courseId,
                        teacherId: teacherId,
                        attended: !!student.attended,
                        examTime: student.examTime || eventExamTime || "",
                        examMunicipality:
                            student.examMunicipality ||
                            eventExamMunicipality ||
                            "",
                        examLocation:
                            student.examLocation || eventExamLocation || "",
                        recordedAt: new Date(),
                        recordedBy: req.user?._id,
                    });
                }

                studentDoc.attendedExam = !!student.attended;
                studentDoc.paidExamFee = !!student.paidExamFee;

                await studentDoc.save();

                console.log(
                    `✅ Updated attendance for student ${studentDoc.name}: ${student.attended}`
                );
                return {
                    success: true,
                    studentId: student._id,
                    attendanceId: attendanceRecord._id,
                };
            } catch (error) {
                console.error(
                    `❌ Error updating student ${student._id}:`,
                    error
                );
                return {
                    success: false,
                    studentId: student._id,
                    error: error.message,
                };
            }
        });

        const results = await Promise.all(updatePromises);
        const successCount = results.filter((r) => r.success).length;
        const failureCount = results.filter((r) => !r.success).length;

        console.log(
            `📊 Attendance update results: ${successCount} successful, ${failureCount} failed`
        );

        // Note: Events are dynamic and not stored in CalendarEvent collection
        // Exam info is stored in ExamAttendance records and will be retrieved via /calendar-events/syncable

        res.json({
            message: `Attendance updated for ${successCount} students`,
            results,
            successCount,
            failureCount,
        });
    } catch (err) {
        console.error("❌ Error updating attendance/fee:", err);
        res.status(500).json({ error: "Server error" });
    }
});

router.put("/exams/:id/decision", isAuthenticated, hasRole(['admin', 'systemadmin']), async (req, res) => {
    try {
        const { decision, comment } = req.body;
        const examId = req.params.id;

        console.log(`Hantera beslut: ${decision} för examId: ${examId}`);

        // Hämta den befintliga prövningen
        const exam = await Exam.findById(examId).populate("teacherId");
        if (!exam) {
            return res.status(404).json({ error: "Prövning hittades inte." });
        }

        const updateData = { decision, comment };

        switch (decision) {
            case "accept":
                const finalExamDate = calculateExamDate(exam.requestedMonth);
                if (!finalExamDate) {
                    return res
                        .status(400)
                        .json({ error: "Ogiltigt datum för accept" });
                }

                const student = await Student.findOneAndUpdate(
                    { personalNumber: exam.personalNumber },
                    {
                        personalNumber: exam.personalNumber,
                        name: exam.name, // or whatever fields are relevant
                        finalExamDate,
                    },
                    { upsert: true, new: true }
                );

                updateData.status = "scheduled";
                updateData.studentId = student._id;
                break;

            case "deny":
                updateData.status = "denied";
                break;

            default:
                return res.status(400).json({ error: "Ogiltigt beslut." });
        }

        const updatedExam = await Exam.findByIdAndUpdate(examId, updateData, {
            new: true,
        });

        res.json(updatedExam);
    } catch (err) {
        console.error("Fel vid uppdatering av beslut:", err);
        res.status(500).json({ error: "Kunde inte spara beslut." });
    }
});

export default router;

// --- Student exam instances listing ---
// List all exam instances (manual + course-linked) recorded for a student
router.get("/exams/student/:studentId", isAuthenticated, async (req, res) => {
    try {
        const { studentId } = req.params;
        const { default: ExamAttendance } = await import(
            "../models/ExamAttendance.js"
        );

        const records = await ExamAttendance.find({ studentId })
            .populate("teacherId", "userId colorCode")
            .populate({ path: "teacherId.userId", select: "username" })
            .populate("courseId", "courseName")
            .sort({ examDate: -1 })
            .lean();

        const items = records.map((r) => ({
            id: r._id,
            examDate: r.examDate,
            courseName: r.courseName || r.courseId?.courseName || "Okänd kurs",
            attended: !!r.attended,
            examTime: r.examTime || "",
            examMunicipality: r.examMunicipality || "",
            examLocation: r.examLocation || "",
            teacher: r.teacherId?.userId?.username || "Okänd lärare",
        }));

        res.json(items);
    } catch (error) {
        console.error("❌ Failed to list student exams:", error);
        res.status(500).json({ error: "Failed to list student exams" });
    }
});
