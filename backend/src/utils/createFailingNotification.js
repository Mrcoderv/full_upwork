// utils/createFailingNotification.js
import Notification from "../models/Notification.js";
import Student from "../models/Student.js";
import logger from "./logger.js";

export const createFailingStudentNotification = async (studentId, courseId) => {
  try {
    const student = await Student.findById(studentId).lean();

    if (!student) return;

    // Leta upp den aktuella kursen i education
    const course = student.education.find(
      (edu) => edu.refId.toString() === courseId && edu.type === "Course"
    );

    if (!course || course.grade !== 'F') return;

    // Kontrollera att ingen dubblett redan finns
    const exists = await Notification.findOne({
      type: 'failing_grade',
      'meta.studentId': studentId,
      'meta.courseId': courseId,
      resolved: false,
    });

    if (exists) return;

    const notification = new Notification({
      type: 'failing_grade',
      message: `⚠️ Eleven ${student.name} har fått F i ${course.name || "en kurs"}!`,
      meta: {
        studentId: student._id,
        courseId,
        teacherId: student.teacher || null,
        url: `/students/${student._id}`,  // Frontend-länk
      },
    });

    await notification.save();
  } catch (err) {
    logger.error({ err: err }, "Kunde inte skapa F-notis");
  }
};
