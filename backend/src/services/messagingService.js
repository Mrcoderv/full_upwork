import logger from "../utils/logger.js";
import Student from "../models/Student.js";
import StudentEnrollment from "../models/StudentEnrollment.js";
import User from "../models/User.js";
import Teacher from "../models/Teacher.js";
import { sendEmail, renderMessageCopyEmail } from "./emailService.js";

/**
 * Send an email copy of an internal message to a student recipient.
 * PART B of the spec: "students also receive a copy of messages by email,
 * since some students may not log in every day."
 * @param {Object} message - The message object
 * @param {Object} recipient - The recipient user object
 * @param {{ senderName?: string }} [options]
 */
export const sendEmailCopyOfMessage = async (message, recipient, options = {}) => {
  if (recipient.roles?.includes("student")) {
    if (!recipient.email) {
      logger.warn(
        { recipientId: recipient._id },
        "Email copy skipped — student recipient has no email address"
      );
      return;
    }
    const { subject, text } = renderMessageCopyEmail({
      senderName: options.senderName,
      messageBody: message.body || "",
      subject: message.conversationSubject,
    });
    await sendEmail({ to: recipient.email, subject, text });
  }
};

/**
 * Send best-effort email copies of a message to every recipient in the
 * conversation (excluding the sender). Only student recipients receive an
 * email copy (see sendEmailCopyOfMessage); staff-to-staff stays in-app.
 *
 * Dispatch is deliberately non-fatal: an email failure must never block the
 * in-platform message from being saved, mirroring the best-effort pattern used
 * for lastLoginAt updates in authController.js. Failures are logged and the
 * promise resolves normally.
 *
 * @param {{ message: Object, conversation: Object, senderName?: string }} args
 * @returns {Promise<{ attempted: number, succeeded: number }>}
 */
export const dispatchMessageEmailCopies = async ({
  message,
  conversation,
  senderName,
}) => {
  let recipients;
  try {
    recipients = await User.find({
      _id: { $in: conversation.participants, $ne: message.senderId },
    });
  } catch (error) {
    logger.error(
      { err: error, conversationId: conversation?._id },
      "Email copy dispatch aborted — could not load recipients (non-fatal)"
    );
    return { attempted: 0, succeeded: 0 };
  }

  // Propagate the conversation subject so the email copy carries the real
  // subject (the Message schema has no subject column of its own).
  if (conversation?.subject) {
    message.conversationSubject = conversation.subject;
  }

  let succeeded = 0;
  for (const recipient of recipients) {
    try {
      await sendEmailCopyOfMessage(message, recipient, { senderName });
      succeeded += 1;
    } catch (error) {
      logger.error(
        { err: error, recipientId: recipient._id },
        "Email copy dispatch failed (non-fatal)"
      );
    }
  }
  return { attempted: recipients.length, succeeded };
};

/**
 * Check if a sender can message a recipient.
 * @param {Object} sender - The sender user object
 * @param {Object} recipient - The recipient user object
 * @returns {Promise<boolean>}
 */
export const canMessage = async (sender, recipient) => {
  const senderRole = sender.role || (sender.roles && sender.roles[0]);
  const recipientRole = recipient.role || (recipient.roles && recipient.roles[0]);

  const staffRoles = ["admin", "systemadmin", "teacher", "syv", "specped", "coordinator"];

  // Staff to Staff
  if (staffRoles.includes(senderRole) && staffRoles.includes(recipientRole)) {
    return true;
  }

  // Staff to Student
  if (staffRoles.includes(senderRole) && recipientRole === "student") {
    // Admins can message any student
    if (["admin", "systemadmin"].includes(senderRole)) {
      return true;
    }
    
    // Teachers/SYV/Specped can message students they are linked to
    // For now, let's allow them to message any student if they are staff, 
    // but we can tighten this by checking enrollments if needed.
    // The spec says "school-to-student", implying staff-to-student.
    return true; 
  }

  // Student to Staff
  if (senderRole === "student" && staffRoles.includes(recipientRole)) {
    // For now, allow students to message any staff (e.g. their SYV or Teacher)
    // In a real system, we'd check if they are actually 'their' staff.
    return true;
  }

  // Student to Student - Not allowed
  if (senderRole === "student" && recipientRole === "student") {
    return false;
  }

  return false;
};

/**
 * Validates if the participants array is valid for the sender.
 * @param {Object} sender - The sender user object
 * @param {Array} participantIds - Array of participant User IDs
 * @returns {Promise<boolean>}
 */
export const validateParticipants = async (sender, participantIds) => {
  if (!participantIds || !Array.isArray(participantIds) || participantIds.length === 0) {
    return false;
  }

  const senderId = sender.userId || sender._id || sender.id;

  for (const id of participantIds) {
    if (senderId && id === senderId.toString()) continue;
    const recipient = await User.findById(id);
    if (!recipient) return false;
    if (!(await canMessage(sender, recipient))) return false;
  }

  return true;
};
