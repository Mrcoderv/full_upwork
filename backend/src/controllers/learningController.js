import mongoose from "mongoose";
import Student from "../models/Student.js";
import Teacher from "../models/Teacher.js";
import User from "../models/User.js";
import CourseInstance from "../models/CourseInstance.js";
import StudentEnrollment from "../models/StudentEnrollment.js";
import AssignmentSubmission from "../models/AssignmentSubmission.js";
import logger from "../utils/logger.js";

const STAFF_ROLES = ["systemadmin", "admin", "tester"];
const SUBMITTABLE_STATUSES = ["enrolled", "active"];
const FEEDBACK_STATUSES = ["godkänd", "komplettera"];

const getUserRoles = (user) => user?.roles || (user?.role ? [user.role] : []);
const isStaffUser = (user) => getUserRoles(user).some((r) => STAFF_ROLES.includes(r));
const isTeacherUser = (user) => getUserRoles(user).includes("teacher");
const isStudentUser = (user) => getUserRoles(user).includes("student");

const getStudentForUser = async (user) => {
    if (!isStudentUser(user)) return null;
    return Student.findOne({ email: user?.email });
};

const getTeacherForUser = async (user) => {
    if (!isTeacherUser(user) && !isStaffUser(user)) return null;
    if (isStaffUser(user)) return null;
    return Teacher.findOne({ userId: user?.userId });
};

const teacherOwnsInstance = (teacher, instance) => {
    if (!teacher || !instance) return false;
    const own = (id) => id && String(id) === String(teacher._id);
    return own(instance.responsibleTeacher) || own(instance.assistantTeacher);
};

/**
 * GET /learning/instances/:instanceId/modules
 * Lesson content (module sections + instructions) and the optional assignment
 * for each module. A student caller gets their own submissions attached;
 * teachers/staff get the raw modules (submissions live on the submissions routes).
 */
export const getInstanceModules = async (req, res) => {
    try {
        const { instanceId } = req.params;
        if (!mongoose.isValidObjectId(instanceId)) {
            return res.status(400).json({ error: "Invalid course instance id" });
        }

        const instance = await CourseInstance.findById(instanceId);
        if (!instance) {
            return res.status(404).json({ error: "Course instance not found" });
        }

        const user = req.user;
        const isStudent = isStudentUser(user);
        const isTeacher = isTeacherUser(user);
        const isStaff = isStaffUser(user);

        if (!isStudent && !isTeacher && !isStaff) {
            return res.status(403).json({ error: "Forbidden: Access denied." });
        }

        const payload = {
            success: true,
            instance: {
                _id: instance._id,
                courseName: instance.courseName,
                courseCode: instance.courseCode,
            },
            modules: instance.modules || [],
        };

        if (isStudent && !isTeacher && !isStaff) {
            const student = await getStudentForUser(user);
            if (!student) {
                return res.status(403).json({ error: "Ingen elevprofil hittades för kontot" });
            }
            const enrollment = await StudentEnrollment.findOne({
                studentId: student._id,
                courseInstanceId: instance._id,
                status: { $in: SUBMITTABLE_STATUSES },
            });
            if (!enrollment) {
                return res.status(403).json({ error: "Du är inte inskriven på den här kursen" });
            }

            const submissions = await AssignmentSubmission.find({
                studentId: student._id,
                enrollmentId: enrollment._id,
            });
            const byModule = {};
            for (const submission of submissions) {
                byModule[submission.moduleNumber] = submission.toObject();
            }
            payload.submissions = byModule;
            payload.enrollmentId = enrollment._id;
        } else if (isTeacher && !isStaff) {
            const teacher = await getTeacherForUser(user);
            if (!teacher || !teacherOwnsInstance(teacher, instance)) {
                return res.status(403).json({ error: "Du ansvarar inte för den här kursen" });
            }
        }

        res.json(payload);
    } catch (error) {
        logger.error({ err: error }, "Error fetching instance modules");
        res.status(500).json({ error: "Internal server error" });
    }
};

