/**
 * @file studentRoutes.js
 * @description Contains all student-related routes for CRUD operations, grading,
 * comment handling, education assignment, dropout notifications, and APL tracking.
 * Uses Mongoose models and Express routing.
 */

import { Router } from "express";
import mongoose from "mongoose";
import { GridFSBucket } from "mongodb";
import Student from "../models/Student.js";
import StudentEnrollment from "../models/StudentEnrollment.js";
import Program from "../models/Program.js";
import Course from "../models/Course.js";
import Notification from "../models/Notification.js";
import CoursePackage from "../models/CoursePackage.js";
import { authenticateUser } from "../controllers/authController.js";
import { hasCommentPermission } from "../utils/roles.js";
import User from "../models/User.js";
import { sendDropoutNotification } from "../controllers/notificationController.js";

const router = Router();

router.get("/students/by-teacher/:teacherId", authenticateUser, async (req, res) => {
    try {
        const students = await Student.find({
            teacherId: req.params.teacherId,
            dropout: { $ne: true }, // 👈 Lägg till detta filter!
        });

        res.json(
            students.map((s) => ({
                _id: s._id,
                name: s.name,
                personalNumber: s.personalNumber,
                attended: s.attendedExam || false,
                additionalInfo: s.additionalInfo || "",
            }))
        );
    } catch (error) {
        console.error("❌ Error fetching students by teacher:", error.message);
        res.status(500).json({ message: "Server error" });
    }
});

/**
 * @route   PUT /students/:studentId/education/:educationId/status
 * @desc    Updates the status of a student's education entry. Sends a notification if status is 'Avbrott'.
 * @access  Public
 */
router.put(
    "/students/:studentId/education/:educationId/status",
    authenticateUser,
    async (req, res) => {
        const { studentId, educationId } = req.params;
        const { status } = req.body;

        try {
            const student = await Student.findById(studentId);
            if (!student)
                return res.status(404).json({ message: "Student not found" });

            const education = student.education.find(
                (e) => e.refId.toString() === educationId
            );
            if (!education)
                return res
                    .status(404)
                    .json({ message: "Education not found for student" });

            education.status = status;

            if (status === "Avbrott") {
                student.dropout = true;

                const notification = await sendDropoutNotification({
                    student,
                    education,
                });
                console.log("Notification sent:", notification);
                await student.save();
                return res.status(200).json({
                    message: "Status updated and notification sent",
                    notification,
                });
            } else {
                student.dropout = false; // (om du vill nollställa annars)
                await student.save();
                return res
                    .status(200)
                    .json({ message: "Status updated successfully" });
            }
        } catch (error) {
            console.error("Error updating status:", error);
            res.status(500).json({ message: "Server error" });
        }
    }
);

/**
 * @route   GET /students
 * @desc    Fetch all students with populated education references and comment visibility info.
 * @access  Protected
 */
