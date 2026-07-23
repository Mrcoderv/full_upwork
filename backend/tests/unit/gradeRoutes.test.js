import express from "express";
import request from "supertest";
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../src/controllers/authController.js", () => ({
  authenticateUser: (req, res, next) => {
    const role = req.headers["x-user-role"] || "teacher";
    req.user = { role, userId: "user123", name: "TestUser" };
    next();
  },
}));

const createLeanResult = (value) => ({
  lean: vi.fn().mockResolvedValue(value),
});

const createQueryChain = (result) => {
  const chain = {
    populate: vi.fn(() => chain),
    sort: vi.fn(() => chain),
    lean: vi.fn(() => chain),
    then: (onFulfilled, onRejected) =>
      Promise.resolve(result).then(onFulfilled, onRejected),
    catch: (fn) => Promise.resolve(result).catch(fn),
  };
  return chain;
};

const createEnrollmentRecord = (overrides = {}) => ({
  _id: "enroll-1",
  studentId: { _id: "stu1", name: "Student", email: "s@a", personalNumber: "123" },
  courseInstanceId: { _id: "ci1", courseName: "Math", courseCode: "MATH101" },
  mainCourseId: { _id: "course-1", courseName: "Math" },
  grade: null,
  endDate: new Date(Date.now() - 86400000),
  status: "completed",
  isGradeLocked: false,
  save: vi.fn().mockResolvedValue(true),
  ...overrides,
});

vi.mock("../../src/controllers/notificationController.js", () => ({
  createNotification: vi.fn(),
  resolveNotification: vi.fn(),
  evaluateGradingStatusAndNotify: vi.fn(),
  evaluateActionPlanStatusAndNotify: vi.fn(),
  checkPendingGradesAndNotify: vi.fn(),
}));

vi.mock("../../src/models/Student.js", () => ({
  __esModule: true,
  default: {
    find: vi.fn(),
    updateOne: vi.fn(),
    findById: vi.fn(),
    findByIdAndDelete: vi.fn(),
  },
}));
vi.mock("../../src/models/Notification.js", () => ({
  __esModule: true,
  default: {
    findOne: vi.fn(),
    create: vi.fn(),
  },
}));
vi.mock("../../src/models/Course.js", () => ({
  __esModule: true,
  default: {
    findById: vi.fn(),
  },
}));
vi.mock("../../src/models/Program.js", () => ({
  __esModule: true,
  default: {
    findById: vi.fn(),
  },
}));
vi.mock("../../src/models/Teacher.js", () => ({
  __esModule: true,
  default: {
    findOne: vi.fn().mockResolvedValue({ _id: "teacher-1", userId: "user123" }),
  },
}));
vi.mock("../../src/models/CoursePackage.js", () => ({
  __esModule: true,
  default: {
    findById: vi.fn(),
  },
}));
vi.mock("../../src/models/StudentEnrollment.js", () => ({
  __esModule: true,
  default: {
    find: vi.fn(),
    countDocuments: vi.fn(),
    findOne: vi.fn(),
    findByIdAndDelete: vi.fn(),
    findById: vi.fn(),
  },
}));
vi.mock("../../src/models/CourseInstance.js", () => ({
  __esModule: true,
  default: {
    find: vi.fn(),
  },
}));

import gradeRoutes from "../../src/router/gradeRoutes.js";
import * as NotificationController from "../../src/controllers/notificationController.js";
import Notification from "../../src/models/Notification.js";
import Student from "../../src/models/Student.js";
import Course from "../../src/models/Course.js";
import Program from "../../src/models/Program.js";
import CoursePackage from "../../src/models/CoursePackage.js";
import StudentEnrollment from "../../src/models/StudentEnrollment.js";
import CourseInstance from "../../src/models/CourseInstance.js";

const app = express();
app.use(express.json());
app.use("/grades", gradeRoutes);

