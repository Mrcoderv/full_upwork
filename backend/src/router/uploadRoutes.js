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

dotenv.config()
const router = Router()

// File security configuration
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const DANGEROUS_EXTENSIONS = [
  '.exe', '.dll', '.bat', '.sh', '.js', '.py', '.html', '.htm', '.xhtml', '.php',
  '.jsp', '.asp', '.aspx', '.vbs', '.cmd', '.pl', '.cgi', '.msi', '.jar', '.scr'
];

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

// XLSX upload route (memory storage)
router.post('/upload/xlsxupload', authenticateUser, memupload.single('file'), (req, res, next) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' })
  }
  const fileExt = path.extname(req.file.originalname).toLowerCase();
  if (fileExt !== '.xlsx' && fileExt !== '.xls') {
    return res.status(400).json({ error: 'Endast Excel-filer (.xlsx, .xls) är tillåtna.' });
  }
  next();
}, uploadXlsx)

// Upload file to GridFS with metadata and MIME detection
router.post('/:studentId', authenticateUser, upload.single('file'), async (req, res) => {
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
router.get('/:studentId', authenticateUser, async (req, res) => {
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
router.get('/download/:fileId', authenticateUser, async (req, res) => {
  try {
    const db = mongoose.connection.db
    const bucket = new GridFSBucket(db, { bucketName: 'fs' })
    const _id = new mongoose.Types.ObjectId(req.params.fileId)

    const file = await db.collection('fs.files').findOne({ _id })
    if (!file) return res.status(404).send('File not found')

    const filename = file.filename || 'download'
    const contentType = file.contentType || 'application/octet-stream'
    res.setHeader('Content-Type', contentType)
    res.setHeader(
        'Content-Disposition',
        `attachment; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`
      )
    res.setHeader('Access-Control-Expose-Headers', 'Content-Disposition')

    bucket.openDownloadStream(_id).pipe(res)
  } catch (err) {
    console.error('❌ Failed to download file:', err)
    res.status(500).json({ error: 'Failed to download file' })
  }
})

// Delete file by ID with audit logging
router.delete('/:fileId', authenticateUser, async (req, res) => {
  try {
    const db = mongoose.connection.db
    const bucket = new GridFSBucket(db, { bucketName: 'fs' })
    const _id = new mongoose.Types.ObjectId(req.params.fileId)

    const user = req.user || { role: 'unknown', email: 'unknown' }

    await bucket.delete(_id)

    console.log(
      `🗑️ [${user.email} | ${user.role}] deleted file ${_id.toString()} at ${new Date().toISOString()}`
    )
    res.status(200).json({ message: 'File deleted successfully' })
  } catch (err) {
    console.error('❌ Failed to delete file:', err)
    res.status(500).json({ error: 'Failed to delete file' })
  }
})

// List all files for all students (for APL contract archive)
router.get('/all/apl', authenticateUser, async (req, res) => {
  try {
    const db = mongoose.connection.db

    // This aggregation pipeline finds all files, groups them by studentId,
    // and then looks up the student's name from the 'students' collection.
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
          // Try to convert studentId to ObjectId, but handle errors gracefully
          studentIdObj: {
            $cond: {
              if: { $eq: [{ $type: '$_id' }, 'string'] },
              then: {
                $cond: {
                  if: { $eq: [{ $strLenCP: '$_id' }, 24] }, // ObjectId is 24 hex chars
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
                    { $eq: [{ $toString: '$_id' }, '$_id'] } // Also try string comparison
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
          preserveNullAndEmptyArrays: true // Keep students even if lookup fails
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
// Admin only endpoint
router.delete('/cleanup/orphaned', authenticateUser, async (req, res) => {
  try {
    const user = req.user || { role: 'unknown' }
    
    // Check if user is admin
    if (!['admin', 'systemadmin'].includes(user.role)) {
      return res.status(403).json({ error: 'Insufficient permissions. Admin access required.' })
    }

    const db = mongoose.connection.db
    const bucket = new GridFSBucket(db, { bucketName: 'fs' })
    const Student = (await import('../models/Student.js')).default

    // Find all files with studentId metadata
    const allFiles = await db.collection('fs.files')
      .find({ 'metadata.studentId': { $exists: true, $ne: null } })
      .toArray()

    let orphanedCount = 0
    let deletedCount = 0
    const errors = []

    // Check each file to see if the student still exists
    for (const file of allFiles) {
      const studentId = file.metadata.studentId
      
      try {
        // Try to find the student (handle both ObjectId and string IDs)
        let student = null
        if (mongoose.Types.ObjectId.isValid(studentId)) {
          student = await Student.findById(studentId)
        }
        
        // If student not found by ObjectId, try string match
        if (!student) {
          student = await Student.findOne({ _id: studentId.toString() })
        }

        // If student doesn't exist, delete the file
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
