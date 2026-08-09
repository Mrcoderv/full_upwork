import Notification from "../models/Notification.js";
import Student from "../models/Student.js";
import User from "../models/User.js";
import Course from "../models/Course.js";
import logger from "../utils/logger.js";


/**
 * Notification Controller
 * Handles creation, resolution, and evaluation of notifications for students, grades, action plans, and dropouts.
 * Uses Notification, Student, and User models.
 */
export const checkPendingGradesAndNotify = async () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    
  
    const unGradedStudents = await Student.countDocuments({
      education: {
        $elemMatch: {
          removedAt: null,
          $or: [
            { grade: null },
            { grade: "" },
            { locked: false },
            { grade: "F", locked: true }
          ]
        }
      },
      dropout: false
    });
  
    const existing = await Notification.findOne({ type: "grades_pending", resolved: false });
  
    if (unGradedStudents > 0) {
      // Skapa notis om den inte redan finns
      if (!existing) {
        await Notification.create({
          type: "grades_pending",
          message: "Du har elever att betygsätta",
          resolved: false
        });
      }
    } else {
      // Ta bort/lös notisen om alla elever är betygsatta
      if (existing) {
        existing.resolved = true;
        await existing.save();
      }
    }
  };
  
  


/**
 * Creates a notification for a specific student and course if one does not already exist.
 * @async
 * @param {Object} params
 * @param {string} params.studentId - Student ID
 * @param {string} params.courseId - Course ID
 * @param {string} params.type - Notification type
 * @param {string} params.message - Notification message
 * @returns {Promise<Object|undefined>} The created notification or undefined if already exists
 */
export async function createNotification({ studentId, courseId, type, message }) {
    const existing = await Notification.findOne({
      studentId,
      courseId,
      type,
      resolved: false
    });
  
    if (!existing) {
      return await Notification.create({
        studentId,
        courseId,
        type,
        message,
        resolved: false,
      });
    }
  }
  
  /**
 * Resolves notifications for a specific student, course, and type.
 * @async
 * @param {Object} params
 * @param {string} params.studentId - Student ID
 * @param {string} params.courseId - Course ID
 * @param {string} params.type - Notification type
 * @returns {Promise<Object>} The result of the update operation
 */
  export async function resolveNotification({ studentId, courseId, type }) {
    return await Notification.updateMany(
      {
        studentId,
        courseId,
        type,
        resolved: false,
      },
      { $set: { resolved: true } }
    );
  }


/**
 * Creates a global notification of a given type if it does not already exist.
 * @async
 * @param {string} type - Notification type
 * @param {string} message - Notification message
 * @returns {Promise<Object|undefined>} The created notification or undefined if already exists
 */
// 🔔 Skapa en systemnotis om den inte finns
export async function createGlobalNotification(type, message) {
  const existing = await Notification.findOne({ type, resolved: false });
  if (!existing) {
    return await Notification.create({
      type,
      message,
      resolved: false,
    });
  }
}

/**
 * Resolves all global notifications of a given type.
 * @async
 * @param {string} type - Notification type
 * @returns {Promise<Object>} The result of the update operation
 */
// ✅ Avsluta systemnotis av viss typ
export async function resolveGlobalNotification(type) {
  return await Notification.updateMany(
    { type, resolved: false },
    { $set: { resolved: true } }
  );
}

/**
 * Evaluates action plan status and creates or resolves global notifications as needed.
 * @async
 * @returns {Promise<void>}
 */
export async function evaluateActionPlanStatusAndNotify() {
  try {
    const finnsObearbetadeHandlingsplaner = await Notification.exists({
      type: "action_plan_required",
      resolved: false
    });
    if (finnsObearbetadeHandlingsplaner) {
      await createGlobalNotification(
        "global_action_plan_required",
        "Handlingsplan krävs pga elever med F i betyg"
      );
    } else {
      await resolveGlobalNotification("global_action_plan_required");
    }
  } catch (err) {
    logger.error({ err }, "Error in evaluateActionPlanStatusAndNotify");
  }
}
  
  
/**
 * Evaluates grading status and creates or resolves global notifications as needed.
 * @async
 * @returns {Promise<void>}
 */
  export async function evaluateGradingStatusAndNotify() {
    try {
      const students = await Student.find().lean();
  
      const ungradedStudents = students.filter(student => {
        const courses = (student.education || []).filter(edu => !edu.removedAt);
        return courses.some(edu => (!edu.grade || edu.grade === "" || edu.locked === false));
      });
  
      if (ungradedStudents.length > 0) {
        const message = "Det finns elever som inte har fått betyg ännu. Vänlig betygsätt dem snarast."
        await createGlobalNotification("grades_pending", message);
        logger.info({ message }, "Notification sent for incomplete grading");
      } else {
        await resolveGlobalNotification("grades_pending");
        logger.info("All students have grades - no notification needed");
      }
    } catch (err) {
      logger.error({ err }, "Error in evaluateGradingStatusAndNotify");
    }
  }
  