beforeEach(() => {
  vi.clearAllMocks();
  StudentEnrollment.find.mockReturnValue(createQueryChain([]));
  Notification.findOne.mockResolvedValue(null);
  Notification.create.mockResolvedValue({ _id: "note" });
  Course.findById.mockResolvedValue({ lean: vi.fn().mockResolvedValue(null) });
  Program.findById.mockResolvedValue({ lean: vi.fn().mockResolvedValue(null) });
  CoursePackage.findById.mockResolvedValue({ lean: vi.fn().mockResolvedValue(null) });
});

describe("GET /grades/students/ungraded", () => {
  it("returns enriched student list with course meta", async () => {
    Student.find.mockReturnValueOnce(
      createLeanResult([
        {
          _id: "stu1",
          name: "Student",
          email: "a@b",
          personalNumber: "123",
          education: [
            { refId: "course1", type: "Course", grade: null, locked: false, removedAt: null },
            {
              refId: "course2",
              type: "Course",
              grade: "F",
              locked: true,
              removedAt: null,
              redId: "course2",
            },
          ],
        },
      ])
    );
    Notification.findOne.mockResolvedValue({ _id: "not1" });
    Course.findById.mockReturnValueOnce({ lean: vi.fn().mockResolvedValue({ courseName: "Math" }) });
    Course.findById.mockReturnValueOnce({ lean: vi.fn().mockResolvedValue({ courseName: "Science" }) });
    const res = await request(app).get("/grades/students/ungraded");

    expect(NotificationController.evaluateGradingStatusAndNotify).toHaveBeenCalled();
    expect(res.status).toBe(200);
    expect(res.body[0].ungradedEducation).toHaveLength(2);
    expect(res.body[0].ungradedEducation[0].displayName).toBe("Math");
  });

  it("includes program and course package metadata and handles pending plans", async () => {
    Student.find.mockReturnValueOnce(
      createLeanResult([
        {
          _id: "stu2",
          name: "Multi",
          email: "multi@b",
          personalNumber: "456",
          education: [
            { refId: "prog1", type: "Program", grade: "", locked: false, removedAt: null },
            { refId: "pkg1", type: "CoursePackage", grade: null, locked: false, removedAt: null },
            {
              refId: "course3",
              type: "Course",
              grade: "F",
              locked: true,
              removedAt: null,
              redId: "course3",
            },
          ],
        },
      ])
    );
    Notification.findOne.mockResolvedValueOnce({ _id: "plan" });
    Program.findById.mockReturnValueOnce({ lean: vi.fn().mockResolvedValue({ programName: "Program-X" }) });
    CoursePackage.findById.mockReturnValueOnce({
      lean: vi.fn().mockResolvedValue({ coursePackageName: "Package-X" }),
    });
    Course.findById.mockReturnValueOnce({
      lean: vi.fn().mockResolvedValue({ courseName: "Physics" }),
    });
    Notification.findOne.mockResolvedValueOnce({ _id: "plan" });
    const res = await request(app).get("/grades/students/ungraded");

    expect(res.status).toBe(200);
    expect(res.body[0].ungradedEducation).toHaveLength(3);
    expect(res.body[0].ungradedEducation[1].displayName).toBe("Package-X");
    expect(Program.findById).toHaveBeenCalledWith("prog1");
    expect(CoursePackage.findById).toHaveBeenCalledWith("pkg1");
  });

  it("filters locked F grades without a pending plan", async () => {
    Student.find.mockReturnValueOnce(
      createLeanResult([
        {
          _id: "stu3",
          name: "Filtered",
          email: "skip@b",
          personalNumber: "999",
          education: [
            {
              refId: "courseX",
              type: "Course",
              grade: "F",
              locked: true,
              removedAt: null,
              redId: "courseX",
            },
          ],
        },
      ])
    );
    Notification.findOne.mockResolvedValueOnce(null);
    const res = await request(app).get("/grades/students/ungraded");

    expect(res.status).toBe(200);
    expect(res.body[0].ungradedEducation[0].redId).toBe("courseX");
    expect(Notification.findOne).toHaveBeenCalledWith(
      expect.objectContaining({ studentId: "stu3", courseId: "courseX" })
    );
  });

  it("handles errors and returns 500", async () => {
    Student.find.mockRejectedValueOnce(new Error("fail"));
    const res = await request(app).get("/grades/students/ungraded");
    expect(res.status).toBe(500);
  });
});

