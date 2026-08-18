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
vi.mock("../../src/models/AuditLog.js", () => ({
  __esModule: true,
  default: {
    create: vi.fn(),
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
    updateMany: vi.fn(),
  },
}));
vi.mock("../../src/models/CourseInstance.js", () => ({
  __esModule: true,
  default: {
    find: vi.fn(),
  },
}));
vi.mock("../../src/models/GradingScale.js", () => ({
  __esModule: true,
  default: {
    find: vi.fn(),
    distinct: vi.fn(),
    findOne: vi.fn(),
    create: vi.fn(),
    findById: vi.fn(),
    findByIdAndDelete: vi.fn(),
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
import GradingScale from "../../src/models/GradingScale.js";

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
        motivation: "",
        comments: "",
        isGradeLocked: false,
        nationalTestPoints: 87,
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
            { _id: "ed1", name: "Logik", endDate: new Date(now.getTime() - 86400000), grade: null, removedAt: null, npScore: 55 },
          ],
        },
      ])
    );

    const res = await request(app)
      .get("/grades/students-to-grade")
      .set("x-user-role", "admin");

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
    expect(res.body.find((row) => row.source === "enrollment").npScore).toBe(87);
  });

  it("passes through npScore for legacy education entries", async () => {
    const now = new Date();
    StudentEnrollment.find.mockReturnValueOnce(createQueryChain([]));
    Student.find.mockReturnValueOnce(
      createLeanResult([
        {
          _id: "stu2",
          name: "Student2",
          email: "b@b",
          education: [
            { _id: "ed1", name: "Logik", endDate: new Date(now.getTime() - 86400000), grade: null, removedAt: null, npScore: 55 },
          ],
        },
      ])
    );

    const res = await request(app).get("/grades/students-to-grade");

    expect(res.status).toBe(200);
    expect(res.body[0].source).toBe("student_education");
    expect(res.body[0].npScore).toBe(55);
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
      name: "Student One",
      education: [{ refId: "course1", name: "Matematik", locked: false }],
      save: vi.fn().mockResolvedValue(true),
    };
    Student.findById.mockResolvedValue(studentInstance);
    const res = await request(app)
      .post("/grades/teacher/lock-grade")
      .set("x-user-role", "admin")
      .send({ studentId: "stu1", courseId: "course1" });
    expect(res.status).toBe(200);
    expect(res.body.message).toBe("Grade locked");
    expect(studentInstance.education[0].locked).toBe(true);
    expect(Notification.create).toHaveBeenCalledTimes(1);
    expect(Notification.create).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "grade_locked",
        message: expect.stringContaining("Matematik"),
      })
    );
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

  it("rejects roles outside the grading scope", async () => {
    const res = await request(app)
      .post("/grades/teacher/lock-grade")
      .set("x-user-role", "student")
      .send({ studentId: "stu1", courseId: "course1" });

    expect(res.status).toBe(403);
    expect(res.body.error).toContain("Endast behörig personal");
    expect(Notification.create).not.toHaveBeenCalled();
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

  it("saves nationalTestPoints = 0 (not falsy-skipped)", async () => {
    const enrollment = createEnrollmentRecord();
    StudentEnrollment.findById.mockResolvedValueOnce(enrollment);
    const res = await request(app)
      .put("/grades/update-grade/en1")
      .set("x-user-role", "teacher")
      .send({ grade: "E", nationalTestPoints: 0 });
    expect(enrollment.save).toHaveBeenCalled();
    expect(res.body.success).toBe(true);
    expect(enrollment.nationalTestPoints).toBe(0);
  });
});

