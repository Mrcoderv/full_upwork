import mongoose from 'mongoose'

const auditLogSchema = new mongoose.Schema(
  {
    entityType: { type: String, required: true, index: true },
    entityId: { type: mongoose.Schema.Types.ObjectId, index: true },
    action: { type: String, required: true },
    description: String,
    performedBy: {
      userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      role: String,
      email: String,
    },
    timestamp: { type: Date, default: Date.now },
  },
  { timestamps: { createdAt: false, updatedAt: false } }
)

const AuditLog = mongoose.model('AuditLog', auditLogSchema)
export default AuditLog
