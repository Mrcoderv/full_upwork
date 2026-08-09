import { Router } from "express";
const router = Router();
import mongoose from "mongoose";
import logger from "../utils/logger.js";
import Student from "../models/Student.js";
import { authenticateUser } from "../controllers/authController.js";
import Notification from "../models/Notification.js";
import Course from "../models/Course.js";
import Program from "../models/Program.js";
import CoursePackage from "../models/CoursePackage.js";
import StudentEnrollment from "../models/StudentEnrollment.js";
import CourseInstance from "../models/CourseInstance.js";
import Teacher from "../models/Teacher.js";
import ExamAttendance from "../models/ExamAttendance.js";
import GradingScale from "../models/GradingScale.js";
import {
    gradeFromScale,
    validateScalePayload,
} from "../utils/gradingScale.js";

import {
  createNotification,
  resolveNotification,
  evaluateGradingStatusAndNotify,
  evaluateActionPlanStatusAndNotify,
  checkPendingGradesAndNotify,
} from "../controllers/notificationController.js";
import NOTIFICATION_TYPES from "../controllers/notificationTypes.js";

const ALLOWED_STAFF_ROLES = ["systemadmin", "admin", "teacher", "coordinator", "syv", "specped", "tester"];
const ALLOWED_ADMIN_ROLES = ["systemadmin", "admin"];
const ALLOWED_GRADING_ROLES = ["systemadmin", "admin", "teacher"];

router.get("/students/ungraded", authenticateUser, async (req, res) => {
  if (!ALLOWED_GRADING_ROLES.includes(req.user?.role)) {
    return res.status(403).json({ error: "Forbidden" });
  }
  try {
    await evaluateGradingStatusAndNotify();

    const students = await Student.find({
      education: {
        $elemMatch: {
          removedAt: null,
          $or: [
            { grade: null },
            { grade: "" },
            { locked: false },
            { grade: "F", locked: true },
          ],
        },
      },
    }).lean();

    const enrichedStudents = (
      await Promise.all(
        students.map(async (student) => {
          const relevantEducation = await Promise.all(
            student.education
              .filter(async (edu) => {
                if (edu.removedAt) return false;

                const isUngraded = !edu.grade || edu.grade === "";
                const isFAndLocked = edu.grade === "F" && edu.locked;

                if (isFAndLocked) {
                  const pendingPlan = await Notification.findOne({
                    studentId: student._id,
                    courseId: edu.redId,
                    type: "action_plan_required",
                    resolved: false,
                  });

                  return !!pendingPlan;
                }

                return isUngraded;
              })
              .map(async (edu) => {
                let populated = { ...edu };

                try {
                  if (edu.type === "Course") {
                    const course = await Course.findById(edu.refId).lean();
                    if (course) {
                      populated.details = course;
                      populated.displayName = course.courseName;
                      populated.scriveLink =
                        "https://scrive.com/new/login?lang=sv"; // Anpassa efter behov
                    }
                  } else if (edu.type === "Program") {
                    const program = await Program.findById(edu.refId).lean();
                    if (program) {
                      populated.details = program;
                      populated.displayName = program.programName;
                    }
                  } else if (edu.type === "CoursePackage") {
                    const cp = await CoursePackage.findById(edu.refId).lean();
                    if (cp) {
                      populated.details = cp;
                      populated.displayName = cp.coursePackageName;
                    }
                  }
                } catch (err) {
                  logger.error({ err }, "Fel vid hämtning av utbildningsdata");
                }

                populated.isGraded = !!populated.grade;

                populated.requireActionPlan = edu.grade === "F" && edu.locked;

                return populated;
              })
          );

          return {
            studentId: student._id,
            name: student.name,
            personalNumber: student.personalNumber,
            email: student.email,
            ungradedEducation: relevantEducation,
          };
        })
      )
    ).filter((s) => s.ungradedEducation.length > 0);

    res.json(enrichedStudents);
  } catch (error) {
    logger.error({ err: error }, "Fel vid hämtning av obetygsatta elever");
    res.status(500).json({ message: "Serverfel vid hämtning av elever" });
  }
});

