import express from "express";
import Student from "../models/Student.js";
import Notification from "../models/Notification.js";
import Teacher from "../models/Teacher.js";
import { authenticateUser } from "../controllers/authController.js";
import { hasRole } from "../middleware/auth.js";
import logger from "../utils/logger.js";
const router = express.Router();

const ALLOWED_STAFF_ROLES = ["systemadmin", "admin", "teacher", "coordinator", "syv", "specped", "tester"];

import { evaluateActionPlanStatusAndNotify } from "../controllers/notificationController.js";



router.get("/notifications", authenticateUser, async (req, res) => {
  try {
    // Exclude notifications that this user has already resolved
    // Use $nin (not in) to exclude notifications where current user is in resolvedByUsers array
    const mongoose = (await import("mongoose")).default;
    const userId = mongoose.Types.ObjectId.isValid(req.user.userId) 
      ? new mongoose.Types.ObjectId(req.user.userId) 
      : req.user.userId;
    
    // Query: notifications not resolved by this user
    // $nin works even if resolvedByUsers doesn't exist or is null
    let query = { 
      resolvedByUsers: { $nin: [userId] }
    };
    
    // If user is a student, only show study plan notifications addressed to them
    if (req.user.role === "student") {
      query = { 
        "meta.studentUserId": userId,
        resolvedByUsers: { $nin: [userId] }
      };
      logger.debug({ userId: req.user.userId, name: req.user.name || req.user.username }, "Student fetching their notifications")
    }
    
    // If user is an admin, only show notifications they created (for dropout notifications)
    if (["admin", "systemadmin"].includes(req.user.role)) {
      // For dropout notifications, only show those created by this admin
      // For other notification types, show all (existing behavior)
      query.$or = [
        { type: { $ne: "dropout" } }, // Show all non-dropout notifications
        { 
          type: "dropout",
          createdByAdmin: userId // Only show dropout notifications created by this admin
        }
      ];
      logger.debug({ userId: req.user.userId, name: req.user.name || req.user.username }, "Admin fetching notifications")
      logger.debug("Will only show dropout notifications created by this admin")
    }
    
    // If user is a teacher, filter notifications by their teacherId
    if (req.user.role === "teacher") {
      // Find the teacher record for this user
      const teacher = await Teacher.findOne({ userId: req.user.userId });
      
      if (!teacher) {
        logger.warn({ userId: req.user.userId, name: req.user.name || req.user.username }, "No Teacher record found for user")
        return res.status(403).json({ error: "Teacher profile not found" });
      }
      
      // Filter notifications by this teacher's ID - ensure it's an ObjectId
      const mongoose = (await import("mongoose")).default;
      // Convert teacher._id to ObjectId for consistent comparison
      const teacherObjectId = mongoose.Types.ObjectId.isValid(teacher._id) 
        ? new mongoose.Types.ObjectId(teacher._id) 
        : teacher._id;
      
      query.teacher = teacherObjectId;
      
      logger.debug({ teacherId: teacher._id.toString(), userId: req.user.userId }, "Teacher fetching notifications")
      logger.debug({ queryTeacher: query.teacher.toString(), queryTeacherType: query.teacher.constructor.name, query }, "Query teacher details")
      
      // Debug: Check all dropout notifications to see what teacher IDs they have
      const allDropoutNotifications = await Notification.find({ 
        type: "dropout", 
        resolvedByUsers: { $nin: [userId] } // Not resolved by this user
      });
      logger.debug({ count: allDropoutNotifications.length }, "All dropout notifications in DB")
      for (let idx = 0; idx < allDropoutNotifications.length; idx++) {
        const note = allDropoutNotifications[idx];
        logger.debug({ index: idx + 1, id: note._id, teacher: note.teacher ? note.teacher.toString() : 'MISSING', student: note.meta?.studentId ? note.meta.studentId.toString() : 'MISSING' }, "Dropout notification")
        if (note.teacher) {
          const noteTeacherStr = note.teacher.toString();
          const queryTeacherStr = query.teacher.toString();
          const match = noteTeacherStr === queryTeacherStr;
          logger.debug({ noteTeacherStr, queryTeacherStr, match }, "Teacher ID match check")
          
          // Try direct query for this specific notification
          if (match) {
            const directQuery = await Notification.findOne({
              _id: note._id,
              teacher: query.teacher,
              resolved: false
            });
            logger.debug({ found: !!directQuery }, "Direct query for notification")
          }
        }
      }
    }
    
    // Execute query with explicit ObjectId casting for teacher field if present
    if (query.teacher) {
      // Try query with explicit ObjectId comparison
      const mongoose = (await import("mongoose")).default;
      const notesWithExplicitId = await Notification.find({
        ...query,
        teacher: mongoose.Types.ObjectId.isValid(query.teacher) 
          ? new mongoose.Types.ObjectId(query.teacher) 
          : query.teacher
      });
      logger.debug({ count: notesWithExplicitId.length }, "Query with explicit ObjectId casting found notifications")
      
      // Also try with string comparison as fallback
      const notesWithStringMatch = await Notification.find({
        resolvedByUsers: { $nin: [userId] },
        teacher: { $eq: query.teacher.toString() }
      });
      logger.debug({ count: notesWithStringMatch.length }, "Query with string match found notifications")
    }
    
    const notes = await Notification.find(query);
    logger.debug({ count: notes.length, query }, "Found notifications matching query")
    notes.forEach((note, idx) => {
      logger.debug({ index: idx + 1, type: note.type, teacher: note.teacher ? note.teacher.toString() : 'MISSING', student: note.meta?.studentId ? note.meta.studentId.toString() : 'MISSING', resolved: note.resolved }, "Notification detail")
      if (query.teacher && note.teacher) {
        const noteTeacherId = note.teacher.toString();
        const queryTeacherId = query.teacher.toString();
        const match = noteTeacherId === queryTeacherId;
        logger.debug({ noteTeacherId, queryTeacherId, match }, "Teacher ID match check")
      }
    });

    const uniqueNotes = [];
    const seenTypes = new Set();
    const seenDropouts = new Set();

    for (const note of notes) {
      if (['action_plan_required', 'grades_pending'].includes(note.type)) {
        if (!seenTypes.has(note.type)) {
          uniqueNotes.push(note);
          seenTypes.add(note.type);
        }
      } else if (note.type === 'dropout') {
        // For dropout notifications, use notification ID to ensure uniqueness
        // This prevents showing multiple notifications for the same student
        const noteId = note._id.toString();
        if (!seenDropouts.has(noteId)) {
          uniqueNotes.push(note);
          seenDropouts.add(noteId);
        }
      } else {
        uniqueNotes.push(note);
      }
    }
    
    logger.info({ count: uniqueNotes.length }, "After deduplication: unique notifications");

    res.json(uniqueNotes);
  } catch (err) {
    logger.error({ err }, "Error fetching notifications");
    res.status(500).json({ message: 'Server error' });
  }
});
/*

  
router.put("/notifications/:id/resolve", async (req, res) => {
  const note = await Notification.findById(req.params.id);
  if (!note) return res.status(404).send("Notis hittades inte");

  note.resolved = true;
  note.resolvedBy = req.body.userId; // valfritt
  await note.save();

  // Uppdatera globalnotis-status
  await evaluateActionPlanStatusAndNotify();

  res.json({ message: "Notis markerad som hanterad", note });
});
*/