/**
 * Sends a dropout notification for a student and education.
 * @async
 * @param {Object} params
 * @param {Object} params.student - Student object
 * @param {Object} params.education - Education object
 * @returns {Promise<Object>} The created notification
 */
  export async function sendDropoutNotification({ student, education }) {
    let teacherId = null;

    // Try to resolve teacherId from teacher name string (in Student model)
    if (student.teacher && typeof student.teacher === "string" && student.teacher.trim() !== "") {
        const teacherUser = await User.findOne({ name: student.teacher });
        if (teacherUser) {
            teacherId = teacherUser._id;
        }
    }

    // Prevent duplicate
    const existing = await Notification.findOne({
        type: "dropout",
        "meta.studentId": student._id,
        "meta.educationId": education._id,
    });
    if (existing) return existing;

    // If education.refId can be empty/null, that's OK as it allows null

    const notification = new Notification({
        type: "dropout",
        message: `Studenten ${student.name} har avbrutit utbildningen ${education?.name || 'okänd utbildning'}`,
        meta: {
            teacherId: teacherId,      // Will be null if no match found
            studentId: student._id,
            educationId: education?._id,
            courseId: education?.refId || null,
            url: `/students/${student._id}/education`
        }
    });
    await notification.save();
    return notification;
}

/**
 * Creates a notification for a study plan (StudentEnrollment) change.
 * @async
 * @param {object} doc - The StudentEnrollment document from the hook.
 * @param {'created'|'updated'|'deleted'} changeType - The type of change.
 * @param {object} [changes] - For 'updated' type, an object with changed fields.
 */
export async function sendStudyplanChangedNotification({ doc, changeType, changes = null }) {
    try {
        if (doc.skipNotification) {
            logger.info({ enrollmentId: doc._id }, "Skipping notification for StudentEnrollment");
            return;
        }

        const student = await Student.findById(doc.studentId);
        // The main course/program name is likely more useful than the instance name
        const course = await Course.findById(doc.mainCourseId);

        if (!student || !course) {
            logger.error({ enrollmentId: doc._id }, "Could not find Student or Course for StudentEnrollment");
            return;
        }

        const courseName = course.courseName || course.name || "okänd kurs";

        // Find the student's login account so the confirmation reaches them too.
        // The student account is linked to the Student record by email.
        let studentUserId = null;
        try {
            const studentUser = await User.findOne({ email: student.email });
            studentUserId = studentUser?._id || null;
        } catch (userError) {
            logger.error({ err: userError, studentId: student._id }, "Error looking up student user for study plan notification");
        }

        const formatDate = (value) => {
            if (!value) return "";
            const date = new Date(value);
            if (isNaN(date.getTime())) return "";
            return date.toISOString().slice(0, 10);
        };

        let message = '';
        if (changeType === 'created') {
            message = `Ny studieplan skapad för ${student.name} i kursen ${courseName}.`;
        } else if (changeType === 'updated') {
            const newValues = changes?.newValues || {};
            const changedFields = Object.keys(newValues).join(', ');
            const isRevised = newValues.status === "reviderad";
            const newStart = newValues.startDate;
            const newEnd = newValues.endDate;
            if (isRevised) {
                const range = [formatDate(newStart), formatDate(newEnd)].filter(Boolean).join(' – ');
                message = range
                    ? `Studieplan reviderad för ${student.name} i kursen ${courseName}. Nya datum: ${range}.`
                    : `Studieplan reviderad för ${student.name} i kursen ${courseName}.`;
            } else {
                message = `Studieplan uppdaterad för ${student.name} i kursen ${courseName}. Fält ändrade: ${changedFields}.`;
            }
        } else if (changeType === 'deleted') {
            message = `Studieplan borttagen för ${student.name} i kursen ${courseName}.`;
        }

        await Notification.create({
            type: "studyplan_changed",
            message,
            teacher: doc.teacherId || null, // Directly use teacherId from enrollment
            meta: {
                studentId: doc.studentId,
                studentName: student.name,
                courseInstanceId: doc.courseInstanceId,
                mainCourseId: doc.mainCourseId,
                courseName,
                studentUserId,
                changeType,
                details: changes // For 'updated', this contains changedFields, previousValues, newValues
            },
            resolved: false,
        });

    } catch (error) {
        logger.error({ err: error }, "Error creating study plan change notification");
    }
}
  
