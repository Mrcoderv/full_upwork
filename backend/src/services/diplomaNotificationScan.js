/**
 * Diploma notification scan.
 *
 * Runs daily (via scheduler). For each course-package enrollment where:
 *  - the student has completed ALL courses in the package, AND
 *  - APL status is GREEN, AND
 *  - no unresolved diploma_ready notification already exists
 * → creates a diploma_ready notification prompting staff to generate the diploma.
 */
import logger from "../utils/logger.js";
import StudentEnrollment from "../models/StudentEnrollment.js";
import Student from "../models/Student.js";
import CoursePackage from "../models/CoursePackage.js";
import Notification from "../models/Notification.js";
import NOTIFICATION_TYPES from "../controllers/notificationTypes.js";

export async function runDiplomaNotificationScan() {
    const created = [];
    let skipped = 0;

    // 1. Find all enrollments linked to a course package with status completed
    const completedPackageEnrollments = await StudentEnrollment.find({
        coursePackageId: { $exists: true, $ne: null },
        status: "completed",
    }).lean();

    if (!completedPackageEnrollments.length) {
        return { checked: 0, created: 0, skipped: 0 };
    }

    for (const enrollment of completedPackageEnrollments) {
        try {
            const studentId = enrollment.studentId;
            const coursePackageId = enrollment.coursePackageId;

            // 2. Check student APL status
            const student = await Student.findById(studentId).select("aplStatus name").lean();
            if (!student || student.aplStatus !== "GREEN") {
                skipped++;
                continue;
            }

            // 3. Find all courses in this package
            const pkg = await CoursePackage.findById(coursePackageId).lean();
            if (!pkg || !pkg.courses?.length) {
                skipped++;
                continue;
            }

            // 4. Check all package courses are completed for this student
            const packageCourseIds = pkg.courses.map((c) => c.courseId || c._id);
            const completedCount = await StudentEnrollment.countDocuments({
                studentId,
                courseId: { $in: packageCourseIds },
                status: "completed",
            });

            if (completedCount < packageCourseIds.length) {
                skipped++;
                continue;
            }

            // 5. Deduplicate — skip if an unresolved diploma_ready already exists
            const existing = await Notification.findOne({
                type: NOTIFICATION_TYPES.DIPLOMA_READY,
                "meta.studentId": studentId,
                "meta.coursePackageId": coursePackageId,
                resolved: false,
            }).lean();

            if (existing) {
                skipped++;
                continue;
            }

            // 6. Create the notification
            const notification = await Notification.create({
                type: NOTIFICATION_TYPES.DIPLOMA_READY,
                message: `Diplom kan genereras för ${student.name || "eleven"} — alla kurser och APL är godkända.`,
                studentId,
                resolved: false,
                meta: {
                    studentId,
                    coursePackageId,
                    url: `/diploma/${enrollment._id}/pdf`,
                },
            });

            created.push(notification._id);
        } catch (err) {
            logger.error(
                { err, enrollmentId: enrollment._id },
                "Diploma notification scan — failed for enrollment"
            );
        }
    }

    const summary = { checked: completedPackageEnrollments.length, created: created.length, skipped };
    logger.info(summary, "Diploma notification scan finished");
    return summary;
}