/**
 * POST /learning/instances/:instanceId/modules/:moduleNumber/submissions
 * Create or update the student's submission for one module. Resubmitting
 * replaces the previous attempt and clears any existing feedback.
 * Body: { submittedText, fileId, fileName } — at least one of text/file.
 */
export const submitAssignment = async (req, res) => {
    try {
        const { instanceId, moduleNumber } = req.params;
        const moduleNumberInt = Number(moduleNumber);
        const { submittedText, fileId, fileName } = req.body || {};

        if (!mongoose.isValidObjectId(instanceId) || !Number.isInteger(moduleNumberInt)) {
            return res.status(400).json({ error: "Invalid instance id or module number" });
        }

        const user = req.user;
        if (!isStudentUser(user) || isStaffUser(user)) {
            return res.status(403).json({ error: "Only students can submit assignments" });
        }

        const student = await getStudentForUser(user);
        if (!student) {
            return res.status(403).json({ error: "Ingen elevprofil hittades för kontot" });
        }

        const enrollment = await StudentEnrollment.findOne({
            studentId: student._id,
            courseInstanceId: instanceId,
            status: { $in: SUBMITTABLE_STATUSES },
        });
        if (!enrollment) {
            return res.status(403).json({ error: "Du är inte inskriven på den här kursen" });
        }

        const instance = await CourseInstance.findById(instanceId);
        if (!instance) {
            return res.status(404).json({ error: "Course instance not found" });
        }
        const module = (instance.modules || []).find((m) => m.moduleNumber === moduleNumberInt);
        if (!module) {
            return res.status(404).json({ error: "Modulen finns inte på kursen" });
        }
        if (!module.assignment?.title && !module.assignment?.description) {
            return res.status(400).json({ error: "Den här modulen har ingen inlämningsuppgift" });
        }

        const text = String(submittedText || "").trim();
        const hasFile = fileId && mongoose.isValidObjectId(fileId);
        if (!text && !hasFile) {
            return res.status(400).json({ error: "Ange en text eller ladda upp en fil" });
        }

        const submission = await AssignmentSubmission.findOneAndUpdate(
            { studentId: student._id, enrollmentId: enrollment._id, moduleNumber: moduleNumberInt },
            {
                $set: {
                    courseInstanceId: instance._id,
                    submittedText: text,
                    fileId: hasFile ? fileId : null,
                    fileName: fileName ? String(fileName) : "",
                    submittedAt: new Date(),
                    // A resubmission invalidates earlier feedback.
                    feedback: { comment: "", status: "", by: null, at: null },
                },
            },
            { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true }
        );

        logger.info(
            { studentId: student._id, enrollmentId: enrollment._id, moduleNumber: moduleNumberInt },
            "Assignment submitted"
        );
        res.status(201).json({ success: true, submission });
    } catch (error) {
        logger.error({ err: error }, "Error submitting assignment");
        res.status(500).json({ error: "Internal server error" });
    }
};

/**
 * GET /learning/instances/:instanceId/submissions
 * All submissions for one course instance. Teachers must be responsible or
 * assistant teacher of the instance; staff may see any instance.
 */
export const getInstanceSubmissions = async (req, res) => {
    try {
        const { instanceId } = req.params;
        if (!mongoose.isValidObjectId(instanceId)) {
            return res.status(400).json({ error: "Invalid course instance id" });
        }

        const user = req.user;
        const isTeacher = isTeacherUser(user);
        const isStaff = isStaffUser(user);
        if (!isTeacher && !isStaff) {
            return res.status(403).json({ error: "Forbidden: Access denied." });
        }

        const instance = await CourseInstance.findById(instanceId);
        if (!instance) {
            return res.status(404).json({ error: "Course instance not found" });
        }

        if (isTeacher && !isStaff) {
            const teacher = await getTeacherForUser(user);
            if (!teacher || !teacherOwnsInstance(teacher, instance)) {
                return res.status(403).json({ error: "Du ansvarar inte för den här kursen" });
            }
        }

        const { moduleNumber } = req.query;
        const query = { courseInstanceId: instance._id };
        if (moduleNumber !== undefined && Number.isInteger(Number(moduleNumber))) {
            query.moduleNumber = Number(moduleNumber);
        }

        const submissions = await AssignmentSubmission.find(query)
            .populate("studentId", "name email")
            .populate("feedback.by", "username email")
            .sort({ moduleNumber: 1, submittedAt: 1 });

        res.json({ success: true, submissions });
    } catch (error) {
        logger.error({ err: error }, "Error fetching instance submissions");
        res.status(500).json({ error: "Internal server error" });
    }
};