router.put("/admin/unlock-grade", authenticateUser, async (req, res) => {
  const user = req.user;
  if (!(user.role === "admin" || user.role === "systemadmin")) {
    return res
      .status(403)
      .json({ error: "Endast admin/systemadmin kan låsa upp." });
  }
  const { studentId, courseId, enrollmentId } = req.body;

  try {
    let studentName = "Elev";
    let courseName = "Kurs";
    let found = false;

    if (enrollmentId) {
      const enrollment = await StudentEnrollment.findById(enrollmentId)
        .populate("studentId", "name")
        .populate("courseInstanceId", "courseName");
      if (enrollment) {
        found = true;
        enrollment.isGradeLocked = false;
        enrollment.gradeLockedBy = null;
        enrollment.gradeLockedAt = null;
        await enrollment.save();
        if (enrollment.studentId) studentName = enrollment.studentId.name || studentName;
        if (enrollment.courseInstanceId) courseName = enrollment.courseInstanceId.courseName || courseName;
      }
    }

    if (studentId && courseId) {
      const result = await Student.updateOne(
        {
          _id: studentId,
          "education.refId": courseId,
          "education.type": "Course",
          "education.removedAt": null,
        },
        {
          $set: {
            "education.$.locked": false,
          },
        }
      );
      if (result && result.matchedCount > 0) {
        found = true;
      }
      if (StudentEnrollment.updateMany) {
        await StudentEnrollment.updateMany(
          { studentId, courseInstanceId: courseId },
          { $set: { isGradeLocked: false, gradeLockedBy: null, gradeLockedAt: null } }
        );
      }
    }

    if (!found && !enrollmentId) {
      return res.status(404).send("Kurs hittades inte");
    }

    await Notification.create({
      type: NOTIFICATION_TYPES.GRADE_UNLOCKED,
      message: `Admin ${user.name || user.username || 'Admin'} låste upp betyget för ${studentName} (${courseName}).`,
      meta: { studentId, courseId, enrollmentId },
      resolved: false,
    });

    res.send("Betyg upplåst");
  } catch (err) {
    logger.error({ err }, "Upplåsning misslyckades");
    res.status(500).send("Internt serverfel");
  }
});

