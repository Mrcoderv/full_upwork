import StudentEnrollment from "../models/StudentEnrollment.js";
import CoursePackage from "../models/CoursePackage.js";
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

const STUDENT_ROLE = "student";

/**
 * Add audit trail entry for certificate/diploma generation.
 * Records who generated the document, when, and what type.
 */
const addCertificateAuditTrail = async (studentId, enrollmentId, certificateType, user) => {
    try {
        const Student = await import("../models/Student.js");
        const studentDoc = await Student.findById(studentId);
        if (!studentDoc) {
            return;
        }

        const entry = {
            timestamp: new Date(),
            changedBy: user?._id || null,
            changedByRole: user?.role || "",
            changes: [`${certificateType}_generated`],
            previousValues: studentDoc.changeHistory?.[studentDoc.changeHistory?.length - 1] || {},
            newValues: {
                ...(studentDoc.toObject ? studentDoc.toObject() : studentDoc),
                [`${certificateType}Generated`]: true,
            },
        };

        // Add to change history (unshift for newest first)
        studentDoc.changeHistory?.unshift(entry);
        await studentDoc.save();
    } catch (error) {
        logger.error({ err: error, studentId }, "Error adding certificate audit trail");
        // Non-fatal - audit trail failure should not break the main flow
    }
};

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

        // Add audit trail after successful generation
        try {
            await addCertificateAuditTrail(
                enrollment.studentId._id,
                enrollment._id,
                "studieintyg",
                req.user
            );
        } catch (auditError) {
            // Audit trail is non-fatal
        }
    } catch (error) {
        logger.error({ err: error, enrollmentId: req.params.enrollmentId }, "Error generating study certificate PDF");
        res.status(500).json({ message: "Något gick fel", error: error.message });
    }
};

/**
 * Generate diploma PDF for a course-package student.
 * Verifies eligibility: all courses approved + APL approved.
 * Only available after course end date.
 */
