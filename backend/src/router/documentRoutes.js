import express from 'express';
import multer from 'multer';
import mongoose from 'mongoose';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import mime from 'mime-types';
import Document from '../models/Document.js';
import { authenticateUser } from '../controllers/authController.js';
import logger from "../utils/logger.js";

const router = express.Router();

// Get __dirname equivalent in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, '../../public/uploads');
try {
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
    logger.info({ uploadsDir }, "Created uploads directory")
  } else {
    logger.info({ uploadsDir }, "Uploads directory exists")
  }
} catch (err) {
  logger.error({ err: err }, "Error creating uploads directory")
}

const DANGEROUS_EXTENSIONS = [
  '.exe', '.dll', '.bat', '.sh', '.js', '.py', '.html', '.htm', '.xhtml', '.php',
  '.jsp', '.asp', '.aspx', '.vbs', '.cmd', '.pl', '.cgi', '.msi', '.jar', '.scr'
];

const fileFilter = (req, file, cb) => {
  const ext = path.extname(file.originalname).toLowerCase();
  const contentType = file.mimetype || mime.lookup(file.originalname) || 'application/octet-stream';
  if (
    DANGEROUS_EXTENSIONS.includes(ext) ||
    contentType.startsWith('text/html') ||
    contentType.startsWith('application/x-msdownload')
  ) {
    req.rejectedFileType = true;
    return cb(null, false);
  }
  cb(null, true);
};

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    try {
      // Ensure directory exists before saving
      if (!fs.existsSync(uploadsDir)) {
        fs.mkdirSync(uploadsDir, { recursive: true });
      }
      cb(null, uploadsDir);
    } catch (err) {
      logger.error({ err: err }, "Error in multer destination")
      cb(err);
    }
  },
  filename: (req, file, cb) => {
    try {
      const unique = Date.now() + '-' + Math.round(Math.random() * 1E9);
      const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_').substring(0, 100);
      const filename = `${unique}-${safeName}`;
      logger.debug({ filename }, "Generated filename")
      cb(null, filename);
    } catch (err) {
      logger.error({ err: err }, "Error in multer filename")
      cb(err);
    }
  }
});

const upload = multer({ 
  storage,
  fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit
  }
});

// Error handling middleware for multer
const handleMulterError = (err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ message: 'Filen är för stor. Max storlek är 10MB.' });
    }
    return res.status(400).json({ message: 'Filuppladdningsfel' });
  }
  if (err) {
    return res.status(500).json({ message: 'Fel vid filuppladdning' });
  }
  next();
};

