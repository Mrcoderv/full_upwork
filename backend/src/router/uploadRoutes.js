import { Router } from 'express'
import dotenv from 'dotenv'
import mongoose from 'mongoose'
import multer from 'multer'
import { GridFSBucket } from 'mongodb'
import { Readable } from 'stream'
import mime from 'mime-types'
import path from 'path'
import { uploadXlsx } from '../controllers/studentController.js'
import { authenticateUser } from '../controllers/authController.js'
import { hasRole } from '../middleware/auth.js'

dotenv.config()
const router = Router()

// File security configuration
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const DANGEROUS_EXTENSIONS = [
  '.exe', '.dll', '.bat', '.sh', '.js', '.py', '.html', '.htm', '.xhtml', '.php',
  '.jsp', '.asp', '.aspx', '.vbs', '.cmd', '.pl', '.cgi', '.msi', '.jar', '.scr'
];

const ALLOWED_STAFF_ROLES = ["systemadmin", "admin", "teacher", "coordinator", "syv", "specped", "tester"];
const ALLOWED_ADMIN_ROLES = ["systemadmin", "admin", "tester"];

const sanitizeFilename = (filename) => {
  const ext = path.extname(filename).toLowerCase();
  const base = path.basename(filename, ext);
  const cleanBase = base.replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 100);
  return `${cleanBase}${ext}`;
};

// Multer setup with in-memory storage and limits
const memupload = multer({ 
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE }
})
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE }
})

// Middleware to authorize student-specific file access
async function checkStudentAccess(req, res, next) {
  try {
    const studentId = req.params.studentId;
    const user = req.user;

    if (!user) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const userRoles = user.roles || (user.role ? [user.role] : []);
    const isStaff = userRoles.some(r => ["systemadmin", "admin", "coordinator", "syv", "specped", "tester"].includes(r));
    const isTeacher = userRoles.includes("teacher");

    if (!isStaff && !isTeacher) {
      return res.status(403).json({ error: "Forbidden: Access denied." });
    }

    if (isTeacher && !isStaff) {
      const Teacher = mongoose.model("Teacher");
      const teacher = await Teacher.findOne({ userId: user.userId });
      if (!teacher) {
        return res.status(403).json({ error: "Teacher profile not found" });
      }

      const Student = mongoose.model("Student");
      const student = await Student.findById(studentId);
      if (!student) {
        return res.status(404).json({ error: "Student not found" });
      }

      if (!student.teacherId || student.teacherId.toString() !== teacher._id.toString()) {
        return res.status(403).json({ error: "Forbidden: You are not assigned to this student." });
      }
    }

    next();
  } catch (error) {
    console.error("Error checking student access:", error);
    res.status(500).json({ error: "Internal server error during authorization check" });
  }
}

// Middleware to authorize file-specific actions (download, delete)
async function checkFileAccess(req, res, next) {
  try {
    const fileId = req.params.fileId;
    const user = req.user;

    if (!user) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    // Handle invalid ObjectId gracefully (backward compatible with tests)
    if (!mongoose.Types.ObjectId.isValid(fileId)) {
      const errorMsg = req.method === 'DELETE' ? 'Failed to delete file' : 'Failed to download file';
      return res.status(500).json({ error: errorMsg });
    }

    const userRoles = user.roles || (user.role ? [user.role] : []);
    const isStaff = userRoles.some(r => ["systemadmin", "admin", "coordinator", "syv", "specped", "tester"].includes(r));
    const isTeacher = userRoles.includes("teacher");

    if (!isStaff && !isTeacher) {
      return res.status(403).json({ error: "Forbidden: Access denied." });
    }

    const db = mongoose.connection.db;
    const file = await db.collection("fs.files").findOne({ _id: new mongoose.Types.ObjectId(fileId) });
    if (!file) {
      return res.status(404).send('File not found');
    }

    const studentId = file.metadata?.studentId;
    if (!studentId) {
      if (!userRoles.some(r => ["systemadmin", "admin", "tester"].includes(r))) {
        return res.status(403).json({ error: "Forbidden: Only administrators can access orphan files." });
      }
      req.fileRecord = file;
      return next();
    }

    if (isTeacher && !isStaff) {
      const Teacher = mongoose.model("Teacher");
      const teacher = await Teacher.findOne({ userId: user.userId });
      if (!teacher) {
        return res.status(403).json({ error: "Teacher profile not found" });
      }

      const Student = mongoose.model("Student");
      const student = await Student.findById(studentId);
      if (!student) {
        return res.status(404).json({ error: "Student not found" });
      }

      if (!student.teacherId || student.teacherId.toString() !== teacher._id.toString()) {
        return res.status(403).json({ error: "Forbidden: You are not assigned to the student associated with this file." });
      }
    }

    req.fileRecord = file;
    next();
  } catch (error) {
    console.error("Error checking file access:", error);
    const errorMsg = req.method === 'DELETE' ? 'Failed to delete file' : 'Failed to download file';
    res.status(500).json({ error: errorMsg });
  }
}