describe("Grading scales (/grades/grading-scale)", () => {
  const scalePayload = {
    term: "HT24",
    subject: "Matematik",
    scale: [
      { min: 90, grade: "A" },
      { min: 75, grade: "B" },
      { min: 60, grade: "C" },
      { min: 45, grade: "D" },
      { min: 30, grade: "E" },
    ],
  };

  beforeEach(() => {
    GradingScale.find.mockReset();
    GradingScale.distinct.mockReset();
    GradingScale.findOne.mockReset();
    GradingScale.create.mockReset();
    GradingScale.findById.mockReset();
    GradingScale.findByIdAndDelete.mockReset();
  });

  describe("GET /grades/grading-scale", () => {
    it("returns 403 for unauthenticated staff role", async () => {
      const res = await request(app)
        .get("/grades/grading-scale")
        .set("x-user-role", "student");
      expect(res.status).toBe(403);
    });

    it("lists scales, filtered by term and subject", async () => {
      GradingScale.find.mockReturnValueOnce(
        createQueryChain([{ _id: "scale-1", term: "HT24", subject: "Matematik" }])
      );
      const res = await request(app)
        .get("/grades/grading-scale?term=HT24&subject=Matematik")
        .set("x-user-role", "teacher");
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
      expect(GradingScale.find).toHaveBeenCalledWith({ term: "HT24", subject: "Matematik" });
    });
  });

  describe("GET /grades/grading-scale/terms", () => {
    it("returns distinct terms sorted", async () => {
      GradingScale.distinct.mockResolvedValue(["VT25", "HT24"]);
      const res = await request(app)
        .get("/grades/grading-scale/terms")
        .set("x-user-role", "admin");
      expect(res.status).toBe(200);
      expect(res.body).toEqual(["HT24", "VT25"]);
    });
  });

  describe("GET /grades/grading-scale/suggest", () => {
    it("returns the suggested grade for a score", async () => {
      GradingScale.findOne.mockReturnValueOnce({
        lean: vi.fn().mockResolvedValue({ _id: "scale-1", term: "HT24", subject: "Matematik", scale: scalePayload.scale }),
      });
      const res = await request(app)
        .get("/grades/grading-scale/suggest?term=HT24&subject=Matematik&points=82")
        .set("x-user-role", "teacher");
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ grade: "B", hasScale: true });
    });

    it("returns hasScale false when no scale exists", async () => {
      GradingScale.findOne.mockReturnValueOnce({
        lean: vi.fn().mockResolvedValue(null),
      });
      const res = await request(app)
        .get("/grades/grading-scale/suggest?term=HT24&subject=Engelska&points=82")
        .set("x-user-role", "teacher");
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ grade: null, hasScale: false });
    });

    it("returns 400 when points are missing", async () => {
      const res = await request(app)
        .get("/grades/grading-scale/suggest?term=HT24&subject=Matematik")
        .set("x-user-role", "teacher");
      expect(res.status).toBe(400);
    });
  });

  describe("POST /grades/grading-scale", () => {
    it("creates a scale as admin", async () => {
      GradingScale.findOne.mockResolvedValue(null);
      GradingScale.create.mockResolvedValue({ _id: "scale-1", ...scalePayload });
      const res = await request(app)
        .post("/grades/grading-scale")
        .set("x-user-role", "admin")
        .send(scalePayload);
      expect(res.status).toBe(201);
      expect(res.body._id).toBe("scale-1");
    });

    it("rejects non-admin users", async () => {
      const res = await request(app)
        .post("/grades/grading-scale")
        .set("x-user-role", "teacher")
        .send(scalePayload);
      expect(res.status).toBe(403);
    });

    it("returns 409 when the term+subject already exists", async () => {
      GradingScale.findOne.mockResolvedValue({ _id: "scale-1" });
      const res = await request(app)
        .post("/grades/grading-scale")
        .set("x-user-role", "admin")
        .send(scalePayload);
      expect(res.status).toBe(409);
    });

    it("returns 400 for an invalid term", async () => {
      const res = await request(app)
        .post("/grades/grading-scale")
        .set("x-user-role", "admin")
        .send({ ...scalePayload, term: "2024" });
      expect(res.status).toBe(400);
    });
  });

  describe("PUT /grades/grading-scale/:id", () => {
    it("updates a scale as admin", async () => {
      const existing = { _id: "scale-1", ...scalePayload, save: vi.fn().mockResolvedValue(true) };
      GradingScale.findById.mockResolvedValue(existing);
      GradingScale.findOne.mockResolvedValue(null);
      const res = await request(app)
        .put("/grades/grading-scale/scale-1")
        .set("x-user-role", "systemadmin")
        .send({ ...scalePayload, term: "VT25" });
      expect(res.status).toBe(200);
      expect(existing.term).toBe("VT25");
      expect(existing.save).toHaveBeenCalled();
    });

    it("returns 404 when the scale is missing", async () => {
      GradingScale.findById.mockResolvedValue(null);
      const res = await request(app)
        .put("/grades/grading-scale/missing")
        .set("x-user-role", "admin")
        .send(scalePayload);
      expect(res.status).toBe(404);
    });

    it("returns 409 on duplicate term+subject", async () => {
      GradingScale.findById.mockResolvedValue({ _id: "scale-1" });
      GradingScale.findOne.mockResolvedValue({ _id: "scale-2" });
      const res = await request(app)
        .put("/grades/grading-scale/scale-1")
        .set("x-user-role", "admin")
        .send(scalePayload);
      expect(res.status).toBe(409);
    });
  });

  describe("DELETE /grades/grading-scale/:id", () => {
    it("deletes a scale as admin", async () => {
      GradingScale.findByIdAndDelete.mockResolvedValue({ _id: "scale-1" });
      const res = await request(app)
        .delete("/grades/grading-scale/scale-1")
        .set("x-user-role", "admin");
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it("returns 404 when the scale is missing", async () => {
      GradingScale.findByIdAndDelete.mockResolvedValue(null);
      const res = await request(app)
        .delete("/grades/grading-scale/missing")
        .set("x-user-role", "admin");
      expect(res.status).toBe(404);
    });

    it("rejects non-admin users", async () => {
      const res = await request(app)
        .delete("/grades/grading-scale/scale-1")
        .set("x-user-role", "teacher");
      expect(res.status).toBe(403);
    });
  });

  describe("POST /grades/teacher/lock-grade & PUT /grades/admin/unlock-grade", () => {
    const mockEnrollment = () => ({
      populate: vi.fn(() => ({
        populate: vi.fn(() => ({
          _id: "en-1",
          isGradeLocked: false,
          studentId: { _id: "s-1", name: "Kalle Elev" },
          courseInstanceId: { courseName: "Svenska 1" },
          save: vi.fn().mockResolvedValue(true),
        })),
      })),
    });

    it("allows teachers to lock a grade and creates exactly one admin notification", async () => {
      StudentEnrollment.findById.mockReturnValueOnce(mockEnrollment());

      const res = await request(app)
        .post("/grades/teacher/lock-grade")
        .set("x-user-role", "teacher")
        .send({ enrollmentId: "en-1" });

      expect(res.status).toBe(200);
      expect(res.body.locked).toBe(true);
      expect(Notification.create).toHaveBeenCalledTimes(1);
      const [notification] = Notification.create.mock.calls[0];
      expect(notification.type).toBe("grade_locked");
      expect(notification.message).toContain("Kalle Elev");
      expect(notification.message).toContain("Svenska 1");
      expect(notification.message).toContain("lärare TestUser");
      expect(notification.meta).toEqual(
        expect.objectContaining({
          studentId: "s-1",
          enrollmentId: "en-1",
          teacherId: "user123",
        })
      );
    });

    it("allows systemadmin to lock and still notifies admins", async () => {
      StudentEnrollment.findById.mockReturnValueOnce(mockEnrollment());

      const res = await request(app)
        .post("/grades/teacher/lock-grade")
        .set("x-user-role", "systemadmin")
        .send({ enrollmentId: "en-1" });

      expect(res.status).toBe(200);
      expect(Notification.create).toHaveBeenCalledTimes(1);
      expect(Notification.create.mock.calls[0][0].message).toContain("admin TestUser");
    });

    it("locks a legacy student.education row and notifies with course context", async () => {
      const studentInstance = {
        _id: "stu-edu",
        name: "Legacy Elev",
        education: [{ refId: "course-9", name: "Engelska 5", locked: false }],
        save: vi.fn().mockResolvedValue(true),
      };
      Student.findById.mockResolvedValue(studentInstance);

      const res = await request(app)
        .post("/grades/teacher/lock-grade")
        .set("x-user-role", "teacher")
        .send({ studentId: "stu-edu", courseId: "course-9" });

      expect(res.status).toBe(200);
      expect(studentInstance.education[0].locked).toBe(true);
      expect(Notification.create).toHaveBeenCalledTimes(1);
      const [notification] = Notification.create.mock.calls[0];
      expect(notification.type).toBe("grade_locked");
      expect(notification.message).toContain("Legacy Elev");
      expect(notification.message).toContain("Engelska 5");
      expect(notification.meta).toEqual(
        expect.objectContaining({
          studentId: "stu-edu",
          courseId: "course-9",
          enrollmentId: null,
        })
      );
    });

    it("returns 400 and does not notify when neither student nor enrollment is provided", async () => {
      const res = await request(app)
        .post("/grades/teacher/lock-grade")
        .set("x-user-role", "teacher")
        .send({});

      expect(res.status).toBe(400);
      expect(Notification.create).not.toHaveBeenCalled();
    });

    it("allows admin to unlock a grade and creates an unlock notification", async () => {
      StudentEnrollment.findById.mockReturnValueOnce({
        populate: vi.fn(() => ({
          populate: vi.fn(() => ({
            _id: "en-1",
            isGradeLocked: true,
            studentId: { _id: "s-1", name: "Kalle Elev" },
            courseInstanceId: { courseName: "Svenska 1" },
            save: vi.fn().mockResolvedValue(true),
          })),
        })),
      });

      const res = await request(app)
        .put("/grades/admin/unlock-grade")
        .set("x-user-role", "admin")
        .send({ enrollmentId: "en-1" });

      expect(res.status).toBe(200);
      expect(res.text).toContain("Betyg upplåst");
      expect(Notification.create).toHaveBeenCalledTimes(1);
      expect(Notification.create).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "grade_unlocked",
          message: expect.stringContaining("Kalle Elev"),
        })
      );
    });

    it("rejects non-admin users attempting to unlock", async () => {
      const res = await request(app)
        .put("/grades/admin/unlock-grade")
        .set("x-user-role", "teacher")
        .send({ enrollmentId: "en-1" });

      expect(res.status).toBe(403);
      expect(Notification.create).not.toHaveBeenCalled();
    });
  });
});