router.get("/students", authenticateUser, async (req, res) => {
    try {
        let query = {};

        // Check if user has coordinator role (even if not primary)
        const userRoles = req.user.roles || (req.user.role ? [req.user.role] : []);
        const hasCoordinatorRole = userRoles.includes("coordinator");
        const isTeacher = req.user.role === "teacher" || userRoles.includes("teacher");

        // If user is a teacher BUT NOT a coordinator, filter students by their teacherId
        // Coordinators should see all students regardless of teacher role
        if (isTeacher && !hasCoordinatorRole) {
            // Find the teacher record for this user
            const Teacher = mongoose.model("Teacher");
            const teacher = await Teacher.findOne({ userId: req.user.userId });

            if (!teacher) {
                return res
                    .status(403)
                    .json({ error: "Teacher profile not found" });
            }

            // Filter students by this teacher's ID
            query.teacherId = teacher._id;
            console.log(`🔍 Teacher ${teacher._id} fetching their students`);
        } else if (hasCoordinatorRole) {
            console.log(`🔍 Coordinator ${req.user.email} fetching all students`);
        }

        const students = await Student.find(query).lean();
        for (const student of students) {
            // Fetch enrollments and use them as the education entries
            const enrollments = await mongoose
                .model("StudentEnrollment")
                .find({ studentId: student._id })
                .populate("mainCourseId")
                .populate("coursePackageId")
                .populate("programId")
                .lean();

            const enrollmentEducation = enrollments
                .map((enrollment) => {
                    if (enrollment.mainCourseId) {
                        return {
                            _id: enrollment._id,
                            type: "Course",
                            refId: enrollment.mainCourseId,
                            name: enrollment.mainCourseId.courseName,
                            startDate: enrollment.startDate,
                            endDate: enrollment.endDate,
                            finalExamDate: enrollment.slutprovDate,
                            status: enrollment.status,
                            grade: enrollment.grade,
                            comments: enrollment.notes,
                            enrollmentId: enrollment._id,
                            courseInstanceId: enrollment.courseInstanceId,
                            addedAt: enrollment.createdAt,
                            addedBy: enrollment.teacherId || "System",
                            isEnrollment: true,
                        };
                    } else if (enrollment.coursePackageId) {
                        return {
                            _id: enrollment._id,
                            type: "CoursePackage",
                            refId: enrollment.coursePackageId,
                            name: enrollment.coursePackageId.coursePackageName,
                            startDate: enrollment.startDate,
                            endDate: enrollment.endDate,
                            finalExamDate: enrollment.slutprovDate,
                            status: enrollment.status,
                            grade: enrollment.grade,
                            comments: enrollment.notes,
                            enrollmentId: enrollment._id,
                            courseInstanceId: enrollment.courseInstanceId,
                            addedAt: enrollment.createdAt,
                            addedBy: enrollment.teacherId || "System",
                            isEnrollment: true,
                        };
                    } else if (enrollment.programId) {
                        return {
                            _id: enrollment._id,
                            type: "Program",
                            refId: enrollment.programId,
                            name: enrollment.programId.programName,
                            startDate: enrollment.startDate,
                            endDate: enrollment.endDate,
                            finalExamDate: enrollment.slutprovDate,
                            status: enrollment.status,
                            grade: enrollment.grade,
                            comments: enrollment.notes,
                            enrollmentId: enrollment._id,
                            courseInstanceId: enrollment.courseInstanceId,
                            addedAt: enrollment.createdAt,
                            addedBy: enrollment.teacherId || "System",
                            isEnrollment: true,
                        };
                    }
                    return null;
                })
                .filter(Boolean);

            // Merge in any CoursePackage entries stored on the student (for APL filtering)
            const originalEducation = Array.isArray(student.education)
                ? student.education
                : [];
            const packageEntries = originalEducation
                .filter((e) => e && e.type === "CoursePackage" && e.refId)
                .map((e) => ({
                    _id: e._id,
                    type: "CoursePackage",
                    refId: e.refId,
                    name: e.name,
                    startDate: e.startDate,
                    endDate: e.endDate,
                    finalExamDate: e.finalExamDate,
                    status: e.status,
                    grade: e.grade,
                    comments: e.comments,
                    enrollmentId: e.enrollmentId,
                    courseInstanceId: e.courseInstanceId,
                    addedAt: e.addedAt,
                    addedBy: e.addedBy,
                    isEnrollment: false,
                }));

            // Deduplicate by type+refId+dates
            const mergedEducation = [...enrollmentEducation];
            for (const pkg of packageEntries) {
                const exists = mergedEducation.some(
                    (x) =>
                        x.type === "CoursePackage" &&
                        String(x.refId?._id || x.refId) === String(pkg.refId) &&
                        String(new Date(x.startDate).getTime() || "") ===
                            String(new Date(pkg.startDate).getTime() || "") &&
                        String(new Date(x.endDate).getTime() || "") ===
                            String(new Date(pkg.endDate).getTime() || "")
                );
                if (!exists) mergedEducation.push(pkg);
            }

            // Synthesize CoursePackage entries from enrollments referencing a package (fallback)
            const enrollmentsWithPackage = enrollments.filter(
                (enr) => !!enr.coursePackageId
            );
            if (
                enrollmentsWithPackage.length > 0 &&
                !mergedEducation.some((e) => e.type === "CoursePackage")
            ) {
                const byPkg = new Map();
                for (const enr of enrollmentsWithPackage) {
                    const key = String(
                        enr.coursePackageId._id || enr.coursePackageId
                    );
                    if (!byPkg.has(key)) byPkg.set(key, []);
                    byPkg.get(key).push(enr);
                }
                for (const [pkgId, arr] of byPkg.entries()) {
                    const startMs = Math.min(
                        ...arr
                            .map((e) => new Date(e.startDate || 0).getTime())
                            .filter((n) => !isNaN(n))
                    );
                    const endMs = Math.max(
                        ...arr
                            .map((e) => new Date(e.endDate || 0).getTime())
                            .filter((n) => !isNaN(n))
                    );
                    const pkgDoc = await CoursePackage.findById(pkgId).lean();
                    mergedEducation.push({
                        _id: undefined,
                        type: "CoursePackage",
                        refId: pkgDoc || pkgId,
                        name: pkgDoc?.coursePackageName,
                        startDate: isFinite(startMs)
                            ? new Date(startMs)
                            : undefined,
                        endDate: isFinite(endMs) ? new Date(endMs) : undefined,
                        status: arr[0]?.status,
                        grade: null,
                        comments: undefined,
                        enrollmentId: undefined,
                        courseInstanceId: undefined,
                        addedAt: undefined,
                        addedBy: undefined,
                        isEnrollment: false,
                    });
                }
            }

            // Final education list
            student.education = mergedEducation;
        }
        res.status(200).json(students);
    } catch (error) {
        console.error("❌ Error fetching students:", error);
        res.status(500).json({ error: "Server error" });
    }
});