router.post('/documents/upload', authenticateUser, upload.single('file'), handleMulterError, async (req, res) => {
  try {
    if (req.rejectedFileType) {
      return res.status(400).json({ message: 'Ogiltigt filformat. Denna filtyp är inte tillåten av säkerhetsskäl.' });
    }
    
    if (!req.file) {
      return res.status(400).json({ message: 'File is missing in the request' });
    }
    
    logger.info({ file: req.file, bodyKeys: req.body ? Object.keys(req.body) : [], user: req.user }, "File upload details")

    const { studentId, teacherId, type, enrollmentId } = req.body;
    const user = req.user;
    
    if (!user || !user.userId) {
      return res.status(401).json({ message: 'User not authenticated' });
    }
    
    const isAdmin = user.role === 'admin' || user.role === 'systemadmin';

    // Determine if this is for a student or teacher
    if (studentId) {
      // Student document upload
      // Validate that studentId is provided
      if (!studentId || studentId.trim() === '') {
        return res.status(400).json({ message: 'studentId is required' });
      }
      
      // Permission check: students can upload for themselves, admins/systemadmins can upload for any student
      const userIdStr = String(user.userId);
      const studentIdStr = String(studentId);
      
      if (!isAdmin && userIdStr !== studentIdStr) {
        return res.status(403).json({ message: 'Du har inte behörighet att ladda upp dokument för denna elev' });
      }
      
      const doc = await Document.create({
        student: studentId,
        uploadedBy: user.userId,
        filename: req.file.filename,
        originalName: req.file.originalname,
        type: type || 'GENERAL',
        enrollmentId: enrollmentId || null,
      });
      return res.status(201).json(doc);
    } else if (teacherId) {
      // Teacher document upload
      // Check permissions: teacher can upload for themselves, admins can upload for any teacher
      const userIdStr = String(user.userId);
      const teacherIdStr = String(teacherId);
      
      logger.debug({ userIdStr, teacherIdStr, isAdmin }, "Permission check for teacher document")
      
      if (!isAdmin && userIdStr !== teacherIdStr) {
        return res.status(403).json({ message: 'Du har inte behörighet att ladda upp dokument för denna lärare' });
      }

      // Validate that teacherId is provided
      if (!teacherId || teacherId.trim() === '') {
        return res.status(400).json({ message: 'teacherId is required' });
      }

      logger.debug({ teacher: teacherId, uploadedBy: user.userId, filename: req.file.filename, originalName: req.file.originalname, type: type || 'TEACHER_DOCUMENT' }, "Creating teacher document")

      const doc = await Document.create({
        teacher: teacherId,
        uploadedBy: user.userId,
        filename: req.file.filename,
        originalName: req.file.originalname,
        type: type || 'TEACHER_DOCUMENT',
        enrollmentId: null,
      });
      
      logger.info({ docId: doc._id }, "Document created successfully")
      return res.status(201).json(doc);
    } else {
      return res.status(400).json({ message: 'Either studentId or teacherId must be provided' });
    }
    
    // Additional validation: ensure at least one of student or teacher is set
    // (This should never happen due to the checks above, but adding as a safety measure)
    if (!studentId && !teacherId) {
      return res.status(400).json({ message: 'Either studentId or teacherId must be provided' });
    }
  } catch (error) {
    logger.error({ err: error }, "Error during upload")
    
    // Handle validation errors specifically
    if (error.name === 'ValidationError' || error instanceof mongoose.Error.ValidationError || error.message?.includes('must be specified')) {
      const errorMessages = error.errors ? Object.values(error.errors).map(e => e.message || e).join(', ') : '';
      return res.status(400).json({ 
        message: 'Valideringsfel', 
        ...(errorMessages && { error: errorMessages })
      });
    }
    
    // Handle other mongoose errors
    if (error.name === 'CastError') {
      return res.status(400).json({ 
        message: 'Ogiltigt ID-format', 
        error: error.message
      });
    }
    
    res.status(500).json({ 
      message: 'Kunde inte ladda upp dokumentet',
      ...(process.env.NODE_ENV !== 'production' && { error: error.message })
    });
  }
});

router.get('/documents/:id', authenticateUser, async (req, res) => {
  try {
    const { type, enrollmentId, entityType } = req.query;
    const id = req.params.id;

    const user = req.user;

    // Students can only access their own documents; staff can access any
    if (user.role === 'student' && String(user.userId) !== String(id)) {
      return res.status(403).json({ message: 'Du har inte behörighet att visa denna elevs dokument' });
    }

    let filter = {};

    // Determine if this is for a student or teacher
    if (entityType === 'teacher' || entityType === 'Lärare') {
      filter.teacher = id;
    } else {
      // Default to student for backward compatibility
      filter.student = id;
    }

    if (type) {
      filter.type = type;
    }

    if (enrollmentId) {
      filter.enrollmentId = enrollmentId;
    }

    const docs = await Document.find(filter).sort({ createdAt: -1 });
    res.json(docs);
  } catch (error) {
    logger.error({ err: error }, "Error fetching documents")
    res.status(500).json({ message: 'Kunde inte hämta dokument' });
  }
});

router.delete('/documents/:id', authenticateUser, async (req, res) => {
  try {
    const doc = await Document.findById(req.params.id);
    if (!doc) {
      return res.status(404).json({ message: 'Dokument hittades inte' });
    }

    const user = req.user;
    const isAdmin = user.role === 'admin' || user.role === 'systemadmin';

    // Check permissions: user can delete their own uploads, admins can delete any
    if (!isAdmin && doc.uploadedBy?.toString() !== user.userId) {
      return res.status(403).json({ message: 'Du har inte behörighet att radera detta dokument' });
    }

    await Document.findByIdAndDelete(req.params.id);
    res.json({ message: 'Raderad' });
  } catch (error) {
    logger.error({ err: error }, "Error deleting document")
    res.status(500).json({ message: 'Kunde inte radera dokumentet' });
  }
});

export default router;
