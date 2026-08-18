// models/Notification.js
import mongoose from "mongoose";

const notificationSchema = new mongoose.Schema({
  type: { type: String, required: true }, // t.ex. "grades_pending"
  resolved: { type: Boolean, default: false }, // Legacy field - kept for backwards compatibility
  message: String,
  studentId: { type: mongoose.Schema.Types.ObjectId, ref: "Student" },
  courseId: { type: mongoose.Schema.Types.ObjectId, ref: "Course" },
  createdAt: { type: Date, default: Date.now },
  resolvedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" }, // Legacy field
  resolvedByUsers: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }], // Array of user IDs who have resolved this notification
  teacher: { type: mongoose.Schema.Types.ObjectId, ref: "Teacher" }, // Teacher record ID for filtering
  createdByAdmin: { type: mongoose.Schema.Types.ObjectId, ref: "User" }, // Admin who created this notification (for dropout notifications)
  examId: { type: mongoose.Schema.Types.ObjectId, ref: "Exam" }, // Prövning (exam) the notification refers to
    // Nytt fält för flexibel metadata
    meta: {
      studentId: { type: mongoose.Schema.Types.ObjectId, ref: "Student" },
      courseId: { type: mongoose.Schema.Types.ObjectId, ref: "Course" },
      teacherId: { type: mongoose.Schema.Types.ObjectId, ref: "User" }, // User ID for reference
      studentUserId: { type: mongoose.Schema.Types.ObjectId, ref: "User" }, // User ID of the student's login account
      catalogId: { type: mongoose.Schema.Types.ObjectId, ref: "GradeCatalog" }, // Betygskatalog (Scrive)
      documentId: { type: String }, // Scrive Document ID
      url: { type: String }, // för direktlänk i frontend
    }
});

export default mongoose.model("Notification", notificationSchema, "notifications");