/**
 * PUT /learning/submissions/:submissionId/feedback
 * Teacher feedback on a submission: a single comment plus a grade-style
 * status ("godkänd" = accepted, "komplettera" = needs revision/resubmission).
 */
export const setSubmissionFeedback = async (req, res) => {
    try {
        const { submissionId } = req.params;
        const { comment, status } = req.body || {};

        if (!mongoose.isValidObjectId(submissionId)) {
            return res.status(400).json({ error: "Invalid submission id" });
        }
        if (!FEEDBACK_STATUSES.includes(status)) {
            return res.status(400).json({ error: "Status måste vara godkänd eller komplettera" });
        }

        const user = req.user;
        const isTeacher = isTeacherUser(user);
        const isStaff = isStaffUser(user);
        if (!isTeacher && !isStaff) {
            return res.status(403).json({ error: "Forbidden: Access denied." });
        }

        const submission = await AssignmentSubmission.findById(submissionId);
        if (!submission) {
            return res.status(404).json({ error: "Submission not found" });
        }

        if (isTeacher && !isStaff) {
            const teacher = await getTeacherForUser(user);
            const instance = await CourseInstance.findById(submission.courseInstanceId);
            if (!teacher || !instance || !teacherOwnsInstance(teacher, instance)) {
                return res.status(403).json({ error: "Du ansvarar inte för den här kursen" });
            }
        }

        submission.feedback = {
            comment: String(comment || ""),
            status,
            by: user.userId || null,
            at: new Date(),
        };
        await submission.save();

        logger.info(
            { submissionId: submission._id, status, by: user.userId },
            "Assignment feedback set"
        );
        res.json({ success: true, submission });
    } catch (error) {
        logger.error({ err: error }, "Error setting submission feedback");
        res.status(500).json({ error: "Internal server error" });
    }
};

/**
 * GET /learning/submissions/pending
 * Unreviewed submissions (no feedback yet) for the logged-in teacher's own
 * course instances, or for all instances for staff.
 */
export const getPendingSubmissions = async (req, res) => {
    try {
        const user = req.user;
        const isTeacher = isTeacherUser(user);
        const isStaff = isStaffUser(user);
        if (!isTeacher && !isStaff) {
            return res.status(403).json({ error: "Forbidden: Access denied." });
        }

        const query = { "feedback.status": "" };

        if (isTeacher && !isStaff) {
            const teacher = await getTeacherForUser(user);
            if (!teacher) {
                return res.status(403).json({ error: "Teacher profile not found" });
            }
            const instances = await CourseInstance.find({
                $or: [{ responsibleTeacher: teacher._id }, { assistantTeacher: teacher._id }],
            }).select("_id");
            query.courseInstanceId = { $in: instances.map((i) => i._id) };
        }

        const submissions = await AssignmentSubmission.find(query)
            .populate("studentId", "name email")
            .populate("feedback.by", "username email")
            .populate("courseInstanceId", "courseName courseCode")
            .sort({ submittedAt: 1 });

        res.json({ success: true, submissions });
    } catch (error) {
        logger.error({ err: error }, "Error fetching pending submissions");
        res.status(500).json({ error: "Internal server error" });
    }
};