/**
 * @route   POST /student
 * @desc    Adds a new student to the database and creates enrollments for grading.
 * @access  Public
 */
router.post("/student", authenticateUser, async (req, res) => {
    try {
        console.log(
            "📥 Creating student with payload:",
            JSON.stringify(req.body, null, 2)
        );

        if (
            !req.body ||
            !req.body.name ||
            !req.body.email ||
            !req.body.personalNumber
        ) {
            return res.status(400).json({ error: "Missing required fields" });
        }

        const student = new Student(req.body);
        const savedStudent = await student.save();

        console.log("✅ Student saved:", {
            id: savedStudent._id,
            name: savedStudent.name,
            email: savedStudent.email,
            aplStatus: savedStudent.aplStatus,
            education: savedStudent.education,
        });

        // If education entries exist, create StudentEnrollment records for grading
        if (req.body.education && req.body.education.length > 0) {
            const CourseMatchingService = await import(
                "../utils/courseMatchingService.js"
            );

            try {
                const enrollmentResult =
                    await CourseMatchingService.default.processStudentEducation(
                        savedStudent._id,
                        req.body.education,
                        req.body.createdBy || null
                    );

                console.log(
                    `✅ Created ${
                        enrollmentResult?.enrollments?.length || 0
                    } enrollments for student ${savedStudent.name}`
                );
            } catch (enrollmentError) {
                console.error(
                    "❌ Error creating enrollments:",
                    enrollmentError
                );
                // Don't fail the student creation if enrollment creation fails
            }
        }

        // Sync calendar event if student has finalExamDate
        if (savedStudent.finalExamDate) {
            try {
                const { syncCalendarEventsForStudent } = await import(
                    "../utils/calendarEventSync.js"
                );
                await syncCalendarEventsForStudent(savedStudent._id);
            } catch (calendarError) {
                console.error(
                    "❌ Error syncing calendar event:",
                    calendarError
                );
                // Don't fail the student creation if calendar sync fails
            }
        }

        res.status(201).json(savedStudent);
    } catch (error) {
        console.error("❌ Error adding student:", error.message);
        res.status(500).json({ error: "Failed to add student" });
    }
});

/**
 * @route   POST /student/:studentId/addcourse
 * @desc    Adds a course to a student's education array.
 * @access  Public
 */
router.post("/student/:studentId/addcourse", authenticateUser, async (req, res) => {
    const { studentId } = req.params;
    const { courseId } = req.body;

    try {
        const student = await Student.findById(studentId);
        if (!student)
            return res.status(404).json({ error: "Student not found" });

        const course = await Course.findById(courseId);
        if (!course) return res.status(404).json({ error: "Course not found" });

        // Check if the course already exists in the student's education
        const alreadyExists = student.education.some(
            (entry) =>
                entry.type === "Course" && entry.refId.toString() === courseId
        );

        if (alreadyExists) {
            return res.status(400).json({ error: "Course already exists" });
        }

        // Add course to the student's education
        student.education.push({
            type: "Course",
            refId: course._id,
            grade: "", // Default grade if needed
        });

        // Save the updated student document
        await student.save();

        // Return the updated student with populated education references
        const updatedStudent = await Student.findById(studentId).populate({
            path: "education.refId",
            model: "Course", // populate the course details
            select: "courseName courseCode coursePoints courseExtent",
        });

        res.status(200).json(updatedStudent);
    } catch (error) {
        console.error("❌ Error adding course to student:", error);
        res.status(500).json({ error: "Server error" });
    }
});