router.get('/students-to-grade', authenticateUser, async (req, res) => {
  try {
    const now = new Date();
    const user = req.user;
    const isAdmin = user.role === 'admin' || user.role === 'systemadmin';
    
    let teacherId = null;
    let teacherFilter = null;

    // If user is a teacher, get their Teacher record and set up filtering
    if (!isAdmin && user.role === 'teacher') {
      const teacher = await Teacher.findOne({ userId: user.userId });
      if (!teacher) {
        return res.status(403).json({ error: 'Teacher profile not found' });
      }
      teacherId = teacher._id;
      teacherFilter = teacherId;
    }

    // Find enrollments that have passed end date and are not graded
    let enrollmentQuery = {
      endDate: { $lt: now },
      $or: [{ grade: null }, { grade: "" }],
      status: { $in: ["enrolled", "active", "completed"] }
    };

    // If teacher, we'll filter after populating to check relationships
    const enrollments = await StudentEnrollment.find(enrollmentQuery)
      .populate({
        path: "studentId",
        populate: {
          path: "teacherId",
          populate: { path: "userId", select: "username email" },
          select: "userId subject"
        }
      })
      .populate({
        path: "courseInstanceId",
        populate: [
          { path: "mainCourseId", select: "courseName courseCode" },
          {
            path: "responsibleTeacher",
            populate: { path: "userId", select: "username email" },
            select: "userId subject"
          }
        ]
      })
      .lean();

    // Filter enrollments based on teacher access if not admin
    let filteredEnrollments = enrollments;
    if (!isAdmin && teacherFilter) {
      filteredEnrollments = [];
      
      // Get all student IDs and course IDs for batch exam checking
      const studentIds = new Set();
      const courseIds = new Set();
      const enrollmentChecks = [];
      
      for (const enrollment of enrollments) {
        const student = enrollment.studentId;
        const courseInstance = enrollment.courseInstanceId;
        
        // Check if teacher is responsible for student
        const studentTeacherId = student?.teacherId?._id?.toString() || student?.teacherId?.toString();
        const isResponsibleTeacher = studentTeacherId === teacherFilter.toString();
        
        // Check if teacher is responsible for course instance
        const courseInstanceTeacherId = courseInstance?.responsibleTeacher?._id?.toString() || 
                                       courseInstance?.responsibleTeacher?.toString();
        const isCourseInstanceTeacher = courseInstanceTeacherId === teacherFilter.toString();
        
        if (isResponsibleTeacher) {
          // Teacher is responsible for the student - include this enrollment
          filteredEnrollments.push(enrollment);
        } else if (isCourseInstanceTeacher) {
          // Teacher is responsible for the course instance - include ALL students in this course instance
          // No need to check for exams - if teacher is responsible for course instance, they should see all students
          filteredEnrollments.push(enrollment);
        } else {
          // Teacher is not directly responsible, but might have given exams to this student
          // Check if student has done exams with this teacher
          const courseId = courseInstance?.mainCourseId?._id || courseInstance?.mainCourseId;
          if (courseId && student?._id) {
            studentIds.add(student._id.toString());
            courseIds.add(courseId.toString());
            enrollmentChecks.push({ enrollment, studentId: student._id.toString(), courseId: courseId.toString() });
          }
        }
      }
      
      // Batch check for exams if needed
      if (enrollmentChecks.length > 0) {
        const examAttendances = await ExamAttendance.find({
          studentId: { $in: Array.from(studentIds).map(id => new mongoose.Types.ObjectId(id)) },
          courseId: { $in: Array.from(courseIds).map(id => new mongoose.Types.ObjectId(id)) },
          teacherId: teacherFilter
        }).lean();
        
        // Create a set of student-course combinations that have exams
        const examSet = new Set();
        examAttendances.forEach(exam => {
          examSet.add(`${exam.studentId.toString()}-${exam.courseId?.toString()}`);
        });
        
        // Also check student examHistory in batch
        const studentsWithHistory = await Student.find({
          _id: { $in: Array.from(studentIds).map(id => new mongoose.Types.ObjectId(id)) }
        }).select('_id examHistory').lean();
        
        studentsWithHistory.forEach(student => {
          if (student.examHistory) {
            student.examHistory.forEach(exam => {
              if (exam.teacherId?.toString() === teacherFilter.toString() && exam.courseId) {
                examSet.add(`${student._id.toString()}-${exam.courseId.toString()}`);
              }
            });
          }
        });
        
        // Filter enrollments based on exam checks
        enrollmentChecks.forEach(({ enrollment, studentId, courseId }) => {
          if (examSet.has(`${studentId}-${courseId}`)) {
            filteredEnrollments.push(enrollment);
          }
        });
      }
    }

    // Format for frontend (from StudentEnrollment)
    const studentsFromEnrollments = filteredEnrollments.map(enrollment => ({
      student: enrollment.studentId,
      courseInstance: enrollment.courseInstanceId,
      endDate: enrollment.endDate,
      grade: enrollment.grade || null,
      reason: enrollment.motivation || '', // Map motivation to reason for frontend
      comments: enrollment.comments || '',
      locked: enrollment.isGradeLocked || false,
      npScore: enrollment.nationalTestPoints ?? null,
      enrollmentId: enrollment._id.toString(),
      source: 'enrollment',
    }));

    // Also include students from Student.education entries (older data path)
    let studentEducationQuery = {
      education: {
        $elemMatch: {
          removedAt: null,
          endDate: { $lt: now },
          $or: [{ grade: null }, { grade: "" }],
        },
      },
    };

    // For teachers, we need to check both responsible students AND students in their courses with exams
    // So we'll fetch all matching students and filter after
    const studentsWithPastEducation = await Student.find(studentEducationQuery).lean();

    const studentsFromEducation = [];
    
    // Batch check for course instances and exams if teacher
    let courseInstanceMap = new Map();
    let examCheckMap = new Map();
    
    if (!isAdmin && teacherFilter) {
      // Get all unique course IDs from education entries
      const courseIds = new Set();
      const studentCoursePairs = [];
      
      for (const s of studentsWithPastEducation) {
        for (const edu of (s.education || [])) {
          if (!edu || edu.removedAt) continue;
          if (!edu.endDate || edu.endDate >= now) continue;
          if (edu.grade && edu.grade !== "") continue;
          if (edu.refId) {
            courseIds.add(edu.refId.toString());
            studentCoursePairs.push({ studentId: s._id.toString(), courseId: edu.refId.toString() });
          }
        }
      }
      
      // Batch fetch course instances
      if (courseIds.size > 0) {
        const courseInstances = await CourseInstance.find({
          mainCourseId: { $in: Array.from(courseIds).map(id => new mongoose.Types.ObjectId(id)) },
          responsibleTeacher: teacherFilter
        }).lean();
        
        courseInstances.forEach(ci => {
          const key = ci.mainCourseId.toString();
          if (!courseInstanceMap.has(key)) {
            courseInstanceMap.set(key, []);
          }
          courseInstanceMap.get(key).push(ci);
        });
      }
      
      // Batch fetch exam attendances
      const studentIds = Array.from(new Set(studentsWithPastEducation.map(s => s._id.toString())));
      if (studentIds.length > 0 && courseIds.size > 0) {
        const examAttendances = await ExamAttendance.find({
          studentId: { $in: studentIds.map(id => new mongoose.Types.ObjectId(id)) },
          courseId: { $in: Array.from(courseIds).map(id => new mongoose.Types.ObjectId(id)) },
          teacherId: teacherFilter
        }).lean();
        
        examAttendances.forEach(exam => {
          const key = `${exam.studentId.toString()}-${exam.courseId?.toString()}`;
          examCheckMap.set(key, true);
        });
      }
    }
    
    for (const s of studentsWithPastEducation) {
      const studentTeacherMatches = !isAdmin && teacherFilter 
        ? s.teacherId?.toString() === teacherFilter.toString() 
        : true; // Admins see all
      
      for (const edu of (s.education || [])) {
        if (!edu || edu.removedAt) continue;
        if (!edu.endDate || edu.endDate >= now) continue;
        if (edu.grade && edu.grade !== "") continue;

        // For teacher filtering
        if (!isAdmin && teacherFilter) {
          if (!studentTeacherMatches && edu.refId) {
            // Check if there's a course instance with this teacher
            const courseInstances = courseInstanceMap.get(edu.refId.toString());
            if (!courseInstances || courseInstances.length === 0) {
              // No course instance with this teacher, skip
              continue;
            }
            
            // Check if student has done exams for this course with this teacher
            const examKey = `${s._id.toString()}-${edu.refId.toString()}`;
            const hasExam = examCheckMap.has(examKey);
            
            // Also check student's examHistory
            const hasExamInHistory = s.examHistory?.some(exam => 
              exam.teacherId?.toString() === teacherFilter.toString() &&
              exam.courseId?.toString() === edu.refId.toString()
            );
            
            if (!hasExam && !hasExamInHistory) {
              // Student hasn't done exams, skip this education entry
              continue;
            }
          }
        }

        studentsFromEducation.push({
          student: { _id: s._id, name: s.name, email: s.email },
          courseInstance: null,
          endDate: edu.endDate,
          grade: edu.grade || null,
          npScore: edu.npScore ?? null,
          enrollmentId: edu._id, // refers to education entry id
          courseRefId: edu.refId, // The actual course ID for saving grades
          courseName: edu.name || null, // Course name if available
          courseCode: null, // Will need to be populated from Course model if needed
          source: "student_education",
        });
      }
    }

    const studentsToGrade = [...studentsFromEnrollments, ...studentsFromEducation]
      .sort((a, b) => new Date(a.endDate) - new Date(b.endDate));

    res.json(studentsToGrade);
  } catch (err) {
    logger.error({ err }, "Error fetching students to grade");
    res.status(500).send('Server error');
  }
});