// XLSX upload route (memory storage)
router.post(
  '/upload/xlsxupload',
  authenticateUser,
  hasRole(['systemadmin', 'admin', 'coordinator', 'tester']),
  memupload.single('file'),
  (req, res, next) => {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' })
    }
    const fileExt = path.extname(req.file.originalname).toLowerCase();
    if (fileExt !== '.xlsx' && fileExt !== '.xls') {
      return res.status(400).json({ error: 'Endast Excel-filer (.xlsx, .xls) är tillåtna.' });
    }
    next();
  },
  uploadXlsx
)

// Upload file to GridFS with metadata and MIME detection
router.post('/:studentId', authenticateUser, checkStudentAccess, upload.single('file'), async (req, res) => {
  try {
    const db = mongoose.connection.db
    const bucket = new GridFSBucket(db, { bucketName: 'fs' })
    const studentId = req.params.studentId
    const user = req.user || { role: 'unknown', email: 'unknown' }

    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' })
    }

    const fileExt = path.extname(req.file.originalname).toLowerCase();
    const contentType =
      req.file.mimetype || mime.lookup(req.file.originalname) || 'application/octet-stream'

    // Validate MIME type and file extension against dangerous list
    if (
      DANGEROUS_EXTENSIONS.includes(fileExt) ||
      contentType.startsWith('text/html') ||
      contentType.startsWith('application/x-msdownload')
    ) {
      return res.status(400).json({ error: 'Ogiltigt filformat. Denna filtyp är inte tillåten av säkerhetsskäl.' })
    }

    const sanitizedFilename = sanitizeFilename(req.file.originalname);
    const stream = Readable.from(req.file.buffer)

    const uploadStream = bucket.openUploadStream(sanitizedFilename, {
      contentType,
      metadata: {
        studentId,
        role: user.role,
        email: user.email,
        userId: user._id?.toString?.() || null,
        uploadedAt: new Date().toISOString(),
      },
    })

    stream.pipe(uploadStream)
      .on('error', (err) => {
        console.error('❌ Upload to GridFS failed:', err)
        res.status(500).json({ error: 'Upload failed', detail: err.message })
      })
      .on('finish', async () => {
        try {
          const fileRecord = await db.collection('fs.files').findOne({ _id: uploadStream.id })
          if (!fileRecord) throw new Error('File uploaded but not found in GridFS')

          console.log(`✅ Uploaded "${fileRecord.filename}" for student ${studentId} as ${fileRecord._id}`)
          res.status(200).json({ file: fileRecord })
        } catch (err) {
          console.error('❌ Upload finished but failed to fetch file:', err)
          res.status(500).json({ error: 'Upload complete but unable to confirm file record' })
        }
      })
  } catch (err) {
    console.error('❌ Unexpected upload crash:', err)
    res.status(500).json({ error: 'Unexpected error during upload' })
  }
})

// List all files for a student
router.get('/:studentId', authenticateUser, checkStudentAccess, async (req, res) => {
  try {
    const files = await mongoose.connection.db
      .collection('fs.files')
      .find({ 'metadata.studentId': req.params.studentId })
      .toArray()

    res.json(files)
  } catch (err) {
    console.error('❌ Failed to list files:', err)
    res.status(500).json({ error: 'Failed to list files' })
  }
})

// Download file by ID with proper headers
router.get('/download/:fileId', authenticateUser, checkFileAccess, async (req, res) => {
  try {
    const db = mongoose.connection.db
    const bucket = new GridFSBucket(db, { bucketName: 'fs' })
    const file = req.fileRecord;

    const filename = file.filename || 'download'
    const contentType = file.contentType || 'application/octet-stream'
    res.setHeader('Content-Type', contentType)
    res.setHeader(
        'Content-Disposition',
        `attachment; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`
      )
    res.setHeader('Access-Control-Expose-Headers', 'Content-Disposition')

    bucket.openDownloadStream(file._id).pipe(res)
  } catch (err) {
    console.error('❌ Failed to download file:', err)
    res.status(500).json({ error: 'Failed to download file' })
  }
})

