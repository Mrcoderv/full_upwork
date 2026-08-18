import mongoose from 'mongoose';

const DocumentSchema = new mongoose.Schema({
  student: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Student', 
    required: false 
  },
  teacher: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User', // Reference to User (teacher's userId)
    required: false
  },
  uploadedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: false
  },
  filename: { 
    type: String, 
    required: true 
  },
  originalName: { 
    type: String, 
    required: true 
  },
  type: {
    type: String,
    default: 'GENERAL',
    enum: ['GENERAL', 'ACTION_PLAN', 'REPORT', 'COURSE_ARCHIVE', 'TEACHER_DOCUMENT', 'APL_CONTRACT', 'CV']
  },
  enrollmentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'StudentEnrollment',
    default: null,
  },
  createdAt: { 
    type: Date, 
    default: Date.now 
  }
})

// Note: Validation for student/teacher is done in the route handler
// to avoid issues with Document.create() and pre-hooks

export default mongoose.model('Document', DocumentSchema, "documents");