/**
 * @route   POST /student/:studentId/setprogram
 * @desc    Assigns a program to a student.
 * @access  Public
 */
router.post("/student/:studentId/setprogram", authenticateUser, async (req, res) => {
    const { studentId } = req.params;
    const { programId } = req.body;

    try {
        const student = await Student.findById(studentId);
        if (!student)
            return res.status(404).json({ error: "Student not found" });

        student.program = { programId, grade: null };
        await student.save();

        res.status(200).json(student);
    } catch (error) {
        console.error("❌ Error:", error);
        res.status(500).json({ error: "Server error" });
    }
});

/**
 * @route   POST /student/:studentId/addcoursepackage
 * @desc    Adds a course package to a student.
 * @access  Public
 */
router.post("/student/:studentId/addcoursepackage", authenticateUser, async (req, res) => {
    const { studentId } = req.params;
    const { coursePackageId } = req.body;

    try {
        const student = await Student.findById(studentId);

        if (!student)
            return res.status(404).json({ error: "Student not found" });

        student.coursePackages.push({ coursePackageId, grade: null });
        await student.save();

        res.status(200).json(student);
    } catch (error) {
        console.error("❌ Error:", error);
        res.status(500).json({ error: "Server error" });
    }
});

/**
 * @route   DELETE /student/:id/courses/:courseId
 * @desc    Removes a course from a student's courses array.
 * @access  Public
 */
router.delete("/student/:id/courses/:courseId", authenticateUser, async (req, res) => {
    try {
        const student = await Student.findById(req.params.id);
        if (!student)
            return res.status(404).json({ error: "Student not found" });

        student.courses = student.courses.filter(
            (course) => course.courseId.toString() !== req.params.courseId
        );
        await student.save();

        res.json({ message: "Course removed successfully" });
    } catch (error) {
        console.error("❌ Error removing course:", error);
        res.status(500).json({ error: "Failed to remove course." });
    }
});

/**
 * @route   GET /student/:id
 * @desc    Fetches a single student with populated fields.
 * @access  Public
 */
router.get("/student/:id", authenticateUser, async (req, res) => {
    try {
        const student = await Student.findById(req.params.id)
            .select("+commentHistory.seenBy")
            .lean();

        if (!student)
            return res.status(404).json({ error: "Student not found" });

        res.json(student);
    } catch (error) {
        console.error("❌ Error fetching student:", error);
        res.status(500).json({ error: "Failed to fetch student details" });
    }
});

/**
 * @route   GET /student/:id/basic
 * @desc    Fetches a single student with only basic fields (no populate).
 * @access  Public
 */
router.get("/student/:id/basic", authenticateUser, async (req, res) => {
    try {
        const student = await Student.findById(req.params.id)
            .select(
                "name personalNumber teacherId aplStatus startDate endDate finalExamDate examTime examMunicipality examLocation dropout"
            )
            .lean();

        if (!student)
            return res.status(404).json({ error: "Student not found" });

        res.json(student);
    } catch (error) {
        console.error("❌ Error fetching basic student:", error);
        res.status(500).json({
            error: "Failed to fetch basic student details",
        });
    }
});

/**
 * Helper function to delete all files associated with a student from GridFS
 * @param {string} studentId - The student ID (can be string or ObjectId)
 * @returns {Promise<number>} - Number of files deleted
 */
async function deleteStudentFiles(studentId) {
    try {
        const db = mongoose.connection.db;
        const bucket = new GridFSBucket(db, { bucketName: 'fs' });
        
        // Find all files for this student
        const files = await db.collection('fs.files')
            .find({ 'metadata.studentId': studentId.toString() })
            .toArray();
        
        let deletedCount = 0;
        
        // Delete each file
        for (const file of files) {
            try {
                await bucket.delete(file._id);
                deletedCount++;
                console.log(`🗑️ Deleted file ${file._id} (${file.filename}) for student ${studentId}`);
            } catch (err) {
                console.error(`❌ Failed to delete file ${file._id}:`, err);
            }
        }
        
        if (deletedCount > 0) {
            console.log(`✅ Deleted ${deletedCount} file(s) for student ${studentId}`);
        }
        
        return deletedCount;
    } catch (error) {
        console.error(`❌ Error deleting files for student ${studentId}:`, error);
        // Don't throw - we still want to delete the student even if file deletion fails
        return 0;
    }
}