describe("PUT /grades/admin/unlock-grade", () => {
  it("returns 403 if user not admin", async () => {
    const res = await request(app)
      .put("/grades/admin/unlock-grade")
      .set("x-user-role", "teacher")
      .send({ studentId: "s", courseId: "c" });

    expect(res.status).toBe(403);
    expect(res.body.error).toContain("Endast admin");
  });

  it("unlocks grade and creates notification", async () => {
    Student.updateOne.mockResolvedValue({ matchedCount: 1 });
    const res = await request(app)
      .put("/grades/admin/unlock-grade")
      .set("x-user-role", "admin")
      .send({ studentId: "s", courseId: "c" });

    expect(Student.updateOne).toHaveBeenCalled();
    expect(res.status).toBe(200);
    expect(res.text).toContain("Betyg upplåst");
  });
});



describe("GET /grades/students-to-grade", () => {
  it("returns combined enrollments and education results", async () => {
    const now = new Date();
    const enrollmentData = [
      {
        _id: "en1",
        studentId: { _id: "stu1" },
        courseInstanceId: { _id: "ci1" },
        endDate: new Date(now.getTime() - 86400000),
        grade: null,
      },
    ];
    StudentEnrollment.find.mockReturnValueOnce(createQueryChain(enrollmentData));
    Student.find.mockReturnValueOnce(
      createLeanResult([
        {
          _id: "stu2",
          name: "Student2",
          email: "b@b",
          education: [
            { _id: "ed1", name: "Logik", endDate: new Date(now.getTime() - 86400000), grade: null, removedAt: null },
          ],
        },
      ])
    );

    const res = await request(app).get("/grades/students-to-grade");

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
});

  it("returns 500 when enrollment query fails", async () => {
    StudentEnrollment.find.mockRejectedValueOnce(new Error("boom"));
    const res = await request(app).get("/grades/students-to-grade");
    expect(res.status).toBe(500);
  });
});

describe("POST /grades/teacher/save-grade", () => {
  it("creates action plan notification when grade is F", async () => {
    Student.updateOne.mockResolvedValue({ matchedCount: 1 });
    const res = await request(app)
      .post("/grades/teacher/save-grade")
      .send({ studentId: "s", courseId: "c", grade: "F", reason: "fail" });
    expect(NotificationController.createNotification).toHaveBeenCalled();
    expect(res.status).toBe(200);
    expect(res.text).toContain("Betyg sparat");
  });

  it("resolves notification when grade is good", async () => {
    Student.updateOne.mockResolvedValue({ matchedCount: 1 });
    const res = await request(app)
      .post("/grades/teacher/save-grade")
      .send({ studentId: "s", courseId: "c", grade: "A" });
    expect(NotificationController.resolveNotification).toHaveBeenCalled();
    expect(res.status).toBe(200);
  });

  it("returns 500 when saving the grade fails", async () => {
    Student.updateOne.mockRejectedValueOnce(new Error("boom"));
    const res = await request(app)
      .post("/grades/teacher/save-grade")
      .send({ studentId: "s", courseId: "c", grade: "B" });
    expect(res.status).toBe(500);
  });
});