router.post("/teacher/save-grade", authenticateUser, async (req, res) => {
  if (!ALLOWED_GRADING_ROLES.includes(req.user?.role)) {
    return res.status(403).json({ error: "Forbidden" });
  }
  const { studentId, courseId, grade, reason, comments, npScore, type } =
    req.body;

  try {
    const result = await Student.updateOne(
      {
        _id: studentId,
        "education.refId": courseId,
      },
      {
        $set: {
          "education.$.grade": grade,
          "education.$.reason": reason,
          "education.$.comments": comments,
          "education.$.npScore": npScore,
          "education.$.type": type,
        },
      }
    );

    if (grade === "F") {
      await createNotification({
        studentId,
        courseId,
        type: "action_plan_required",
        message: "Handlingsplan krävs pga elever med F i betyg",
      });
    } else {
      await resolveNotification({
        studentId,
        courseId,
        type: "action_plan_required",
      });
    }

    // 🔁 Kontrollera global notisstatus
    await evaluateGradingStatusAndNotify();
    await evaluateActionPlanStatusAndNotify();

    res.send("✅ Betyg sparat!");
  } catch (err) {
    logger.error({ err }, "Error saving grade");
    res.status(500).send("Server error");
  }
});

router.post("/teacher/lock-grade", authenticateUser, async (req, res) => {
  const { studentId, courseId, enrollmentId } = req.body;
  const role = req.user?.role;
  const userId = req.user?.userId;

  if (!ALLOWED_GRADING_ROLES.includes(role)) {
    return res
      .status(403)
      .json({ error: "Endast behörig personal kan låsa betyg." });
  }

  try {
    let studentName = "Elev";
    let courseName = "Kurs";
    let targetStudentId = studentId;
    let targetCourseId = courseId;

    if (enrollmentId) {
      const enrollment = await StudentEnrollment.findById(enrollmentId)
        .populate("studentId", "name")
        .populate("courseInstanceId", "courseName");
      if (!enrollment) {
        return res.status(404).json({ error: "Enrollment not found" });
      }
      enrollment.isGradeLocked = true;
      enrollment.gradeLockedBy = userId;
      enrollment.gradeLockedAt = new Date();
      await enrollment.save();

      if (enrollment.studentId) studentName = enrollment.studentId.name || studentName;
      if (enrollment.courseInstanceId) courseName = enrollment.courseInstanceId.courseName || courseName;
      targetStudentId = enrollment.studentId?._id?.toString() || targetStudentId;
    } else if (targetStudentId) {
      const student = await Student.findById(targetStudentId);
      if (!student) {
        return res.status(404).json({ error: "Student not found" });
      }
      studentName = student.name || studentName;
      if (targetCourseId && Array.isArray(student.education)) {
        const educationEntry = student.education.find(
          (edu) => edu.refId?.toString() === targetCourseId.toString()
        );
        if (!educationEntry) {
          return res.status(404).json({ error: "Course not found in student's education" });
        }
        educationEntry.locked = true;
        courseName = educationEntry.name || courseName;
      } else {
        return res.status(404).json({ error: "Course not found in student's education" });
      }
      await student.save();

      if (StudentEnrollment.updateMany) {
        await StudentEnrollment.updateMany(
          { studentId: targetStudentId, courseInstanceId: targetCourseId },
          { $set: { isGradeLocked: true, gradeLockedBy: userId, gradeLockedAt: new Date() } }
        );
      }
    } else {
      return res
        .status(400)
        .json({ error: "studentId eller enrollmentId krävs för att låsa betyg." });
    }

    const lockerName = req.user?.name || req.user?.username || "Användare";
    await Notification.create({
      type: NOTIFICATION_TYPES.GRADE_LOCKED,
      message: `Betyg låst för ${studentName} (${courseName}) av ${role === "teacher" ? "lärare" : "admin"} ${lockerName}.`,
      meta: {
        studentId: targetStudentId,
        courseId: targetCourseId,
        enrollmentId: enrollmentId || null,
        teacherId: userId,
      },
      resolved: false,
    });

    return res.status(200).json({ message: "Grade locked", locked: true });
  } catch (error) {
    logger.error({ err: error }, "Error locking grade");
    res.status(500).json({ error: "Server error" });
  }
});