/**
 * @route   DELETE /student/:id
 * @desc    Deletes a specific student and all associated files.
 * @access  Public
 */
router.delete("/student/:id", authenticateUser, async (req, res) => {
    try {
        if (!["admin", "systemadmin"].includes(req.user?.role)) {
            return res.status(403).json({ error: "Insufficient permissions to delete a student." });
        }
        const studentId = req.params.id;
        
        // First, delete all files associated with this student
        const deletedFilesCount = await deleteStudentFiles(studentId);
        
        // Then delete the student
        const deletedStudent = await Student.findByIdAndDelete(studentId);
        if (!deletedStudent) {
            return res.status(404).json({ error: "Student not found" });
        }

        console.log(`✅ Deleted student ${deletedStudent.name} (${studentId}) and ${deletedFilesCount} associated file(s)`);
        res.json({ 
            message: "Student deleted successfully",
            deletedFilesCount 
        });
    } catch (error) {
        console.error("❌ Error deleting student:", error);
        res.status(500).json({ error: "Failed to delete student" });
    }
});

/**
 * @route   DELETE /students
 * @desc    Deletes all student records and their associated files.
 * @access  Public
 */
router.delete("/students", authenticateUser, async (req, res) => {
    try {
        if (!["admin", "systemadmin"].includes(req.user?.role)) {
            return res.status(403).json({ error: "Insufficient permissions to delete all students." });
        }
        // Get all student IDs before deletion
        const allStudents = await Student.find({}, { _id: 1 }).lean();
        const studentIds = allStudents.map(s => s._id.toString());
        
        // Delete all files for all students
        let totalDeletedFiles = 0;
        for (const studentId of studentIds) {
            const deletedCount = await deleteStudentFiles(studentId);
            totalDeletedFiles += deletedCount;
        }
        
        // Then delete all students
        await Student.deleteMany({});
        
        console.log(`✅ Deleted all students and ${totalDeletedFiles} associated file(s)`);
        res.json({ 
            message: "All students deleted successfully",
            deletedFilesCount: totalDeletedFiles
        });
    } catch (error) {
        console.error("❌ Error deleting all students:", error);
        res.status(500).json({ error: "Failed to delete all students" });
    }
});

/**
 * @route   PATCH /students/:id
 * @desc    Updates APL status and tracks changes.
 * @access  Protected
 */
router.patch("/students/:id", authenticateUser, async (req, res) => {
    const { aplStatus } = req.body;
    const userId = req.user?.userId;

    try {
        const student = await Student.findById(req.params.id);
        if (!student) {
            return res.status(404).json({ error: "Student not found" });
        }

        // 🔒 Only allow aplStatus to be changed
        if (typeof aplStatus === "string") {
            student.aplStatus = aplStatus;
            student.aplStatusHistory.push({
                status: aplStatus,
                changedAt: new Date(),
                changedBy: userId,
            });

            await student.save();
            return res.json(student);
        } else {
            return res.status(400).json({ error: "Invalid APL status update" });
        }
    } catch (err) {
        console.error("❌ Failed to update APL status:", err);
        return res.status(500).json({ error: "Failed to update APL status" });
    }
});

/**
 * @route   POST /students/:id/comment
 * @desc    Adds a comment to a student's commentHistory.
 * @access  Protected
 */
router.post("/students/:id/comment", authenticateUser, async (req, res) => {
    const { comment } = req.body;
    const { userId, role, name } = req.user;

    if (!hasCommentPermission(role)) {
        return res
            .status(403)
            .json({ error: "Insufficient permissions to comment." });
    }

    try {
        const student = await Student.findById(req.params.id);
        if (!student)
            return res.status(404).json({ error: "Student not found" });

        student.commentHistory.unshift({
            comment,
            author: name,
            date: new Date(),
            seenBy: [new mongoose.Types.ObjectId(userId)],
        });

        await student.save();
        res.status(200).json({ commentHistory: student.commentHistory });
    } catch (err) {
        console.error("❌ Failed to save comment:", err);
        res.status(500).json({ error: "Failed to add comment" });
    }
});