describe("POST /grades/teacher/lock-grade", () => {
  it("locks grade when student and course exist", async () => {
    const studentInstance = {
      _id: "stu1",
      education: [{ refId: "course1", locked: false }],
      save: vi.fn().mockResolvedValue(true),
    };
    Student.findById.mockResolvedValue(studentInstance);
    const res = await request(app)
      .post("/grades/teacher/lock-grade")
      .set("x-user-role", "admin")
      .send({ studentId: "stu1", courseId: "course1" });
    expect(res.status).toBe(200);
    expect(res.body.message).toBe("Grade locked");
  });

  it("returns 404 when student missing", async () => {
    Student.findById.mockResolvedValue(null);
    const res = await request(app)
      .post("/grades/teacher/lock-grade")
      .set("x-user-role", "admin")
      .send({ studentId: "missing", courseId: "course1" });
    expect(res.status).toBe(404);
  });

  it("returns 404 when course is not part of the student's education", async () => {
    Student.findById.mockResolvedValue({
      _id: "stu50",
      education: [{ refId: "anotherCourse", locked: false }],
      save: vi.fn().mockResolvedValue(true),
    });
    const res = await request(app)
      .post("/grades/teacher/lock-grade")
      .set("x-user-role", "admin")
      .send({ studentId: "stu50", courseId: "missingCourse" });

    expect(res.status).toBe(404);
    expect(res.body.error).toContain("Course not found");
  });

  it("handles errors when locking a grade", async () => {
    Student.findById.mockRejectedValueOnce(new Error("boom"));
    const res = await request(app)
      .post("/grades/teacher/lock-grade")
      .set("x-user-role", "admin")
      .send({ studentId: "stu1", courseId: "course1" });

    expect(res.status).toBe(500);
  });

  it("rejects non-admin users", async () => {
    const res = await request(app)
      .post("/grades/teacher/lock-grade")
      .set("x-user-role", "teacher")
      .send({ studentId: "stu1", courseId: "course1" });

    expect(res.status).toBe(403);
    expect(res.body.error).toContain("Endast admin");
  });
});

describe("PUT /grades/admin/unlock-grade (legacy)", () => {
  it("returns 404 when no course matches", async () => {
    Student.updateOne.mockResolvedValue({ matchedCount: 0 });
    const res = await request(app)
      .put("/grades/admin/unlock-grade")
      .set("x-user-role", "admin")
      .send({ studentId: "s", courseId: "c" });
    expect(res.status).toBe(404);
  });

  it("handles unexpected errors", async () => {
    Student.updateOne.mockRejectedValueOnce(new Error("boom"));
    const res = await request(app)
      .put("/grades/admin/unlock-grade")
      .set("x-user-role", "admin")
      .send({ studentId: "s", courseId: "c" });
    expect(res.status).toBe(500);
  });
});

describe("DELETE /grades/enrollments/:id", () => {
  it("deletes enrollment", async () => {
    StudentEnrollment.findByIdAndDelete.mockResolvedValue({ _id: "en1" });
    const res = await request(app)
      .delete("/grades/enrollments/en1")
      .set("x-user-role", "admin");
    expect(res.status).toBe(200);
  });

  it("returns 404 when not found", async () => {
    StudentEnrollment.findByIdAndDelete.mockResolvedValue(null);
    const res = await request(app)
      .delete("/grades/enrollments/en1")
      .set("x-user-role", "admin");
    expect(res.status).toBe(404);
  });

  it("handles errors when deleting enrollment", async () => {
    StudentEnrollment.findByIdAndDelete.mockRejectedValueOnce(new Error("boom"));
    const res = await request(app)
      .delete("/grades/enrollments/en1")
      .set("x-user-role", "admin");
    expect(res.status).toBe(500);
  });
});

describe("GET /grades/debug/students-past-end-date", () => {
  it("returns aggregated debug info", async () => {
    StudentEnrollment.find.mockReturnValueOnce(
      createQueryChain([
        {
          _id: "en1",
          studentId: { name: "Stu" },
          mainCourseId: { courseName: "Math" },
          teacherId: { userId: { username: "tuser" } },
          endDate: new Date(Date.now() - 1000),
          status: "active",
          grade: "A",
        },
      ])
    );
    Student.find.mockReturnValueOnce(
      createQueryChain([
        {
          _id: "stu2",
          name: "Student2",
          teacherId: { userId: { username: "tuser2" } },
          education: [
            { _id: "edu1", name: "Course", endDate: new Date(Date.now() - 1000), grade: "B", locked: false },
          ],
        },
      ])
    );
    const res = await request(app)
      .get("/grades/debug/students-past-end-date")
      .set("x-user-role", "admin");
    expect(res.status).toBe(200);
    expect(res.body.debug.enrollments.total).toBe(1);
    expect(res.body.debug.students.total).toBe(1);
  });

  it("handles errors in the debug endpoint", async () => {
    StudentEnrollment.find.mockRejectedValueOnce(new Error("boom"));
    const res = await request(app)
      .get("/grades/debug/students-past-end-date")
      .set("x-user-role", "admin");
    expect(res.status).toBe(500);
  });
});