// Delete an enrollment by ID
router.delete('/enrollments/:id', authenticateUser, async (req, res) => {
  if (!ALLOWED_ADMIN_ROLES.includes(req.user?.role)) {
    return res.status(403).json({ error: "Only administrators can delete enrollments" });
  }
  try {
    const { id } = req.params;
    const enrollment = await StudentEnrollment.findByIdAndDelete(id);
    if (!enrollment) {
      return res.status(404).json({ error: 'Enrollment not found' });
    }
    res.json({ success: true, message: 'Enrollment deleted' });
  } catch (err) {
    logger.error({ err }, "Error deleting enrollment");
    res.status(500).json({ error: 'Failed to delete enrollment' });
  }
});

// ===== ADDITIONAL GRADING ROUTES =====

// Debug endpoint to check what students-to-grade endpoint returns
router.get('/debug/students-to-grade', authenticateUser, async (req, res) => {
  if (!ALLOWED_ADMIN_ROLES.includes(req.user?.role)) {
    return res.status(403).json({ error: "Forbidden" });
  }
  try {
    const now = new Date();

    // Find enrollments that have passed end date and are not graded
    const enrollments = await StudentEnrollment.find({
      endDate: { $lt: now },
      $or: [{ grade: null }, { grade: "" }],
      status: { $in: ["enrolled", "active", "completed"] }
    })
      .populate("studentId", "name email")
      .populate({
        path: "courseInstanceId",
        populate: { path: "mainCourseId", select: "courseName courseCode" }
      })
      .lean();

    // Also check Student.education entries
    const studentsWithPastEducation = await Student.find({
      education: {
        $elemMatch: {
          removedAt: null,
          endDate: { $lt: now },
          $or: [{ grade: null }, { grade: "" }],
        },
      },
    })
      .select("name email education")
      .lean();

    res.json({
      success: true,
      debug: {
        now: now.toISOString(),
        enrollments: {
          count: enrollments.length,
          data: enrollments.map(e => ({
            student: e.studentId?.name || "Unknown",
            studentId: e.studentId?._id,
            courseInstance: e.courseInstanceId?.courseCode || "N/A",
            courseName: e.courseInstanceId?.courseName || e.courseInstanceId?.mainCourseId?.courseName || "Unknown",
            endDate: e.endDate ? new Date(e.endDate).toISOString().split('T')[0] : null,
            grade: e.grade,
            status: e.status,
            enrollmentId: e._id
          }))
        },
        studentEducation: {
          count: studentsWithPastEducation.length,
          data: studentsWithPastEducation.map(s => ({
            student: s.name,
            studentId: s._id,
            educationEntries: s.education?.filter(e => 
              !e.removedAt && 
              e.endDate && 
              new Date(e.endDate) < now && 
              (!e.grade || e.grade === "")
            ).map(e => ({
              endDate: e.endDate ? new Date(e.endDate).toISOString().split('T')[0] : null,
              grade: e.grade,
              refId: e.refId,
              name: e.name,
              type: e.type
            }))
          }))
        }
      }
    });
  } catch (error) {
    logger.error({ err: error }, "Error in debug endpoint");
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Debug endpoint to check what students exist
router.get('/debug/students-past-end-date', authenticateUser, async (req, res) => {
  if (!ALLOWED_ADMIN_ROLES.includes(req.user?.role)) {
    return res.status(403).json({ error: "Forbidden" });
  }
  try {
    const now = new Date();
    
    // Check StudentEnrollment
    const enrollments = await StudentEnrollment.find({
      endDate: { $lt: now },
      status: { $in: ["active", "completed", "enrolled"] }
    })
    .populate("studentId", "name email")
    .populate("mainCourseId", "courseName")
    .populate("teacherId", "userId")
    .populate("teacherId.userId", "username")
    .lean();

    // Check Student.education
    const students = await Student.find({
      education: {
        $elemMatch: {
          removedAt: null,
          endDate: { $lt: now }
        }
      }
    })
    .populate("teacherId", "userId")
    .populate("teacherId.userId", "username")
    .lean();

    res.json({
      success: true,
      debug: {
        now: now.toISOString(),
        enrollments: {
          total: enrollments.length,
          data: enrollments.map(e => ({
            id: e._id,
            student: e.studentId?.name,
            course: e.mainCourseId?.courseName,
            endDate: e.endDate,
            status: e.status,
            grade: e.grade,
            teacher: e.teacherId?.userId?.username
          }))
        },
        students: {
          total: students.length,
          data: students.map(s => ({
            id: s._id,
            name: s.name,
            teacher: s.teacherId?.userId?.username,
            education: s.education.filter(e => e.endDate && e.endDate < now).map(e => ({
              id: e._id,
              name: e.name,
              endDate: e.endDate,
              grade: e.grade,
              locked: e.locked
            }))
          }))
        }
      }
    });
  } catch (error) {
    logger.error({ err: error }, "Error in debug endpoint");
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get locked grades for admin review
router.get('/locked-grades', authenticateUser, async (req, res) => {
  try {
    const user = req.user;
    if (!["admin", "systemadmin"].includes(user.role)) {
      return res.status(403).json({ error: 'Only administrators can view locked grades' });
    }

    const lockedGrades = await StudentEnrollment.find({
      isGradeLocked: true,
    })
      .populate("studentId", "name email personalNumber")
      .populate("courseInstanceId", "courseName courseCode")
      .populate("mainCourseId", "courseName courseCode")
      .populate("teacherId", "userId subject")
      .populate("teacherId.userId", "username email")
      .populate("gradeLockedBy", "username email")
      .sort({ gradeLockedAt: -1 });

    res.json({
      success: true,
      lockedGrades,
      total: lockedGrades.length,
    });
  } catch (error) {
    logger.error({ err: error }, "Error fetching locked grades");
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get grades for a specific student
router.get('/student/:studentId/grades', authenticateUser, async (req, res) => {
  if (!ALLOWED_STAFF_ROLES.includes(req.user?.role)) {
    return res.status(403).json({ error: "Forbidden" });
  }
  try {
    const { studentId } = req.params;
    
    const grades = await StudentEnrollment.find({
      studentId,
      grade: { $ne: null },
    })
      .populate("courseInstanceId", "courseName courseCode startDate endDate")
      .populate("mainCourseId", "courseName courseCode")
      .populate("teacherId", "userId subject")
      .populate("teacherId.userId", "username email")
      .populate("gradeBy", "username email")
      .sort({ gradeDate: -1 });

    res.json({
      success: true,
      grades,
      total: grades.length,
    });
  } catch (error) {
    logger.error({ err: error }, "Error fetching student grades");
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get grades for a specific course instance
router.get('/course-instance/:courseInstanceId/grades', authenticateUser, async (req, res) => {
  if (!ALLOWED_STAFF_ROLES.includes(req.user?.role)) {
    return res.status(403).json({ error: "Forbidden" });
  }
  try {
    const { courseInstanceId } = req.params;
    
    const grades = await StudentEnrollment.find({
      courseInstanceId,
      grade: { $ne: null },
    })
      .populate("studentId", "name email personalNumber")
      .populate("courseInstanceId", "courseName courseCode startDate endDate")
      .populate("mainCourseId", "courseName courseCode")
      .populate("teacherId", "userId subject")
      .populate("teacherId.userId", "username email")
      .populate("gradeBy", "username email")
      .sort({ gradeDate: -1 });

    res.json({
      success: true,
      grades,
      total: grades.length,
    });
  } catch (error) {
    logger.error({ err: error }, "Error fetching course instance grades");
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update grade (if not locked)
router.put('/update-grade/:enrollmentId', authenticateUser, async (req, res) => {
  if (!ALLOWED_GRADING_ROLES.includes(req.user?.role)) {
    return res.status(403).json({ error: "Forbidden" });
  }
  try {
    const { enrollmentId } = req.params;
    const { grade, motivation, comments, nationalTestPoints } = req.body;
    const userId = req.user?.userId;

    const enrollment = await StudentEnrollment.findById(enrollmentId);
    if (!enrollment) {
      return res.status(404).json({ error: 'Enrollment not found' });
    }

    if (enrollment.isGradeLocked) {
      return res.status(403).json({ error: 'Grade is locked and cannot be modified' });
    }

    // Update grade fields
    if (grade) enrollment.grade = grade;
    if (motivation) enrollment.motivation = motivation;
    if (comments !== undefined) enrollment.comments = comments;
    if (nationalTestPoints !== undefined) enrollment.nationalTestPoints = nationalTestPoints;
    
    enrollment.gradeDate = new Date();
    enrollment.gradeBy = userId;

    await enrollment.save();

    res.json({
      success: true,
      message: 'Grade updated successfully',
      enrollment,
    });
  } catch (error) {
    logger.error({ err: error }, "Error updating grade");
    res.status(500).json({ error: 'Internal server error' });
  }
});

// --- Grading scales (national tests: Engelska/Svenska/Matematik) ---
// The points->grade scale changes annually (e.g. HT24) and is managed by
// admins/systemadmins. Writes are admin-only; reads are allowed for staff.

router.get("/grading-scale", authenticateUser, async (req, res) => {
  if (!ALLOWED_STAFF_ROLES.includes(req.user?.role)) {
    return res.status(403).json({ error: "Forbidden" });
  }
  try {
    const { term, subject } = req.query;
    const query = {};
    if (term) query.term = term;
    if (subject) query.subject = subject;
    const scales = await GradingScale.find(query).sort({ term: 1, subject: 1 }).lean();
    res.json(scales);
  } catch (error) {
    logger.error({ err: error }, "Error listing grading scales");
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get("/grading-scale/terms", authenticateUser, async (req, res) => {
  if (!ALLOWED_STAFF_ROLES.includes(req.user?.role)) {
    return res.status(403).json({ error: "Forbidden" });
  }
  try {
    const terms = await GradingScale.distinct("term");
    res.json(terms.sort());
  } catch (error) {
    logger.error({ err: error }, "Error listing grading scale terms");
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Suggest the grade a national-test score yields for a term+subject.
router.get("/grading-scale/suggest", authenticateUser, async (req, res) => {
  if (!ALLOWED_STAFF_ROLES.includes(req.user?.role)) {
    return res.status(403).json({ error: "Forbidden" });
  }
  try {
    const { term, subject } = req.query;
    const points = Number(req.query.points);
    if (!term || !subject || !Number.isFinite(points)) {
      return res.status(400).json({ error: "term, subject och points krävs" });
    }
    const scale = await GradingScale.findOne({ term, subject }).lean();
    if (!scale) {
      return res.json({ grade: null, hasScale: false });
    }
    const grade = gradeFromScale(points, scale.scale);
    res.json({ grade, hasScale: true });
  } catch (error) {
    logger.error({ err: error }, "Error suggesting grade from scale");
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post("/grading-scale", authenticateUser, async (req, res) => {
  if (!ALLOWED_ADMIN_ROLES.includes(req.user?.role)) {
    return res.status(403).json({ error: "Endast admin/systemadmin kan ändra betygsskalor." });
  }
  try {
    const { term, subject, scale } = req.body || {};
    const validationError = validateScalePayload(term, subject, scale);
    if (validationError) {
      return res.status(400).json({ error: validationError });
    }
    const existing = await GradingScale.findOne({ term, subject });
    if (existing) {
      return res.status(409).json({ error: "En betygsskala för den termen och det ämnet finns redan." });
    }
    const doc = await GradingScale.create({ term: term.trim(), subject: subject.trim(), scale });
    res.status(201).json(doc);
  } catch (error) {
    logger.error({ err: error }, "Error creating grading scale");
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.put("/grading-scale/:id", authenticateUser, async (req, res) => {
  if (!ALLOWED_ADMIN_ROLES.includes(req.user?.role)) {
    return res.status(403).json({ error: "Endast admin/systemadmin kan ändra betygsskalor." });
  }
  try {
    const { id } = req.params;
    const { term, subject, scale } = req.body || {};
    const validationError = validateScalePayload(term, subject, scale);
    if (validationError) {
      return res.status(400).json({ error: validationError });
    }
    const existing = await GradingScale.findById(id);
    if (!existing) {
      return res.status(404).json({ error: "Betygsskalan hittades inte." });
    }
    const dup = await GradingScale.findOne({
      term: term.trim(),
      subject: subject.trim(),
      _id: { $ne: id },
    });
    if (dup) {
      return res.status(409).json({ error: "En betygsskala för den termen och det ämnet finns redan." });
    }
    existing.term = term.trim();
    existing.subject = subject.trim();
    existing.scale = scale;
    await existing.save();
    res.json(existing);
  } catch (error) {
    logger.error({ err: error }, "Error updating grading scale");
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.delete("/grading-scale/:id", authenticateUser, async (req, res) => {
  if (!ALLOWED_ADMIN_ROLES.includes(req.user?.role)) {
    return res.status(403).json({ error: "Endast admin/systemadmin kan ändra betygsskalor." });
  }
  try {
    const { id } = req.params;
    const deleted = await GradingScale.findByIdAndDelete(id);
    if (!deleted) {
      return res.status(404).json({ error: "Betygsskalan hittades inte." });
    }
    res.json({ success: true, message: "Betygsskala borttagen." });
  } catch (error) {
    logger.error({ err: error }, "Error deleting grading scale");
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