// Per-component completion report for a student
// GET /learning/instances/:instanceId/report/:studentId
export const getCourseInstanceReport = async (req, res) => {
    try {
        const { instanceId, studentId } = req.params;

        if (!mongoose.isValidObjectId(instanceId) || !mongoose.isValidObjectId(studentId)) {
            return res.status(400).json({ error: "Invalid IDs" });
        }

        const instance = await CourseInstance.findById(instanceId);
        if (!instance) {
            return res.status(404).json({ error: "Course instance not found" });
        }

        const student = await Student.findById(studentId);
        if (!student) {
            return res.status(404).json({ error: "Student not found" });
        }

        // Get the student's enrollment for this instance
        const enrollment = await StudentEnrollment.findOne({
            studentId: student._id,
            courseInstanceId: instanceId,
        });

        // Compute completion status from enrollment
        let completedComponents = {};
        let totalModules = 0;
        let completedModules = 0;

        if (enrollment && enrollment.completedComponents) {
            completedComponents = Object.fromEntries(enrollment.completedComponents);
            totalModules = instance.modules ? instance.modules.length : 0;
            completedModules = Object.values(completedComponents).filter(
                c => c === "✓"
            ).length;
        }

        // Get module information for component details
        const modules = instance.modules || [];

        // Compute assignment status per module
        const assignmentStatus = {};
        if (enrollment && enrollment._id) {
            const submissions = await AssignmentSubmission.find({
                enrollmentId: enrollment._id,
                courseInstanceId: instance._id,
            }).select("moduleNumber submittedText submittedAt feedback status fileId");
            for (const submission of submissions) {
                assignmentStatus[submission.moduleNumber] = {
                    submitted: !!submission.submittedText || !!submission.fileId,
                    status: submission.feedback?.status || "",
                    submittedAt: submission.submittedAt,
                    feedbackComment: submission.feedback?.comment || "",
                };
            }
        }

        // Compute student activity and last access
        const now = new Date();
        let lastAccess = null;
        let activityDays = 0;

        // Check last login from user model
        const user = await User.findById(student._id).select("lastLoginAt");
        if (user && user.lastLoginAt) {
            const diffMs = now - user.lastLoginAt;
            activityDays = Math.floor(diffMs / 86400000);
            lastAccess = user.lastLoginAt;
        }

        // If no login activity, check last submission
        if (activityDays === 0) {
            const lastSub = await AssignmentSubmission.findOne({
                studentId: student._id,
                enrollmentId: enrollment?._id,
            }).sort({ submittedAt: -1 });
            if (lastSub && lastSub.submittedAt) {
                const diffMs = now - lastSub.submittedAt;
                activityDays = Math.floor(diffMs / 86400000);
                lastAccess = lastSub.submittedAt;
            }
        }

        // Determine status labels
        const statuses = {};
        for (const module of modules) {
            statuses[module.moduleNumber] = {
                completed: completedComponents[module.moduleNumber] === "✓",
                submitted: !!(assignmentStatus[module.moduleNumber]?.submitted),
                statusText: assignmentStatus[module.moduleNumber]?.status || "",
            };
        }

        res.json({
            success: true,
            instanceId,
            studentId,
            totalModules,
            completedModules,
            completionRate: totalModules > 0 ? (completedModules / totalModules * 100).toFixed(1) : 0,
            completedComponents,
            modules: modules.map((m) => ({
                moduleNumber: m.moduleNumber,
                title: m.title,
                isPartialExam: m.isPartialExam,
                isCaseStudy: m.isCaseStudy,
                completed: completedComponents[m.moduleNumber] === "✓",
                assignment: assignmentStatus[m.moduleNumber],
            })),
            assignmentStatus,
            scheduledDates: instance.sectionDates?.map((d, i) => ({
                moduleIndex: i,
                date: d ? d.toISOString().split("T")[0] : null,
            })) || [],
            studentActivity: {
                lastAccess,
                activityDays,
                lastLogin: user?.lastLoginAt,
                lastSubmission: activityDays > 0 ? null : null,
            },
            participantCount: enrollment ? enrollment.students?.length || 0 : 0,
        });
    } catch (error) {
        logger.error({ err: error }, "Error fetching course instance report");
        res.status(500).json({ error: "Internal server error" });
    }
};
// Get participants for a course instance.
// GET /learning/instances/:instanceId/participants
export const getCourseInstanceParticipants = async (req, res) => {
    try {
        const { instanceId } = req.params;

        if (!mongoose.isValidObjectId(instanceId)) {
            return res.status(400).json({ error: "Invalid course instance ID" });
        }

        const instance = await CourseInstance.findById(instanceId);
        if (!instance) {
            return res.status(404).json({ error: "Course instance not found" });
        }

        // Get all enrollments for this instance
        const enrollments = await StudentEnrollment.find({ courseInstanceId: instance._id })
            .select("studentId students status")
            .populate("studentId", "name email")
            .lean();

        const participants = enrollments.map((enrollment) => ({
            participantId: enrollment.studentId._id,
            name: enrollment.studentId.name,
            email: enrollment.studentId.email,
            role: "student",
            status: enrollment.status,
        }));

        res.json({
            success: true,
            participants,
        });
    } catch (error) {
        logger.error({ err: error }, "Error fetching course instance participants");
        res.status(500).json({ error: "Internal server error" });
    }
};

