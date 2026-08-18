import mongoose from "mongoose";

const schema = new mongoose.Schema({
  studentId: { type: mongoose.Schema.Types.ObjectId, required: true, ref: "Student" },
  educationId: { type: String, required: true },
  courseId: { type: mongoose.Schema.Types.ObjectId, ref: "Course" },
  studentName: { type: String },
  courseName: { type: String },
  teacherId: { type: mongoose.Schema.Types.ObjectId, ref: "Teacher" },
  teacherName: { type: String },
  date: { type: String },
  reason: { type: String },
  schoolEfforts: [String],
  studentEfforts: [String],
  studyTime: { type: String },
  meetings: [String],
  notified: [String],
  answers: { type: mongoose.Schema.Types.Mixed },
  pdf: { type: Buffer },
  pdfContentType: { type: String, default: "application/pdf" },
  type: { type: String },
  createdAt: { type: Date, default: Date.now },
  locked: { type: Boolean, default: false }
});

const ActionPlan = mongoose.model("ActionPlan", schema);
export default ActionPlan;