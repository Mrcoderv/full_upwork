/**
 * Inactivity discussion loop (Etapp 2, Phase 4D).
 *
 * When an admin acts on a flagged student (warning email or withdrawal), the
 * student's responsible teacher is pulled into the loop instead of receiving a
 * one-way alert: they get a Notification and a shared discussion thread
 * (Conversation + opening Message in the existing messaging system) so teacher
 * and admin can discuss and decide together. All helpers are non-fatal — a
 * failure here must never break the underlying action.
 */
import Conversation from "../models/Conversation.js";
import Message from "../models/Message.js";
import Notification from "../models/Notification.js";
import StudentEnrollment from "../models/StudentEnrollment.js";
import Teacher from "../models/Teacher.js";
import logger from "../utils/logger.js";

/**
 * Resolve the responsible teacher (first enrollment with a teacherId) for a
 * student.
 * @param {string} studentId
 * @returns {Promise<{ teacherId: ObjectId, userId: ObjectId } | null>}
 */
export async function resolveResponsibleTeacher(studentId) {
    const enrollment = await StudentEnrollment.findOne({
        studentId,
        teacherId: { $ne: null },
    })
        .select("teacherId")
        .lean();
    if (!enrollment?.teacherId) return null;

    const teacher = await Teacher.findById(enrollment.teacherId).select("userId").lean();
    if (!teacher?.userId) return null;

    return { teacherId: teacher._id, userId: teacher.userId };
}

/**
 * Find-or-create a discussion thread about a flagged student between an admin
 * and the responsible teacher. The opening message describes the action that
 * triggered the thread so both sides can continue the discussion in the
 * messaging UI.
 * @param {{ studentId: string, adminUserId: string, teacherUserId: string, studentName?: string, actionLabel: string }} params
 * @returns {Promise<Object|null>} the conversation document (existing or new), or null when inputs are missing.
 */
export async function ensureInactivityDiscussionThread({
    studentId,
    adminUserId,
    teacherUserId,
    studentName,
    actionLabel,
}) {
    if (!studentId || !adminUserId || !teacherUserId) return null;

    const existing = await Conversation.findOne({
        studentId,
        participants: { $all: [adminUserId, teacherUserId] },
    });
    if (existing) return existing;

    const conversation = await Conversation.create({
        participants: [adminUserId, teacherUserId],
        studentId,
        subject: `Inaktivitetsärende — ${studentName || "elev"}`,
    });

    await Message.create({
        conversationId: conversation._id,
        senderId: adminUserId,
        body: `${actionLabel}. Diskussion om fortsatt hantering av ${studentName || "eleven"} förs här.`,
        readBy: [{ userId: adminUserId, readAt: new Date() }],
    });

    return conversation;
}

/**
 * Notify the responsible teacher that an admin acted on a flagged student.
 * @param {{ studentId: string, studentName: string, teacherId: ObjectId, teacherUserId: ObjectId, adminUserId: string, action: "warning_email"|"withdraw" }} params
 */
export async function notifyInactivityAction({
    studentId,
    studentName,
    teacherId,
    teacherUserId,
    adminUserId,
    action,
}) {
    if (!studentId || !teacherId || !teacherUserId) return;

    const actionText =
        action === "withdraw"
            ? `Eleven ${studentName} har avslutats på grund av inaktivitet (avbrott).`
            : `Varningsmail om inaktivitet har skickats till ${studentName}.`;

    await Notification.create({
        type: "inactivity_action",
        teacher: teacherId,
        createdByAdmin: adminUserId,
        message: actionText,
        meta: {
            teacherId: teacherUserId,
            studentId,
            url: `/student/${studentId}`,
        },
        resolved: false,
        resolvedByUsers: [],
    });
}

/**
 * Run an async callback inside a try/catch so a Phase 4D failure can never
 * break the caller (e.g. a warning email or dropout action).
 * @param {() => Promise<*>} fn
 * @param {string} label
 * @returns {Promise<*>}
 */
export const safeInactivitySideEffect = async (fn, label) => {
    try {
        return await fn();
    } catch (error) {
        logger.error({ err: error, step: label }, "Inactivity side effect failed (non-fatal)");
        return null;
    }
};