/**
 * Add a participant (student or staff) to a course instance.
 * Only admin/systemadmin can add participants; teacher can add students in their own courses.
 * POST /learning/instances/:instanceId/participants
 */
export const addCourseInstanceParticipant = async (req, res) => {
    try {
        const { instanceId } = req.params;
        const { participantId, role } = req.body;

        if (!participantId || !role) {
            return res.status(400).json({ error: "Participant ID and role are required" });
        }

        if (!mongoose.isValidObjectId(participantId)) {
            return res.status(400).json({ error: "Invalid participant ID" });
        }

        const instance = await CourseInstance.findById(instanceId);
        if (!instance) {
            return res.status(404).json({ error: "Course instance not found" });
        }

        // Check permissions: admin/systemadmin can add anyone; teacher can add students in their course
        const user = req.user;
        const isAdmin = user.roles && user.roles.includes("systemadmin");
        const isAdminStaff = user.roles && user.roles.includes("admin");
        const isTeacher = user.role === "teacher";

        let hasPermission = false;

        if (isAdmin || isAdminStaff) {
            hasPermission = true;
        } else if (isTeacher) {
            // Teacher can add students to their own course
            hasPermission = instance.responsibleTeacher &&
                String(instance.responsibleTeacher) === String(user.userId);
        }

        if (!hasPermission) {
            return res.status(403).json({ error: "Saknad behörighet för att lägga till deltagare" });
        }

        // Check if participant already exists
        const existingEnrollment = await StudentEnrollment.findOne({
            courseInstanceId: instance._id,
            studentId: participantId,
        }).lean();

        if (existingEnrollment) {
            return res.status(409).json({ error: "Denna elev är redan inskriven på kursen" });
        }

        // Create new enrollment
        const newEnrollment = new StudentEnrollment({
            studentId: participantId,
            courseInstanceId: instance._id,
            status: "enrolled",
        });

        await newEnrollment.save();

        res.json({
            success: true,
            enrollment: {
                studentId: participantId,
                courseInstanceId: instance._id,
                status: "enrolled",
            },
        });
    } catch (error) {
        logger.error({ err: error }, "Error adding course instance participant");
        res.status(500).json({ error: "Intern servererror" });
    }
};

/**
 * Remove a participant from a course instance.
 * Admin/systemadmin can remove anyone; teacher can remove students from their own course.
 * DELETE /learning/instances/:instanceId/participants/:participantId
 */