/**
 * @route   PUT /students/:id/comment
 * @desc    Edits a comment in a student's commentHistory.
 * @access  Protected (admin/systemadmin only)
 */
router.put("/students/:id/comment", authenticateUser, async (req, res) => {
    const { index, updatedEntry } = req.body;
    const { role } = req.user;

    if (!["admin", "systemadmin"].includes(role)) {
        return res
            .status(403)
            .json({ error: "You don't have permission to edit comments." });
    }

    const student = await Student.findById(req.params.id);
    if (!student || !student.commentHistory[index]) {
        return res.status(404).json({ error: "Comment not found." });
    }

    student.commentHistory[index] = updatedEntry;
    await student.save();
    res.json({ success: true });
});

/**
 * @route   DELETE /students/:id/comment
 * @desc    Deletes a comment from a student's commentHistory.
 * @access  Protected (admin/systemadmin only)
 */
router.delete("/students/:id/comment", authenticateUser, async (req, res) => {
    const { index } = req.body;
    const { role } = req.user;

    if (!["admin", "systemadmin"].includes(role)) {
        return res
            .status(403)
            .json({ error: "You don't have permission to delete comments." });
    }

    const student = await Student.findById(req.params.id);
    if (!student || !student.commentHistory[index]) {
        return res.status(404).json({ error: "Comment not found." });
    }

    student.commentHistory.splice(index, 1);
    await student.save();
    res.json({ success: true });
});

/**
 * @route   PUT /student/:id
 * @desc    Updates full student object (excluding Mongo ID).
 * @access  Public
 */