describe("GET /grades/locked-grades", () => {
  it("returns 403 for non-admin", async () => {
    const res = await request(app)
      .get("/grades/locked-grades")
      .set("x-user-role", "teacher");
    expect(res.status).toBe(403);
  });

  it("returns locked grades for admin", async () => {
    StudentEnrollment.find.mockReturnValueOnce(createQueryChain([{ _id: "en1" }]));
    const res = await request(app)
      .get("/grades/locked-grades")
      .set("x-user-role", "admin");
    expect(res.status).toBe(200);
    expect(res.body.lockedGrades).toHaveLength(1);
  });

  it("returns 500 when locked grade lookup fails", async () => {
    StudentEnrollment.find.mockRejectedValueOnce(new Error("boom"));
    const res = await request(app)
      .get("/grades/locked-grades")
      .set("x-user-role", "admin");
    expect(res.status).toBe(500);
  });
});

describe("GET /grades/student/:studentId/grades", () => {
  it("returns student grades", async () => {
    StudentEnrollment.find.mockReturnValueOnce(createQueryChain([{ _id: "en1" }]));
    const res = await request(app)
      .get("/grades/student/stu1/grades")
      .set("x-user-role", "teacher");
    expect(res.status).toBe(200);
    expect(res.body.grades).toHaveLength(1);
  });

  it("returns 500 when the student grade lookup fails", async () => {
    StudentEnrollment.find.mockRejectedValueOnce(new Error("boom"));
    const res = await request(app)
      .get("/grades/student/stu1/grades")
      .set("x-user-role", "teacher");
    expect(res.status).toBe(500);
  });
});

describe("GET /grades/course-instance/:courseInstanceId/grades", () => {
  it("returns course instance grades", async () => {
    StudentEnrollment.find.mockReturnValueOnce(createQueryChain([{ _id: "en2" }]));
    const res = await request(app)
      .get("/grades/course-instance/ci1/grades")
      .set("x-user-role", "teacher");
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(1);
  });

  it("returns 500 when the course instance grade lookup fails", async () => {
    StudentEnrollment.find.mockRejectedValueOnce(new Error("boom"));
    const res = await request(app)
      .get("/grades/course-instance/ci1/grades")
      .set("x-user-role", "teacher");
    expect(res.status).toBe(500);
  });
});

describe("PUT /grades/update-grade/:enrollmentId", () => {
  it("updates grade when unlocked", async () => {
    const enrollment = createEnrollmentRecord();
    StudentEnrollment.findById.mockResolvedValueOnce(enrollment);
    const res = await request(app)
      .put("/grades/update-grade/en1")
      .set("x-user-role", "teacher")
      .send({ grade: "B", motivation: "progress", comments: "ok", nationalTestPoints: 92 });
    expect(enrollment.save).toHaveBeenCalled();
    expect(res.body.success).toBe(true);
    expect(enrollment.nationalTestPoints).toBe(92);
  });

  it("returns 404 when enrollment missing", async () => {
    StudentEnrollment.findById.mockResolvedValueOnce(null);
    const res = await request(app)
      .put("/grades/update-grade/missing")
      .set("x-user-role", "teacher")
      .send({ grade: "B" });
    expect(res.status).toBe(404);
  });

  it("returns 403 when grade locked", async () => {
    const enrollment = createEnrollmentRecord({ isGradeLocked: true });
    StudentEnrollment.findById.mockResolvedValueOnce(enrollment);
    const res = await request(app)
      .put("/grades/update-grade/en1")
      .set("x-user-role", "teacher")
      .send({ grade: "B" });
    expect(res.status).toBe(403);
  });

  it("returns 500 when updating grade fails", async () => {
    StudentEnrollment.findById.mockRejectedValueOnce(new Error("boom"));
    const res = await request(app)
      .put("/grades/update-grade/en1")
      .set("x-user-role", "teacher")
      .send({ grade: "B" });
    expect(res.status).toBe(500);
  });
});
