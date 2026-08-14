import StudentEnrollment from "../models/StudentEnrollment.js";
import { ROLES } from "../config/permissions.js";
import { buildStudyCertificatePdf } from "../services/studyCertificatePdf.js";
import logger from "../utils/logger.js";

const STAFF_ROLES = [
    ROLES.SYSTEMADMIN,
    ROLES.ADMIN,
    ROLES.TEACHER,
    ROLES.SYV,
    ROLES.SPECPED,
    ROLES.COORDINATOR,
];

export const getStudyCertificatePdf = async (req, res) => {
    try {
        const enrollment = await StudentEnrollment.findById(req.params.enrollmentId)
            .populate("mainCourseId", "courseName courseCode")
            .populate({
                path: "teacherId",
                populate: { path: "userId", select: "username" },
            })
            .populate("studentId", "name personalNumber email");

        if (!enrollment) {
            return res.status(404).json({ message: "Ingen antagning hittad" });
        }

        if (enrollment.status !== "completed") {
            return res.status(400).json({
                message: "Studieintyg utfärdas först när kursen är slutförd",
            });
        }

        // Staff can view any certificate; students only their own (matched by email)
        const isStaff = STAFF_ROLES.includes(req.user?.role);
        const studentEmail = enrollment.studentId?.email;
        const callerEmail = req.user?.email;
        const isOwner =
            !!studentEmail &&
            !!callerEmail &&
            String(callerEmail).toLowerCase() === String(studentEmail).toLowerCase();

        if (!isStaff && !isOwner) {
            return res.status(403).json({ message: "Ej behörig" });
        }

        const pdf = buildStudyCertificatePdf({
            studentName: enrollment.studentId?.name || "",
            personalNumber: enrollment.studentId?.personalNumber || "",
            courseName: enrollment.mainCourseId?.courseName || "",
            courseCode: enrollment.mainCourseId?.courseCode || "",
            periodStart: enrollment.startDate,
            periodEnd: enrollment.endDate,
            completedAt: enrollment.completedAt,
            teacherName: enrollment.teacherId?.userId?.username || "",
            certificateNumber: enrollment.completionCertificate || "",
        });

        res.setHeader("Content-Type", "application/pdf");
        res.setHeader(
            "Content-Disposition",
            `attachment; filename="studieintyg-${enrollment._id}.pdf"`
        );
        res.send(pdf);
    } catch (error) {
        logger.error({ err: error, enrollmentId: req.params.enrollmentId }, "Error generating study certificate PDF");
        res.status(500).json({ message: "Något gick fel", error: error.message });
    }
};