router.put("/student/:id", authenticateUser, async (req, res) => {
    console.log("📥 Received payload:", req.body);

    const allowedFields = [
        "name",
        "personalNumber",
        "additionalInfo",
        "aplStatus",
        "phone",
        "email",
        "exam",
        "teacher",
        "teacherId",
        "dropout",
        "attendedExam",
        "paidExamFee",
        "startDate",
        "endDate",
        "finalExamDate",
        "examMunicipality",
        "examLocation",
        "examTime",
        "education", // This will now be processed separately for course, coursePackage, program
    ];

    const updates = {};

    // Process the allowed fields and populate the updates object
    for (const field of allowedFields) {
        if (req.body[field] !== undefined) {
            updates[field] = req.body[field];
        }
    }

    // 🛡️ Special handling for municipality
    if (
        req.body.municipality &&
        typeof req.body.municipality === "object" &&
        typeof req.body.municipality.type === "string"
    ) {
        updates["municipality"] = { type: req.body.municipality.type };
    }

    try {
        const student = await Student.findById(req.params.id);

        if (!student) {
            return res.status(404).json({ error: "Student not found" });
        }

        // Handle education updates through the enrollment system only
        if (req.body.education) {
            const StudentEnrollment = mongoose.model("StudentEnrollment");

            // Process each education entry
            for (const eduData of req.body.education) {
                if (eduData.type === "Course") {
                    // Find existing enrollment for this course
                    const courseId =
                        typeof eduData.refId === "object"
                            ? eduData.refId._id
                            : eduData.refId;
                    const existingEnrollment = await StudentEnrollment.findOne({
                        studentId: student._id,
                        mainCourseId: courseId,
                    });

                    if (existingEnrollment) {
                        // Check if course is being removed
                        if (eduData.removedAt) {
                            // Delete the enrollment
                            await StudentEnrollment.findByIdAndDelete(
                                existingEnrollment._id
                            );
                            console.log(
                                `🗑️ Deleted enrollment for course ${eduData.name}`
                            );
                            continue; // Skip to next course
                        }

                        // Update existing enrollment
                        if (eduData.grade !== undefined)
                            existingEnrollment.grade = eduData.grade;
                        if (
                            eduData.status !== undefined &&
                            eduData.status !== ""
                        )
                            existingEnrollment.status = eduData.status;
                        if (eduData.startDate !== undefined)
                            existingEnrollment.startDate = new Date(
                                eduData.startDate
                            );
                        if (eduData.endDate !== undefined)
                            existingEnrollment.endDate = new Date(
                                eduData.endDate
                            );
                        if (eduData.comments !== undefined)
                            existingEnrollment.notes = eduData.comments;
                        if (eduData.finalExamDate !== undefined)
                            existingEnrollment.slutprovDate = new Date(
                                eduData.finalExamDate
                            );

                        await existingEnrollment.save();
                        console.log(
                            `✅ Updated enrollment for course ${eduData.name}`
                        );
                    } else {
                        // Don't create new enrollment if course is being removed
                        if (eduData.removedAt) {
                            console.log(
                                `⚠️ Course ${eduData.name} marked as removed but no enrollment found - skipping`
                            );
                            continue;
                        }

                        // Create new enrollment
                        try {
                            const CourseMatchingService = await import(
                                "../utils/courseMatchingService.js"
                            );

                            // Ensure refId is in the correct format for CourseMatchingService
                            const eduDataForService = {
                                ...eduData,
                                refId: courseId,
                            };

                            const enrollmentResult =
                                await CourseMatchingService.default.processStudentEducation(
                                    student._id,
                                    [eduDataForService],
                                    req.user?.userId || null
                                );

                            console.log(
                                `✅ Created new enrollment for course ${eduData.name}`
                            );
                        } catch (enrollmentError) {
                            console.error(
                                `❌ Error creating enrollment for course ${eduData.name}:`,
                                enrollmentError
                            );
                        }
                    }
                }
            }

            // Clear the old education array since we're using enrollments now
            updates.education = [];
        }

        if (!student.teacherId && student.teacher) {
            // Försök hitta en Teacher med samma namn
            const foundTeacher = await Teacher.findOne({
                name: student.teacher.trim(),
            });
            if (foundTeacher) {
                updates.teacherId = foundTeacher._id;
                console.log(
                    `🔗 Kopplar ${student.name} till TeacherId: ${foundTeacher._id}`
                );
            } else {
                console.warn(
                    `⚠️ Ingen matchande lärare hittades för namn: ${student.teacher}`
                );
            }
        }

        // Perform the update operation
        const updatedStudent = await Student.findByIdAndUpdate(
            req.params.id,
            { $set: updates },
            { new: true }
        );

        if (!updatedStudent) {
            return res.status(404).json({ error: "Student not found" });
        }

        // Fetch the education data from StudentEnrollment to include in response
        const enrollments = await StudentEnrollment.find({
            studentId: updatedStudent._id,
        })
            .populate("mainCourseId", "courseName")
            .populate("coursePackageId", "packageName")
            .populate("programId", "programName")
            .populate("courseInstanceId", "startDate endDate")
            .sort({ addedAt: 1 });

        // Convert enrollments to education format for frontend compatibility
        const enrollmentEducation = enrollments.map((enrollment) => {
            const baseData = {
                _id: enrollment._id,
                type: enrollment.mainCourseId
                    ? "Course"
                    : enrollment.coursePackageId
                    ? "CoursePackage"
                    : "Program",
                refId:
                    enrollment.mainCourseId ||
                    enrollment.coursePackageId ||
                    enrollment.programId,
                name:
                    enrollment.mainCourseId?.courseName ||
                    enrollment.coursePackageId?.packageName ||
                    enrollment.programId?.programName,
                startDate: enrollment.startDate,
                endDate: enrollment.endDate,
                finalExamDate: enrollment.slutprovDate,
                status: enrollment.status,
                grade: enrollment.grade,
                comments: enrollment.notes,
                enrollmentId: enrollment._id,
                courseInstanceId: enrollment.courseInstanceId?._id,
                addedAt: enrollment.enrollmentDate,
                addedBy: enrollment.teacherId,
                isEnrollment: true,
            };

            return baseData;
        });

        // Add education data to the response
        const responseData = {
            ...updatedStudent.toObject(),
            education: enrollmentEducation,
        };

        res.status(200).json(responseData);
    } catch (error) {
        console.error("❌ Error updating student:", error);
        res.status(500).json({ error: "Failed to update student" });
    }
});

/**
 * @route   POST /students/:id/mark-comments-seen
 * @desc    Marks all comments as seen by the current user.
 * @access  Protected
 */