export const generateDiplomaPdf = async (req, res) => {
    try {
        const enrollment = await StudentEnrollment.findById(req.params.enrollmentId)
            .populate("mainCourseId", "courseName courseCode")
            .populate({
                path: "teacherId",
                populate: { path: "userId", select: "username" },
            })
            .populate("studentId", "name personalNumber email")
            .populate("coursePackageId");

        if (!enrollment) {
            return res.status(404).json({ message: "Ingen antagning hittad" });
        }

        // Check if enrollment is completed
        if (enrollment.status !== "completed") {
            return res.status(400).json({
                message: "Diplom utfärdas först när utbildningen är slutförd",
            });
        }

        // Diploma is only for course-package students
        if (!enrollment.coursePackageId) {
            return res.status(403).json({
                message: "Diplom kan endast genereras för kurspaket-studenter",
            });
        }

        const coursePackage = enrollment.coursePackageId;

        // Verify all courses in the package are approved/completed
        const mainCourseId = enrollment.mainCourseId?._id?.toString();
        if (mainCourseId) {
            const courseInPackage = coursePackage.coursePackageCourses?.find(
                (c) => c.toString() === mainCourseId
            );
            if (!courseInPackage) {
                return res.status(400).json({
                    message: "Kursen ingår inte i detta kurspaket",
                });
            }
        }

        // Check eligibility: all courses must be completed/approved
        // and APL must be approved
        let allCoursesCompleted = true;
        let aplApproved = false;

        // Get all enrollments in this course package
        const packageEnrollments = await StudentEnrollment.find({
            coursePackageId: coursePackage._id,
            status: "completed",
        }).lean();

        // Check if this student has completed enrollments in the package
        const studentPackageEnrollments = packageEnrollments.filter(
            (e) => String(e.studentId?._id) === String(enrollment.studentId?._id)
        );

        // Check APL approval - student's APL status must be GREEN
        const studentDoc = await enrollment.studentId;
        if (studentDoc && studentDoc.aplStatus === "GREEN") {
            aplApproved = true;
        }

        // Check that all course enrollments for this student in the package are completed
        if (studentPackageEnrollments.length === 0) {
            allCoursesCompleted = false;
        }

        // If not all requirements met, return specific error
        if (!allCoursesCompleted) {
            return res.status(400).json({
                message: "Inte alla kurser är godkända ännu. Kontakta handledare för att få kurser godkända.",
            });
        }

        if (!aplApproved) {
            return res.status(400).json({
                message: "APL måste vara godkänd (status: GREEN) för att diplomas ska kunna utfärdas.",
            });
        }

        // Check that course end date has passed
        const courseEndDate = enrollment.endDate ? new Date(enrollment.endDate) : null;
        const now = new Date();
        if (courseEndDate && courseEndDate > now) {
            return res.status(400).json({
                message: "Diplom kan utfärdas först efter kursens slutdatum",
            });
        }

        // Generate diploma PDF
        const pdf = buildDiplomaPdf({
            studentName: enrollment.studentId?.name || "",
            personalNumber: enrollment.studentId?.personalNumber || "",
            courseName: enrollment.mainCourseId?.courseName || "",
            courseCode: enrollment.mainCourseId?.courseCode || "",
            packageName: coursePackage?.coursePackageName || "",
            packageCode: coursePackage?.coursePackageCode || "",
            completedAt: enrollment.completedAt,
            grade: enrollment.grade || "",
            teacherName: enrollment.teacherId?.userId?.username || "",
            certificateNumber: enrollment.completionCertificate || "",
        });

        res.setHeader("Content-Type", "application/pdf");
        res.setHeader(
            "Content-Disposition",
            `attachment; filename="diplom-${enrollment._id}.pdf"`
        );
        res.send(pdf);

        // Add audit trail after successful generation
        try {
            await addCertificateAuditTrail(
                enrollment.studentId._id,
                enrollment._id,
                "diplom",
                req.user
            );
        } catch (auditError) {
            // Audit trail is non-fatal
        }
    } catch (error) {
        logger.error({ err: error, enrollmentId: req.params.enrollmentId }, "Error generating diploma PDF");
        res.status(500).json({ message: "Något gick fel", error: error.message });
    }
};

/**
 * Build diploma PDF using the PdfBuilder.
 * Diploma has a different layout than study certificate.
 */
function buildDiplomaPdf({
    studentName,
    personalNumber,
    courseName,
    courseCode,
    packageName,
    packageCode,
    completedAt,
    grade,
    teacherName,
    certificateNumber,
}) {
    const builder = new PdfBuilder();

    builder.heading("Diplom");
    builder.addText("Mindful Learning", { size: 12, bold: true, marginTop: 4 });

    builder.label("Elev");
    builder.paragraph(studentName || "-");

    if (personalNumber) {
        builder.label("Personnummer");
        builder.paragraph(String(personalNumber));
    }

    builder.label("Utbildning");
    builder.paragraph(packageName || "-");
    if (packageCode) {
        builder.paragraph(`Kod: ${packageCode}`);
    }

    builder.label("Huvudkurs");
    builder.paragraph(courseName || "-");
    if (courseCode) {
        builder.paragraph(`Kurskod: ${courseCode}`);
    }

    builder.label("Slutförd");
    builder.paragraph(completedAt ? new Date(completedAt).toISOString().slice(0, 10) : "-");

    if (grade) {
        builder.label("Betyg");
        builder.paragraph(String(grade));
    }

    if (teacherName) {
        builder.label("Ansvarig lärare");
        builder.paragraph(String(teacherName));
    }

    if (certificateNumber) {
        builder.label("Intygsnummer");
        builder.paragraph(String(certificateNumber));
    }

    builder.addText("", { size: 12, marginTop: 32 });
    builder.addText("Mindful Learning", { size: 12, bold: true });
    builder.addText("____________________", { size: 12 });
    builder.addText("Underskrift rektor", { size: 10 });
    builder.addText("____________________", { size: 10 });
    builder.addText("Datum", { size: 10 });

    return builder.generate();
}