export const removeCourseInstanceParticipant = async (req, res) => {
    try {
        const { instanceId, participantId } = req.params;

        if (!mongoose.isValidObjectId(instanceId) || !mongoose.isValidObjectId(participantId)) {
            return res.status(400).json({ error: "Invalid IDs" });
        }

        const instance = await CourseInstance.findById(instanceId);
        if (!instance) {
            return res.status(404).json({ error: "Course instance not found" });
        }

        // Check permissions
        const user = req.user;
        const isAdmin = user.roles && user.roles.includes("systemadmin");
        const isAdminStaff = user.roles && user.roles.includes("admin");
        const isTeacher = user.role === "teacher";

        let hasPermission = false;

        if (isAdmin || isAdminStaff) {
            hasPermission = true;
        } else if (isTeacher) {
            hasPermission = instance.responsibleTeacher &&
                String(instance.responsibleTeacher) === String(user.userId);
        }

        if (!hasPermission) {
            return res.status(403).json({ error: "Saknad behörighet för att ta bort deltagare" });
        }

        // Find and remove the enrollment
        const enrollment = await StudentEnrollment.findOne({
            courseInstanceId: instance._id,
            studentId: participantId,
        });

        if (!enrollment) {
            return res.status(404).json({ error: "Deltagare hittades inte på den här kursen" });
        }

        // Soft remove: set status to withdrawn instead of deleting
        enrollment.status = "withdrawn";
        enrollment.dropoutDate = new Date();
        enrollment.dropoutBy = user._id;
        await enrollment.save();

        res.json({
            success: true,
            message: "Deltagare har tagits bort från kursen",
        });
    } catch (error) {
        logger.error({ err: error }, "Error removing course instance participant");
        res.status(500).json({ error: "Intern servererror" });
    }
};

/**
 * Get last access time for a student in a course instance.
 * Returns the last login date and last submission date.
 * GET /learning/instances/:instanceId/access-last/:studentId
 */
export const getStudentLastAccess = async (req, res) => {
    try {
        const { instanceId, studentId } = req.params;

        if (!mongoose.isValidObjectId(instanceId) || !mongoose.isValidObjectId(studentId)) {
            return res.status(400).json({ error: "Invalid IDs" });
        }

        const instance = await CourseInstance.findById(instanceId);
        if (!instance) {
            return res.status(404).json({ error: "Course instance not found" });
        }

        const student = await Student.findById(studentId);
        if (!student) {
            return res.status(404).json({ error: "Student not found" });
        }

        // Get the student's enrollment for this instance
        const enrollment = await StudentEnrollment.findOne({
            studentId: student._id,
            courseInstanceId: instanceId,
        });

        // Check last login from user model
        const user = await User.findById(student._id).select("lastLoginAt");
        const lastLogin = user?.lastLoginAt || null;

        // Check last submission
        let lastSubmission = null;
        if (enrollment && enrollment._id) {
            const lastSub = await AssignmentSubmission.findOne({
                studentId: student._id,
                enrollmentId: enrollment._id,
            }).sort({ submittedAt: -1 });
            lastSubmission = lastSub?.submittedAt || null;
        }

        res.json({
            success: true,
            lastLogin,
            lastSubmission,
        });
    } catch (error) {
        logger.error({ err: error }, "Error fetching student last access");
        res.status(500).json({ error: "Intern servererror" });
    }
};

// Macro reports for a course instance (multiple students)
// GET /learning/instances/:instanceId/reports
export const getCourseInstanceReports = async (req, res) => {
    try {
        const { instanceId } = req.params;

        if (!mongoose.isValidObjectId(instanceId)) {
            return res.status(400).json({ error: "Invalid course instance ID" });
        }

        const instance = await CourseInstance.findById(instanceId);
        if (!instance) {
            return res.status(404).json({ error: "Course instance not found" });
        }

        // Get all enrollments for this instance
        const enrollments = await StudentEnrollment.find({ courseInstanceId: instanceId })
            .select("completedAt completionCertificate studentId completedComponents");

        const totalEnrollments = enrollments.length;
        let totalCompletedStudents = 0;
        let totalCompletedModules = 0;

        enrollments.forEach(enrollment => {
            if (enrollment.completedAt) totalCompletedStudents++;
            if (enrollment.completedComponents) {
                const completed = Object.values(enrollment.completedComponents || {}).filter(c => c === "✓").length;
                totalCompletedModules += completed;
            }
        });

        const overallCompletionRate = totalEnrollments > 0
            ? (totalCompletedStudents / totalEnrollments * 100).toFixed(1)
            : 0;

        res.json({
            success: true,
            instanceId,
            totalEnrollments,
            totalCompletedStudents,
            totalCompletedModules,
            overallCompletionRate,
        });
    } catch (error) {
        logger.error({ err: error }, "Error fetching course instance reports");
        res.status(500).json({ error: "Internal server error" });
    }
};