router.put('/notifications/resolve/:studentId', authenticateUser, hasRole(ALLOWED_STAFF_ROLES), async (req, res) => {
  try {
    const studentId = req.params.studentId;
    await Notification.updateMany(
      { studentId: studentId, type: 'action_plan_required', resolved: false },
      { $set: { resolved: true } }
    );
    res.status(200).json({ message: 'Notification resolved' });
  } catch (error) {
    res.status(500).json({ message: 'Error resolving notification', error });
  }
});


router.put("/notifications/:id/resolve", authenticateUser, async (req, res) => {
  try {
    const note = await Notification.findById(req.params.id);
    
    if (!note) {
      return res.status(404).send("Notis hittades inte");
    }

    // Add current user to resolvedByUsers array (per-user resolution)
    const mongoose = (await import("mongoose")).default;
    const userId = mongoose.Types.ObjectId.isValid(req.user.userId) 
      ? new mongoose.Types.ObjectId(req.user.userId) 
      : req.user.userId;
    
    // Initialize resolvedByUsers if it doesn't exist
    if (!note.resolvedByUsers) {
      note.resolvedByUsers = [];
    }
    
    // Add user to resolvedByUsers if not already there
    const userIdString = userId.toString();
    const isAlreadyResolved = note.resolvedByUsers.some(
      id => id.toString() === userIdString
    );
    
    if (!isAlreadyResolved) {
      note.resolvedByUsers.push(userId);
      await note.save();
      logger.info({ userId: userIdString, notificationId: note._id }, "User resolved notification");
      logger.debug({ resolvedByUsers: note.resolvedByUsers.map(id => id.toString()) }, "ResolvedByUsers after save");
    } else {
      logger.info({ userId: userIdString, notificationId: note._id }, "User already resolved notification");
      logger.debug({ resolvedByUsers: note.resolvedByUsers.map(id => id.toString()) }, "Current resolvedByUsers");
    }
    
    // Reload the note to verify it was saved correctly
    const reloadedNote = await Notification.findById(req.params.id);
    logger.debug({ notificationId: reloadedNote._id }, "Reloaded notification");
    logger.debug({ resolvedByUsers: reloadedNote.resolvedByUsers ? reloadedNote.resolvedByUsers.map(id => id.toString()) : 'MISSING' }, "Reloaded resolvedByUsers");

    // Keep legacy fields for backwards compatibility (set resolved if all users resolved it)
    // For now, we'll keep it false to maintain per-user resolution
    // note.resolved = true; // Don't set globally
    // note.resolvedBy = userId; // Keep for reference

    // Utvärdera och uppdatera global status (if applicable)
    if (note.meta?.studentId && note.meta?.courseId) {
      await evaluateActionPlanStatusAndNotify(note.meta.studentId, note.meta.courseId);
    }

    res.json({ 
      message: "Notis markerad som hanterad", 
      note 
    });
  } catch (error) {
    logger.error({ err: error }, "Error resolving notification");
    res.status(500).json({ 
      message: 'Serverfel vid lösning av notifikation', 
      error: error.message 
    });
  }
});



router.put("/notifications/:id/reset", authenticateUser, async (req, res) => {
    try {
      const note = await Notification.findById(req.params.id);
      if (!note) return res.status(404).send("Notis hittades inte");
  
      // Remove current user from resolvedByUsers array (per-user reset)
      const mongoose = (await import("mongoose")).default;
      const userId = mongoose.Types.ObjectId.isValid(req.user.userId) 
        ? new mongoose.Types.ObjectId(req.user.userId) 
        : req.user.userId;
      
      if (note.resolvedByUsers && note.resolvedByUsers.length > 0) {
        const userIdString = userId.toString();
        note.resolvedByUsers = note.resolvedByUsers.filter(
          id => id.toString() !== userIdString
        );
        await note.save();
        logger.info({ userId: userIdString, notificationId: note._id }, "User reset notification");
      }
  
      res.json({ message: "Notis återställd", note });
    } catch (err) {
      logger.error({ err }, "Error resetting notification");
      res.status(500).send("Serverfel");
    }
  });
  
  
  
  export default router;
  

  

