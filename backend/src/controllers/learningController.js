import mongoose from "mongoose";
import Student from "../models/Student.js";
import Teacher from "../models/Teacher.js";
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