/**
 * GET /learning/submissions/:submissionId/comments
 * Assignment-tied discussion thread for one submission. A student caller may
 * only read comments on their own submission; teachers/staff may read any.
 */
export const getSubmissionComments = async (req, res) => {
    try {
        const { submissionId } = req.params;
        if (!mongoose.isValidObjectId(submissionId)) {
            return res.status(400).json({ error: "Invalid submission id" });
        }

        const user = req.user;
        const submission = await AssignmentSubmission.findById(submissionId);
        if (!submission) {
            return res.status(404).json({ error: "Submission not found" });
        }

        if (!isTeacherUser(user) && !isStaffUser(user)) {
            const student = await getStudentForUser(user);
            if (!student || String(submission.studentId) !== String(student._id)) {
                return res.status(403).json({ error: "Forbidden: Access denied." });
            }
        }

        res.json({ success: true, comments: submission.comments || [] });
    } catch (error) {
        logger.error({ err: error }, "Error fetching submission comments");
        res.status(500).json({ error: "Internal server error" });
    }
};

/**
 * POST /learning/submissions/:submissionId/comments
 * Add a comment/reply to a submission's discussion thread. Replies are
 * identified by parentCommentId pointing to the parent comment (null = top-level).
 */
export const addSubmissionComment = async (req, res) => {
    try {
        const { submissionId } = req.params;
        const { text, parentCommentId } = req.body || {};

        if (!mongoose.isValidObjectId(submissionId)) {
            return res.status(400).json({ error: "Invalid submission id" });
        }
        if (!text || !String(text).trim()) {
            return res.status(400).json({ error: "Text krävs" });
        }

        const user = req.user;
        const submission = await AssignmentSubmission.findById(submissionId);
        if (!submission) {
            return res.status(404).json({ error: "Submission not found" });
        }

        const isTeacher = isTeacherUser(user);
        const isStaff = isStaffUser(user);
        if (!isTeacher && !isStaff && !isStudentUser(user)) {
            return res.status(403).json({ error: "Forbidden: Access denied." });
        }

        if (isTeacher && !isStaff) {
            const teacher = await getTeacherForUser(user);
            const instance = await CourseInstance.findById(submission.courseInstanceId);
            if (!teacher || !instance || !teacherOwnsInstance(teacher, instance)) {
                return res.status(403).json({ error: "Du ansvarar inte för den här kursen" });
            }
        }

        if (isStudentUser(user)) {
            const student = await getStudentForUser(user);
            if (!student || String(submission.studentId) !== String(student._id)) {
                return res.status(403).json({ error: "Forbidden: Access denied." });
            }
        }

        if (parentCommentId && !mongoose.isValidObjectId(parentCommentId)) {
            return res.status(400).json({ error: "Invalid parentCommentId" });
        }

        submission.comments = (submission.comments || []).concat({
            id: new mongoose.Types.ObjectId(),
            text: String(text).trim(),
            by: user.userId || null,
            at: new Date(),
            parentCommentId: parentCommentId || null,
        });
        await submission.save();

        logger.info(
            { submissionId: submission._id, by: user.userId },
            "Submission comment added"
        );
        res.json({ success: true, comments: submission.comments });
    } catch (error) {
        logger.error({ err: error }, "Error adding submission comment");
        res.status(500).json({ error: "Internal server error" });
    }
};