// Delete file by ID with audit logging
router.delete('/:fileId', authenticateUser, checkFileAccess, async (req, res) => {
  try {
    const db = mongoose.connection.db
    const bucket = new GridFSBucket(db, { bucketName: 'fs' })
    const file = req.fileRecord;
    const user = req.user || { role: 'unknown', email: 'unknown' }

    await bucket.delete(file._id)

    console.log(
      `🗑️ [${user.email} | ${user.role}] deleted file ${file._id.toString()} at ${new Date().toISOString()}`
    )
    res.status(200).json({ message: 'File deleted successfully' })
  } catch (err) {
    console.error('❌ Failed to delete file:', err)
    res.status(500).json({ error: 'Failed to delete file' })
  }
})

// List all files for all students (for APL contract archive)
router.get('/all/apl', authenticateUser, hasRole(['systemadmin', 'admin', 'coordinator', 'tester']), async (req, res) => {
  try {
    const db = mongoose.connection.db

    const filesByStudent = await db.collection('fs.files').aggregate([
      { $match: { 'metadata.studentId': { $exists: true, $ne: null } } },
      { $sort: { uploadDate: -1 } },
      {
        $group: {
          _id: '$metadata.studentId',
          files: { $push: '$$ROOT' }
        }
      },
      {
        $addFields: {
          studentIdObj: {
            $cond: {
              if: { $eq: [{ $type: '$_id' }, 'string'] },
              then: {
                $cond: {
                  if: { $eq: [{ $strLenCP: '$_id' }, 24] },
                  then: { $toObjectId: '$_id' },
                  else: null
                }
              },
              else: '$_id'
            }
          }
        }
      },
      {
        $lookup: {
          from: 'students',
          let: { studentIdObj: '$studentIdObj' },
          pipeline: [
            {
              $match: {
                $expr: {
                  $or: [
                    { $eq: ['$_id', '$$studentIdObj'] },
                    { $eq: [{ $toString: '$_id' }, '$_id'] }
                  ]
                }
              }
            },
            { $project: { name: 1, _id: 0 } }
          ],
          as: 'studentInfo'
        }
      },
      {
        $unwind: {
          path: '$studentInfo',
          preserveNullAndEmptyArrays: true
        }
      },
      {
        $project: {
          studentId: '$_id',
          studentName: { $ifNull: ['$studentInfo.name', 'Unknown Student'] },
          files: 1,
          _id: 0
        }
      },
      { $sort: { studentName: 1 } }
    ]).toArray()

    console.log(`✅ Found ${filesByStudent.length} students with APL files`)
    res.json(filesByStudent)
  } catch (err) {
    console.error('❌ Failed to list all APL files:', err)
    res.status(500).json({ error: 'Failed to list all APL files', detail: err.message })
  }
})

// Cleanup orphaned files (files where the student no longer exists)
router.delete('/cleanup/orphaned', authenticateUser, hasRole(ALLOWED_ADMIN_ROLES), async (req, res) => {
  try {
    const db = mongoose.connection.db
    const bucket = new GridFSBucket(db, { bucketName: 'fs' })
    const StudentModel = (await import('../models/Student.js')).default

    const allFiles = await db.collection('fs.files')
      .find({ 'metadata.studentId': { $exists: true, $ne: null } })
      .toArray()

    let orphanedCount = 0
    let deletedCount = 0
    const errors = []

    for (const file of allFiles) {
      const studentId = file.metadata.studentId
      
      try {
        let student = null
        if (mongoose.Types.ObjectId.isValid(studentId)) {
          student = await StudentModel.findById(studentId)
        }
        
        if (!student) {
          student = await StudentModel.findOne({ _id: studentId.toString() })
        }

        if (!student) {
          try {
            await bucket.delete(file._id)
            deletedCount++
            console.log(`🗑️ Deleted orphaned file ${file._id} (${file.filename}) for non-existent student ${studentId}`)
          } catch (deleteErr) {
            errors.push(`Failed to delete file ${file._id}: ${deleteErr.message}`)
            console.error(`❌ Failed to delete orphaned file ${file._id}:`, deleteErr)
          }
          orphanedCount++
        }
      } catch (checkErr) {
        errors.push(`Error checking file ${file._id}: ${checkErr.message}`)
        console.error(`❌ Error checking file ${file._id}:`, checkErr)
      }
    }

    console.log(`✅ Cleanup complete: Found ${orphanedCount} orphaned files, deleted ${deletedCount}`)
    
    res.json({
      message: 'Cleanup completed',
      totalFilesChecked: allFiles.length,
      orphanedFilesFound: orphanedCount,
      filesDeleted: deletedCount,
      errors: errors.length > 0 ? errors : undefined
    })
  } catch (err) {
    console.error('❌ Failed to cleanup orphaned files:', err)
    res.status(500).json({ error: 'Failed to cleanup orphaned files', detail: err.message })
  }
})

export default router