router.post(
    "/students/:id/mark-comments-seen",
    authenticateUser,
    async (req, res) => {
        try {
            const student = await Student.findById(req.params.id);
            if (!student)
                return res.status(404).json({ error: "Student not found" });

            const userId = req.userId;
            console.log("🔑 userId from session:", userId);
            console.log(
                "🎯 seenBy BEFORE update:",
                student.commentHistory.map((c) => c.seenBy)
            );

            const objectId = new mongoose.Types.ObjectId(userId);
            let updated = false;

            student.commentHistory.forEach((entry, i) => {
                const alreadySeen = (entry.seenBy || []).some((id) =>
                    id.equals(objectId)
                );
                if (!alreadySeen) {
                    entry.seenBy.push(objectId);
                    updated = true;
                }
            });

            if (updated) {
                student.markModified("commentHistory");
                await student.save();
                console.log(
                    "✅ Final seenBy in DB:",
                    student.commentHistory.map((c) => c.seenBy)
                );
            }

            res.json({ message: "Marked as seen", updatedStudent: student });
        } catch (err) {
            console.error("❌ Error in mark-comments-seen:", err);
            res.status(500).json({ error: "Failed to mark comments as seen." });
        }
    }
);

/**
 * @route   PATCH /student/:studentId/education/:educationId/grade
 * @desc    Updates a course grade in a student's education array.
 * @access  Public
 */
router.patch(
    "/student/:studentId/education/:educationId/grade",
    authenticateUser,
    async (req, res) => {
        const { studentId, educationId } = req.params;
        const { grade } = req.body;

        if (!["A", "B", "C", "D", "E", "F"].includes(grade)) {
            return res.status(400).json({ error: "Invalid grade." });
        }

        try {
            const student = await Student.findById(studentId);
            if (!student) {
                return res.status(404).json({ error: "Student not found" });
            }

            // Find the education entry to update based on educationId
            const education = student.education.find(
                (edu) => edu._id.toString() === educationId
            );

            if (!education) {
                return res
                    .status(404)
                    .json({ error: "Education entry not found" });
            }

            // Only update the grade if the type is "Course"
            if (education.type === "Course") {
                education.grade = grade;
            }

            await student.save();

            // Fetch the updated student and populate education data
            const updatedStudent = await Student.findById(studentId).populate(
                "education.refId",
                "courseName courseCode coursePackageName coursePackageCode programName"
            );

            res.status(200).json(updatedStudent);
        } catch (error) {
            console.error("❌ Error updating grade:", error);
            res.status(500).json({ error: "Server error" });
        }
    }
);

/**
 * @route   GET /all-programs
 * @desc    Fetches all available programs.
 * @access  Public
 */
router.get("/all-programs", async (req, res) => {
    const programs = await Program.find().select("programName");
    res.json(programs);
});
/**
 * @route   GET /all-course-packages
 * @desc    Fetches all available course packages.
 * @access  Public
 */
router.get("/all-course-packages", async (req, res) => {
    const packages = await CoursePackage.find().select("coursePackageName");
    res.json(packages);
});
/**
 * @route   GET /all-courses
 * @desc    Fetches all available courses.
 * @access  Public
 */
router.get("/all-courses", async (req, res) => {
    const courses = await Course.find().select("courseName courseCode");
    res.json(courses);
});

/**
 * @route   PUT /student/:id/education/:courseId/grade
 * @desc    Updates the grade of a course in the student's education array.
 * @access  Public
 */
router.put("/student/:id/education/:courseId/grade", authenticateUser, async (req, res) => {
    const { id, courseId } = req.params;
    const { grade } = req.body;

    try {
        // Find the student by ID
        const student = await Student.findById(id);
        if (!student) {
            return res.status(404).json({ error: "Student not found" });
        }

        // Find the course in the student's education array
        const courseIndex = student.education.findIndex(
            (edu) => edu.refId.toString() === courseId
        );

        if (courseIndex === -1) {
            return res
                .status(404)
                .json({ error: "Course not found in student's education" });
        }

        // Update the grade of the course
        student.education[courseIndex].grade = grade;
        student.updatedAt = new Date(); // Update modified date

        await student.save();

        res.status(200).json(student);
    } catch (err) {
        console.error("❌ Error updating grade:", err);
        res.status(500).json({ error: "Failed to update grade" });
    }
});

/**
 * @route   GET /students/earnings
 * @desc    Returns students with non-null education grades (for analytics).
 * @access  Public
 */
router.get("/students/earnings", authenticateUser, async (req, res) => {
    try {
        const students = await Student.find(
            { "education.grade": { $ne: null } }, // only students with grades
            {
                municipality: 1,
                education: 1,
            }
        );
        res.json(students);
    } catch (err) {
        console.error("❌ Failed to fetch earnings students", err);
        res.status(500).json({ error: "Server error" });
    }
});

export default router;
