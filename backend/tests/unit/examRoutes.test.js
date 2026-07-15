import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const createQueryChain = (value) => {
  const chain = {
    lean: vi.fn(() => chain),
    populate: vi.fn(() => chain),
    sort: vi.fn(() => chain),
    select: vi.fn(() => chain),
    then: (onFulfilled, onRejected) =>
      Promise.resolve(value).then(onFulfilled, onRejected),
    catch: (fn) => Promise.resolve(value).catch(fn),
  };
  return chain;
};

const createSessionQuery = (value) => {
  const chain = {
    session: vi.fn(() => chain),
    then: (onFulfilled, onRejected) =>
      Promise.resolve(value).then(onFulfilled, onRejected),
    catch: (fn) => Promise.resolve(value).catch(fn),
  };
  return chain;
};

let studentFindResult = [];
let enrollmentFindResult = [];
let examAttendanceFindResult = [];

vi.mock("../../src/controllers/authController.js", () => ({
  authenticateUser: (req, res, next) => {
    const role = req.headers["x-user-role"] || "teacher";
    const rolesHeader = req.headers["x-user-roles"];
    const roles = rolesHeader ? JSON.parse(rolesHeader) : undefined;
    
    req.user = {
      role,
      roles: roles || (role ? [role] : []),
      userId: req.headers["x-user-id"] || "user-id",
      _id: req.headers["x-user-objectid"] || "user-obj-id",
    };
    next();
  },
}));

vi.mock("../../src/middleware/auth.js", () => ({
  isAuthenticated: (req, res, next) => {
    const role = req.headers["x-user-role"] || "teacher";
    const rolesHeader = req.headers["x-user-roles"];
    const roles = rolesHeader ? JSON.parse(rolesHeader) : undefined;
    
    req.user = {
      role,
      roles: roles || (role ? [role] : []),
      userId: req.headers["x-user-id"] || "user-id",
      _id: req.headers["x-user-objectid"] || "user-obj-id",
    };
    next();
  },
  hasRole: (allowedRoles) => (req, res, next) => {
    const userRole = req.headers["x-user-role"] || "teacher";
    if (allowedRoles.includes(userRole)) {
      next();
    } else {
      res.status(403).json({ error: "Forbidden" });
    }
  },
}));

vi.mock("../../src/controllers/notificationController.js", () => ({
  createGlobalNotification: vi.fn().mockResolvedValue(true),
}));

vi.mock("../../src/models/ExamAttendance.js", () => {
  const findOne = vi.fn();
  const find = vi.fn();
  const save = vi.fn().mockResolvedValue({ _id: "attendance-1" });
  const constructor = vi.fn(function (data) {
    return { ...data, save };
  });
  constructor.find = find;
  constructor.findOne = findOne;
  return {
    __esModule: true,
    default: constructor,
    find,
    findOne,
  };
});

vi.mock("../../src/models/CourseInstance.js", () => ({
  __esModule: true,
  default: {
    find: vi.fn(),
    findById: vi.fn(),
    updateMany: vi.fn().mockResolvedValue({ modifiedCount: 0 }),
  },
}));

vi.mock("../../src/models/Notification.js", () => ({
  __esModule: true,
  default: {
    findOne: vi.fn(),
    create: vi.fn(),
  },
}));

vi.mock("../../src/models/Teacher.js", () => ({
  __esModule: true,
  default: {
    findOne: vi.fn(),
  },
}));

vi.mock("../../src/models/Event.js", () => {
  const constructor = vi.fn(function (data) {
    return {
      ...data,
      save: vi.fn().mockResolvedValue({ ...data, _id: "calendar-event" }),
    };
  });
  constructor.find = vi.fn();
  constructor.findById = vi.fn();
  constructor.findByIdAndUpdate = vi.fn();
  return {
    __esModule: true,
    default: constructor,
  };
});

vi.mock("../../src/models/Provning.js", () => {
  const find = vi.fn();
  const findById = vi.fn();
  const findByIdAndDelete = vi.fn();
  const findByIdAndUpdate = vi.fn();
  const constructor = vi.fn(function (data) {
    return {
      ...data,
      save: vi.fn().mockResolvedValue({ ...data, _id: "exam-1" }),
    };
  });
  constructor.find = find;
  constructor.findById = findById;
  constructor.findByIdAndDelete = findByIdAndDelete;
  constructor.findByIdAndUpdate = findByIdAndUpdate;
  return {
    __esModule: true,
    default: constructor,
  };
});

vi.mock("../../src/models/Student.js", () => ({
  __esModule: true,
  default: {
    find: vi.fn(),
    populate: vi.fn(),
    findOne: vi.fn(),
    findById: vi.fn(),
    findByIdAndUpdate: vi.fn(),
    findOneAndUpdate: vi.fn(),
    updateMany: vi.fn(),
  },
}));

vi.mock("../../src/models/StudentEnrollment.js", () => ({
  __esModule: true,
  default: {
    find: vi.fn(),
    findOne: vi.fn(),
    updateMany: vi.fn(),
  },
}));

vi.mock("mongoose", () => ({
  __esModule: true,
  default: {
    startSession: vi.fn(() => ({
      startTransaction: vi.fn(),
      commitTransaction: vi.fn(),
      abortTransaction: vi.fn(),
      endSession: vi.fn(),
    })),
  },
}));

import examRoutes from "../../src/router/examRoutes.js";
import ExamAttendance, {
  find as mockExamAttendanceFind,
  findOne as mockExamAttendanceFindOne,
} from "../../src/models/ExamAttendance.js";
import CourseInstance from "../../src/models/CourseInstance.js";
import Notification from "../../src/models/Notification.js";
import Teacher from "../../src/models/Teacher.js";
import CalendarEvent from "../../src/models/Event.js";
import Exam from "../../src/models/Provning.js";
import Student from "../../src/models/Student.js";
import StudentEnrollment from "../../src/models/StudentEnrollment.js";
import { createGlobalNotification } from "../../src/controllers/notificationController.js";

const teacherDoc = {
  _id: "teacher-1",
  userId: { username: "tutor" },
  colorCode: "#abc",
};

const createStudent = () => ({
  _id: "student-1",
  name: "Student One",
  personalNumber: "1234567890",
  teacherId: teacherDoc,
  finalExamDate: new Date("2025-04-15T00:00:00.000Z"),
  examTime: "08:00",
  examMunicipality: "Stockholm",
  examLocation: "Room 1",
  education: [
    {
      type: "Course",
      startDate: "2025-01-01",
      endDate: "2025-12-31",
      refId: { courseName: "Physics" },
    },
  ],
  attendedExam: true,
  paidExamFee: true,
  dropout: false,
  examHistory: [],
  additionalInfo: "info",
});

const createEnrollment = () => ({
  ...{ _id: "enroll-1" },
  studentId: createStudent(),
  mainCourseId: { courseName: "Physics", courseCode: "PHY101" },
  courseInstanceId: { _id: "ci-1" },
  teacherId: teacherDoc,
  slutprovDate: new Date("2025-04-15T00:00:00.000Z"),
  status: "active",
});

const buildApp = () => {
  const app = express();
  app.use(express.json());
  app.use("/api", examRoutes);
  return app;
};

let app;

beforeEach(() => {
  app = buildApp();
  vi.clearAllMocks();
  studentFindResult = [];
  enrollmentFindResult = [];
  examAttendanceFindResult = [];
  mockExamAttendanceFind.mockImplementation(() =>
    createQueryChain(examAttendanceFindResult)
  );
  mockExamAttendanceFindOne.mockResolvedValue(null);
  Exam.find.mockReturnValue(createQueryChain([]));
  Exam.findById.mockReturnValue(createQueryChain(null));
  Exam.findByIdAndDelete.mockResolvedValue(null);
  Exam.findByIdAndUpdate.mockResolvedValue(null);
  Teacher.findOne.mockReturnValue(createSessionQuery(teacherDoc));
  CalendarEvent.find.mockResolvedValue([]);
  CalendarEvent.findById.mockResolvedValue(null);
  CalendarEvent.findByIdAndUpdate.mockResolvedValue(null);
  Notification.findOne.mockResolvedValue(null);
  Notification.create.mockResolvedValue({ _id: "note-1" });
  Student.find.mockImplementation((query) => {
    if (query?.dropout === true) {
      const dropoutStudents = studentFindResult
        .filter((student) => student.dropout === true)
        .map((student) => ({ _id: student._id }));
      return createQueryChain(dropoutStudents);
    }

    return createQueryChain(studentFindResult);
  });
  Student.populate.mockResolvedValue(studentFindResult);
  Student.findOne.mockResolvedValue(null);
  Student.findById.mockResolvedValue(null);
  Student.findOneAndUpdate.mockResolvedValue(null);
  Student.updateMany.mockResolvedValue({ modifiedCount: 0 });
  StudentEnrollment.find.mockImplementation(() =>
    createQueryChain(enrollmentFindResult)
  );
  StudentEnrollment.findOne.mockResolvedValue(null);
  StudentEnrollment.updateMany.mockResolvedValue({ modifiedCount: 0 });
  CourseInstance.find.mockReturnValue(createQueryChain([]));
  CourseInstance.findById.mockResolvedValue({
    _id: "ci-1",
    responsibleTeacher: "teacher-1",
    save: vi.fn().mockResolvedValue(true),
  });
  CourseInstance.updateMany.mockResolvedValue({ modifiedCount: 0 });
});

describe("examRoutes", () => {
  it("creates exams and removes empty fields", async () => {
    const res = await request(app)
      .post("/api/exams")
      .set("x-user-role", "admin")
      .send({ name: "Exam", course: "Physics", teacherId: "", paymentDate: "" });
    expect(res.status).toBe(201);
    expect(res.body.name).toBe("Exam");
    expect(Exam).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Exam", course: "Physics" })
    );
    expect(createGlobalNotification).toHaveBeenCalled();
  });

  it("returns 400 with validation errors when exam registration fails validation", async () => {
    const validationError = new Error("validation failed");
    validationError.name = "ValidationError";
    validationError.errors = {
      name: { message: "Name is required" },
      course: { message: "Course is required" },
    };
    Exam.mockImplementationOnce(function (data) {
      return {
      ...data,
      save: vi.fn().mockRejectedValue(validationError),
      };
    });

    const res = await request(app).post("/api/exams").set("x-user-role", "admin").send({ name: "", course: "" });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      error: "Validation failed",
      details: ["Name is required", "Course is required"],
    });
  });

  it("returns 403 when teacher profile is missing for exam listing", async () => {
    Teacher.findOne.mockReturnValueOnce(createSessionQuery(null));

    const res = await request(app)
      .get("/api/exams")
      .set("x-user-role", "teacher");

    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: "Teacher profile not found" });
  });

  it("skips notification creation for exams that do not meet criteria", async () => {
    const examDoc = {
      _id: "exam-continue",
      name: "No Notification Exam",
      course: "Physics",
      teacherId: teacherDoc,
      requestedMonth: "Juni",
      status: "scheduled",
      personalNumber: "123",
    };
    Exam.find.mockReturnValue(createQueryChain([examDoc]));

    const res = await request(app)
      .get("/api/exams")
      .set("x-user-role", "admin");

    expect(res.status).toBe(200);
    expect(Notification.create).not.toHaveBeenCalled();
  });

  it("returns 500 when exam listing fails", async () => {
    Exam.find.mockImplementationOnce(() => {
      throw new Error("boom");
    });

    const res = await request(app)
      .get("/api/exams")
      .set("x-user-role", "admin");

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: "Failed to fetch exams." });
  });

  it("returns teacher exams and triggers notification logic", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2025-06-05T00:00:00.000Z"));
    const examDoc = {
      _id: "exam-1",
      name: "Sample Exam",
      course: "Physics",
      teacherId: teacherDoc,
      requestedMonth: "Juni",
      status: "intresse",
      personalNumber: "123",
    };
    Exam.find.mockReturnValue(createQueryChain([examDoc]));
    Notification.findOne.mockResolvedValue(null);
    examAttendanceFindResult = [
      {
        examTime: "10:00",
        examMunicipality: "Town",
        examLocation: "Hall",
        teacherId: teacherDoc,
        _id: "attendance-1",
      },
    ];
    const res = await request(app)
      .get("/api/exams")
      .set("x-user-role", "teacher");
    vi.useRealTimers();
    expect(res.status).toBe(200);
    expect(res.body).toEqual([expect.objectContaining({ name: "Sample Exam" })]);
    expect(Notification.create).toHaveBeenCalled();
  });

  it("builds syncable calendar events for students and enrollments", async () => {
    const student = createStudent();
    studentFindResult = [student];
    enrollmentFindResult = [
      {
        ...createEnrollment(),
        studentId: student,
      },
    ];
    StudentEnrollment.findOne.mockResolvedValue({
      mainCourseId: { courseName: "Manual Course" },
    });
    Notification.findOne.mockResolvedValue(null);
    examAttendanceFindResult = [
      {
        examTime: "10:00",
        examMunicipality: "City",
        examLocation: "Hall",
        teacherId: teacherDoc,
      },
    ];
    const res = await request(app)
      .get("/api/calendar-events/syncable?testCase=fallback-course")
      .set("x-user-role", "teacher");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body[0].extendedProps.students).toHaveLength(1);
  });

  it("falls back to enrollment when course name is missing", async () => {
    const student = createStudent();
    student.education = [];
    studentFindResult = [student];
    Student.populate.mockResolvedValueOnce([{ ...student, education: [] }]);
    StudentEnrollment.findOne.mockReturnValueOnce(
      createQueryChain({
        mainCourseId: { courseName: "Manual Course Fallback" },
      })
    );
    const res = await request(app)
      .get("/api/calendar-events/syncable")
      .set("x-user-role", "teacher");
    expect(res.status).toBe(200);
    const manualEvent =
      res.body.find((event) => event.extendedProps.students.length > 0) || {};
    expect(
      manualEvent.extendedProps?.students?.[0]?.courseName
    ).toBe("Manual Course Fallback");
  });

  it("appends course names when the same student appears twice", async () => {
    const student = createStudent();
    const secondStudent = {
      ...student,
      education: [
        {
          type: "Course",
          startDate: "2025-02-01",
          endDate: "2025-05-01",
          refId: { courseName: "Chemistry" },
        },
      ],
    };
    studentFindResult = [student, secondStudent];
    const res = await request(app)
      .get("/api/calendar-events/syncable")
      .set("x-user-role", "teacher");
    expect(res.status).toBe(200);
    const students =
      res.body[0].extendedProps.students[0]?.courseName || "";
    expect(students).toContain("Physics");
    expect(students).toContain("Chemistry");
  });

  it("ignores invalid education entries while still falling back to enrollment data", async () => {
    const student = createStudent();
    student.education = [
      {
        type: "Other",
        startDate: null,
        endDate: null,
        refId: { courseName: "Broken" },
      },
    ];
    studentFindResult = [student];
    StudentEnrollment.findOne.mockResolvedValueOnce({
      mainCourseId: { courseName: "Fallback Course" },
    });
    const res = await request(app)
      .get("/api/calendar-events/syncable")
      .set("x-user-role", "teacher");
    expect(res.status).toBe(200);
    expect(StudentEnrollment.findOne).toHaveBeenCalledWith(
      expect.objectContaining({ studentId: student._id })
    );
  });

  it("skips malformed enrollments and falls back to student teacher data", async () => {
    const student = createStudent();
    student.finalExamDate = null;
    studentFindResult = [student];
    enrollmentFindResult = [
      {
        ...createEnrollment(),
        studentId: student,
        mainCourseId: { courseName: "Auto Good" },
        teacherId: null,
      },
      {
        ...createEnrollment(),
        _id: "enroll-bad",
        studentId: student,
        mainCourseId: null, // triggers continue
        slutprovDate: new Date("2025-04-15T00:00:00.000Z"),
      },
    ];
    mockExamAttendanceFindOne.mockResolvedValue({
      examTime: "12:00",
      examMunicipality: "Veranda",
      examLocation: "Auto Hall",
      attended: true,
      paidExamFee: true,
    });
    const res = await request(app)
      .get("/api/calendar-events/syncable")
      .set("x-user-role", "admin");
    expect(res.status).toBe(200);
    const autoEvent = res.body.find(
      (event) => event.extendedProps.courseName === "Auto Good"
    );
    expect(autoEvent).toBeTruthy();
    expect(autoEvent.extendedProps.teacher).toBe("tutor");
  });

  it("merges duplicate students in auto events and updates attendance info", async () => {
    const student = createStudent();
    student.finalExamDate = null;
    studentFindResult = [student];
    enrollmentFindResult = [
      {
        ...createEnrollment(),
        studentId: student,
        mainCourseId: { courseName: "Auto Course" },
        teacherId: teacherDoc,
      },
      {
        ...createEnrollment(),
        _id: "enroll-dup",
        studentId: student,
        mainCourseId: { courseName: "Another Course" },
        teacherId: teacherDoc,
        courseInstanceId: { _id: "ci-2" },
      },
    ];
    mockExamAttendanceFindOne.mockResolvedValue({
      examTime: "09:00",
      examMunicipality: "Overlap",
      examLocation: "Hall B",
      attended: true,
      paidExamFee: true,
    });
    const res = await request(app)
      .get("/api/calendar-events/syncable")
      .set("x-user-role", "teacher");
    expect(res.status).toBe(200);
    const mergedStudent =
      res.body[0].extendedProps.students.find((s) => s._id === student._id);
    expect(mergedStudent.courseName).toContain("Auto Course");
    expect(mergedStudent.courseName).toContain("Another Course");
    expect(mergedStudent.examMunicipality).toBe("Overlap");
  });

  it("returns 500 when the syncable endpoint throws", async () => {
    Student.find.mockImplementationOnce(() =>
      Promise.reject(new Error("sync boom"))
    );
    const res = await request(app)
      .get("/api/calendar-events/syncable")
      .set("x-user-role", "teacher");
    expect(res.status).toBe(500);
    expect(res.body.error).toBe("Kunde inte hämta synkade events.");
  });

  it("handles automatic enrollments even when teacher references are missing", async () => {
    const student = createStudent();
    student.finalExamDate = null;
    const fallbackStudent = { ...student, teacherId: null };
    studentFindResult = [student];
    enrollmentFindResult = [
      {
        ...createEnrollment(),
        studentId: student,
        teacherId: teacherDoc,
        mainCourseId: { courseName: "Auto Course" },
      },
      {
        ...createEnrollment(),
        _id: "enroll-no-teacher",
        studentId: fallbackStudent,
        teacherId: null,
        mainCourseId: { courseName: "Auto Unknown" },
      },
    ];
    examAttendanceFindResult = [
      {
        examTime: "11:30",
        examMunicipality: "Auto City",
        examLocation: "Auto Hall",
        teacherId: teacherDoc,
      },
    ];
    const res = await request(app)
      .get("/api/calendar-events/syncable")
      .set("x-user-role", "teacher");
    expect(res.status).toBe(200);
    const autoEvent = res.body.find(
      (event) =>
        event.extendedProps.courseInstanceIds &&
        event.extendedProps.courseInstanceIds.length > 0
    );
    expect(autoEvent).toBeTruthy();
    expect(autoEvent.extendedProps.courseInstanceIds).toContain("ci-1");
  });

  it("updates attendance records via batch mark-attendance", async () => {
    const attendanceStudent = {
      _id: "batch-student",
      name: "Batch Student",
      personalNumber: "200",
      examHistory: [],
      save: vi.fn().mockResolvedValue(true),
      attendedExam: false,
      paidExamFee: false,
    };
    Student.findById.mockResolvedValue(attendanceStudent);
    mockExamAttendanceFindOne.mockResolvedValue(null);
    examAttendanceFindResult = [];
    const res = await request(app)
      .post("/api/calendar-events/mark-attendance")
      .send({
        date: "2025-04-15",
        teacherId: "teacher-1",
        courseName: "Physics",
        students: [{ _id: "batch-student", attended: true }],
      });
    expect(res.status).toBe(200);
    expect(res.body.successCount).toBe(1);
  });

  it("returns 500 when batch attendance update throws", async () => {
    const originalPromiseAll = Promise.all;
    Promise.all = () => Promise.reject(new Error("boom all"));
    try {
      const res = await request(app)
        .post("/api/calendar-events/mark-attendance")
        .send({
          date: "2025-04-15",
          teacherId: "teacher-1",
          courseName: "Physics",
          students: [{ _id: "batch-student", attended: true }],
        });
      expect(res.status).toBe(500);
      expect(res.body).toEqual({ error: "Server error" });
    } finally {
      Promise.all = originalPromiseAll;
    }
  });

  it("updates existing exam history entries instead of creating duplicates", async () => {
    const studentDoc = {
      _id: "history-student",
      name: "History",
      personalNumber: "200",
      teacherId: teacherDoc,
      examHistory: [
        {
          examDate: new Date("2025-04-15T00:00:00.000Z"),
          teacherId: "teacher-1",
          attended: false,
        },
      ],
      save: vi.fn().mockResolvedValue(true),
    };
    Student.findById.mockResolvedValueOnce(studentDoc);
    const existingAttendance = {
      _id: "attendance-existing",
      attended: false,
      paidExamFee: false,
      examTime: "08:00",
      examMunicipality: "Town",
      examLocation: "Hall",
      save: vi.fn().mockResolvedValue(true),
    };
    mockExamAttendanceFindOne.mockResolvedValueOnce(existingAttendance);

    const res = await request(app)
      .post("/api/calendar-events/mark-attendance")
      .send({
        date: "2025-04-15",
        teacherId: "teacher-1",
        courseName: "Physics",
        examTime: "10:00",
        examMunicipality: "Town",
        examLocation: "Room",
        students: [{ _id: "history-student", attended: true }],
      });

    expect(res.status).toBe(200);
    expect(studentDoc.examHistory[0].attended).toBe(true);
    expect(existingAttendance.attended).toBe(true);
    expect(existingAttendance.save).toHaveBeenCalled();
  });

  it("overrides existing attendance record fields when event data is provided", async () => {
    const studentDoc = {
      _id: "history-student",
      name: "History",
      personalNumber: "200",
      examHistory: [],
      save: vi.fn().mockResolvedValue(true),
    };
    Student.findById.mockResolvedValueOnce(studentDoc);
    const existingAttendance = {
      _id: "attendance-update",
      attended: false,
      paidExamFee: false,
      examTime: "08:00",
      examMunicipality: "Town",
      examLocation: "Hall",
      save: vi.fn().mockResolvedValue(true),
    };
    mockExamAttendanceFindOne.mockResolvedValueOnce(existingAttendance);

    const res = await request(app)
      .post("/api/calendar-events/mark-attendance")
      .send({
        date: "2025-04-15",
        teacherId: "teacher-1",
        courseName: "Physics",
        examTime: "10:00",
        examMunicipality: "Metro",
        examLocation: "Auditorium",
        students: [
          {
            _id: "history-student",
            attended: true,
            paidExamFee: true,
            examTime: "11:11",
            examMunicipality: "Village",
            examLocation: "Room 5",
          },
        ],
      });

    expect(res.status).toBe(200);
    expect(existingAttendance.examTime).toBe("11:11");
    expect(existingAttendance.examMunicipality).toBe("Village");
    expect(existingAttendance.examLocation).toBe("Room 5");
    expect(existingAttendance.save).toHaveBeenCalled();
  });

  it("records failures when student lookup rejects during attendance update", async () => {
    Student.findById.mockRejectedValueOnce(new Error("lookup fail"));
    const res = await request(app)
      .post("/api/calendar-events/mark-attendance")
      .send({
        date: "2025-04-15",
        teacherId: "teacher-1",
        courseName: "Physics",
        students: [{ _id: "failure-student", attended: true }],
      });
    expect(res.status).toBe(200);
    expect(res.body.failureCount).toBe(1);
    expect(res.body.results[0].success).toBe(false);
    expect(res.body.results[0].error).toBe("lookup fail");
  });

  it("handles exam decisions (accept branch)", async () => {
    const examDoc = {
      _id: "decision-exam",
      name: "Decision Exam",
      requestedMonth: "Maj",
      personalNumber: "999",
      teacherId: teacherDoc,
    };
    Exam.findById.mockReturnValueOnce(createQueryChain(examDoc));
    Student.findOneAndUpdate.mockResolvedValue({ _id: "student-for-decision" });
    Exam.findByIdAndUpdate.mockResolvedValue({ ...examDoc, status: "scheduled" });
    const res = await request(app)
      .put("/api/exams/decision-exam/decision")
      .set("x-user-role", "admin")
      .send({ decision: "accept", comment: "Go" });
    expect(res.status).toBe(200);
    expect(Student.findOneAndUpdate).toHaveBeenCalled();
  });

  it("lists exam history for a student", async () => {
    examAttendanceFindResult = [
      {
        _id: "attendance-history",
        examDate: new Date(),
        courseName: "Physics",
        attended: true,
        examTime: "09:00",
        examMunicipality: "City",
        examLocation: "Hall",
        teacherId: { userId: { username: "tutor" } },
      },
    ];
    const res = await request(app).get("/api/exams/student/student-1");
    expect(res.status).toBe(200);
    expect(res.body[0]).toHaveProperty("teacher");
  });

  it("fetches attendance data for a teacher on a date", async () => {
    examAttendanceFindResult = [
      {
        studentId: "student-1",
        attended: true,
        paidExamFee: true,
        examTime: "08:00",
        examMunicipality: "City",
        examLocation: "Hall",
      },
    ];
    const res = await request(app).get(
      "/api/calendar-events/attendance/2025-04-15/teacher-1"
    );
    expect(res.status).toBe(200);
    expect(res.body[0]).toHaveProperty("attended");
  });

  it("returns 500 when attendance lookup fails", async () => {
    examAttendanceFindResult = [];
    mockExamAttendanceFind.mockReturnValueOnce({
      select: () => Promise.reject(new Error("boom attendance")),
    });
    const res = await request(app).get(
      "/api/calendar-events/attendance/2025-04-15/teacher-1"
    );
    expect(res.status).toBe(500);
    expect(res.body.error).toBe("Failed to fetch attendance data");
  });

  it("creates calendar events and handles persistence errors", async () => {
    const res = await request(app)
      .post("/api/calendar-events")
      .send({ title: "New event", description: "Desc" });
    expect(res.status).toBe(201);
    expect(res.body.message).toBe("Event sparat");

    CalendarEvent.mockImplementationOnce((data) => ({
      ...data,
      save: vi.fn().mockRejectedValue(new Error("boom")),
    }));
    const errorRes = await request(app)
      .post("/api/calendar-events")
      .send({ title: "Fail event" });
    expect(errorRes.status).toBe(500);
  });

  it("returns calendar events for teachers and rejects missing teacher profile", async () => {
    CalendarEvent.find.mockResolvedValueOnce([{ _id: "event-1" }]);
    const res = await request(app)
      .get("/api/calendar-events")
      .set("x-user-role", "teacher");
    expect(res.status).toBe(200);
    expect(res.body).toEqual([{ _id: "event-1" }]);

    Teacher.findOne.mockReturnValueOnce(createSessionQuery(null));
    const failRes = await request(app)
      .get("/api/calendar-events")
      .set("x-user-role", "teacher");
    expect(failRes.status).toBe(403);
  });

  it("returns 500 when fetching calendar events fails", async () => {
    CalendarEvent.find.mockRejectedValueOnce(new Error("boom"));

    const res = await request(app)
      .get("/api/calendar-events")
      .set("x-user-role", "admin");

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: "Kunde inte hämta sparade event" });
  });

  it("fetches a calendar event by id and surfaces errors", async () => {
    CalendarEvent.findById.mockResolvedValueOnce({ _id: "event-view" });
    const res = await request(app).get("/api/calendar-events/event-view");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ _id: "event-view" });

    CalendarEvent.findById.mockResolvedValueOnce(null);
    const notFound = await request(app).get("/api/calendar-events/event-missing");
    expect(notFound.status).toBe(404);
    expect(notFound.body).toEqual({ error: "Event hittades inte" });

    CalendarEvent.findById.mockRejectedValueOnce(new Error("boom id"));
    const err = await request(app).get("/api/calendar-events/event-crash");
    expect(err.status).toBe(500);
    expect(err.body.error).toBe("Kunde inte hämta event.");
  });

  it("falls back when transactions are enabled but unsupported", async () => {
    const previousEnableTransactions = process.env.ENABLE_MONGODB_TRANSACTIONS;
    process.env.ENABLE_MONGODB_TRANSACTIONS = "true";

    const mongooseModule = await import("mongoose");
    const session = {
      startTransaction: vi.fn(() => {
        throw new Error("transactions unsupported");
      }),
      endSession: vi.fn(() => {
        throw new Error("end session failed");
      }),
    };
    mongooseModule.default.startSession.mockImplementationOnce(() => session);

    StudentEnrollment.updateMany.mockResolvedValueOnce({ modifiedCount: 0 });
    Student.updateMany.mockResolvedValueOnce({ modifiedCount: 0 });

    const res = await request(app)
      .put("/api/calendar-events/move-group")
      .set("x-user-role", "admin")
      .send({
        teacherId: "teacher-1",
        fromDate: "2025-04-01",
        toDate: "2025-04-10",
      });

    process.env.ENABLE_MONGODB_TRANSACTIONS = previousEnableTransactions;

    expect(res.status).toBe(200);
  });

  it("commits transactions and uses query sessions when enabled", async () => {
    const previousEnableTransactions = process.env.ENABLE_MONGODB_TRANSACTIONS;
    process.env.ENABLE_MONGODB_TRANSACTIONS = "true";

    const mongooseModule = await import("mongoose");
    const endSession = vi.fn(() => {
      throw new Error("end session failed");
    });
    const session = {
      startTransaction: vi.fn(),
      commitTransaction: vi.fn(),
      abortTransaction: vi.fn(),
      endSession,
    };
    mongooseModule.default.startSession.mockImplementationOnce(() => session);

    StudentEnrollment.updateMany.mockResolvedValueOnce({ modifiedCount: 0 });
    Student.updateMany.mockResolvedValueOnce({ modifiedCount: 0 });

    const res = await request(app)
      .put("/api/calendar-events/move-group")
      .set("x-user-role", "teacher")
      .set("x-user-id", "teacher-user-id")
      .send({
        teacherId: "teacher-1",
        fromDate: "2025-04-01",
        toDate: "2025-04-10",
      });

    process.env.ENABLE_MONGODB_TRANSACTIONS = previousEnableTransactions;

    expect(res.status).toBe(200);
    expect(session.commitTransaction).toHaveBeenCalled();
  });

  it("moves calendar event groups with proper authorization", async () => {
    StudentEnrollment.updateMany.mockResolvedValueOnce({ modifiedCount: 4 });
    Student.updateMany.mockResolvedValueOnce({ modifiedCount: 2 });
    CourseInstance.updateMany.mockResolvedValueOnce({ modifiedCount: 1 });
    const res = await request(app)
      .put("/api/calendar-events/move-group")
      .set("x-user-role", "admin")
      .send({
        teacherId: "teacher-1",
        fromDate: "2025-04-01",
        toDate: "2025-04-10",
        courseInstanceIds: ["ci-1"],
      });
    expect(res.status).toBe(200);
    expect(res.body.enrollmentsModified).toBe(4);
    expect(res.body.courseInstancesModified).toBe(1);
    expect(res.body.studentsModified).toBe(2);

    const unauthorized = await request(app)
      .put("/api/calendar-events/move-group")
      .set("x-user-role", "teacher")
      .send({
        teacherId: "other-teacher",
        fromDate: "2025-04-01",
        toDate: "2025-04-10",
      });
    expect(unauthorized.status).toBe(403);

    const badPayload = await request(app)
      .put("/api/calendar-events/move-group")
      .set("x-user-role", "admin")
      .send({ teacherId: "teacher-1", fromDate: "2025-04-01" });
    expect(badPayload.status).toBe(400);
  });

  it("returns 500 when moving group fails mid-transaction", async () => {
    StudentEnrollment.updateMany.mockRejectedValueOnce(
      new Error("boom update")
    );
    const res = await request(app)
      .put("/api/calendar-events/move-group")
      .set("x-user-role", "admin")
      .send({
        teacherId: "teacher-1",
        fromDate: "2025-04-01",
        toDate: "2025-04-10",
      });
    expect(res.status).toBe(500);
    expect(res.body.error).toBe(
      "Failed to move group. The operation was rolled back."
    );
  });

  it("aborts and ends sessions safely when transactional move-group fails", async () => {
    const previousEnableTransactions = process.env.ENABLE_MONGODB_TRANSACTIONS;
    process.env.ENABLE_MONGODB_TRANSACTIONS = "true";

    const mongooseModule = await import("mongoose");
    const session = {
      startTransaction: vi.fn(),
      commitTransaction: vi.fn(),
      abortTransaction: vi.fn(() => {
        throw new Error("abort failed");
      }),
      endSession: vi.fn(() => {
        throw new Error("end session failed");
      }),
    };
    mongooseModule.default.startSession.mockImplementationOnce(() => session);

    StudentEnrollment.updateMany.mockRejectedValueOnce(new Error("boom update"));
    Teacher.findOne.mockReturnValueOnce(createSessionQuery(teacherDoc));

    const res = await request(app)
      .put("/api/calendar-events/move-group")
      .set("x-user-role", "teacher")
      .set("x-user-id", "teacher-user-id")
      .send({
        teacherId: "teacher-1",
        fromDate: "2025-04-01",
        toDate: "2025-04-10",
      });

    process.env.ENABLE_MONGODB_TRANSACTIONS = previousEnableTransactions;

    expect(res.status).toBe(500);
    expect(res.body.error).toBe(
      "Failed to move group. The operation was rolled back."
    );
  });

  it("correctly enforces permission checks for move-group endpoint", async () => {
    // Setup mocks for successful operations
    StudentEnrollment.updateMany.mockResolvedValue({ modifiedCount: 0 });
    Student.updateMany.mockResolvedValue({ modifiedCount: 0 });
    CourseInstance.updateMany.mockResolvedValue({ modifiedCount: 0 });

    const validPayload = {
      teacherId: "teacher-1",
      fromDate: "2025-04-01",
      toDate: "2025-04-10",
      courseInstanceIds: [],
    };

    // Test 1: User with role 'user' should get 403 Forbidden
    const userResponse = await request(app)
      .put("/api/calendar-events/move-group")
      .set("x-user-role", "user")
      .send(validPayload);
    expect(userResponse.status).toBe(403);
    expect(userResponse.body.error).toBe(
      "Only admins or the responsible teacher can move exam dates"
    );

    // Test 2: User with roles array ['user'] should get 403 Forbidden
    const userRolesResponse = await request(app)
      .put("/api/calendar-events/move-group")
      .set("x-user-role", "user")
      .set("x-user-roles", JSON.stringify(["user"]))
      .send(validPayload);
    expect(userRolesResponse.status).toBe(403);
    expect(userRolesResponse.body.error).toBe(
      "Only admins or the responsible teacher can move exam dates"
    );

    // Test 3: User with role 'admin' should get 200 OK
    StudentEnrollment.updateMany.mockResolvedValueOnce({ modifiedCount: 0 });
    Student.updateMany.mockResolvedValueOnce({ modifiedCount: 0 });
    CourseInstance.updateMany.mockResolvedValueOnce({ modifiedCount: 0 });
    const adminResponse = await request(app)
      .put("/api/calendar-events/move-group")
      .set("x-user-role", "admin")
      .send(validPayload);
    expect(adminResponse.status).toBe(200);

    // Test 4: User with roles array ['admin'] should get 200 OK
    StudentEnrollment.updateMany.mockResolvedValueOnce({ modifiedCount: 0 });
    Student.updateMany.mockResolvedValueOnce({ modifiedCount: 0 });
    CourseInstance.updateMany.mockResolvedValueOnce({ modifiedCount: 0 });
    const adminRolesResponse = await request(app)
      .put("/api/calendar-events/move-group")
      .set("x-user-role", "user") // role is 'user' but roles array has 'admin'
      .set("x-user-roles", JSON.stringify(["admin"]))
      .send(validPayload);
    expect(adminRolesResponse.status).toBe(200);

    // Test 5: User with roles array ['systemadmin'] should get 200 OK
    StudentEnrollment.updateMany.mockResolvedValueOnce({ modifiedCount: 0 });
    Student.updateMany.mockResolvedValueOnce({ modifiedCount: 0 });
    CourseInstance.updateMany.mockResolvedValueOnce({ modifiedCount: 0 });
    const systemAdminResponse = await request(app)
      .put("/api/calendar-events/move-group")
      .set("x-user-role", "systemadmin")
      .send(validPayload);
    expect(systemAdminResponse.status).toBe(200);

    // Test 6: Teacher who is the responsible teacher should get 200 OK
    const responsibleTeacher = {
      _id: "teacher-1",
      userId: "teacher-user-id",
    };
    Teacher.findOne.mockReturnValueOnce(
      createSessionQuery(responsibleTeacher)
    );
    StudentEnrollment.updateMany.mockResolvedValueOnce({ modifiedCount: 0 });
    Student.updateMany.mockResolvedValueOnce({ modifiedCount: 0 });
    CourseInstance.updateMany.mockResolvedValueOnce({ modifiedCount: 0 });
    const responsibleTeacherResponse = await request(app)
      .put("/api/calendar-events/move-group")
      .set("x-user-role", "teacher")
      .set("x-user-id", "teacher-user-id")
      .send({
        ...validPayload,
        teacherId: "teacher-1", // Same as the teacher's _id
      });
    expect(responsibleTeacherResponse.status).toBe(200);

    // Test 7: Teacher who is NOT the responsible teacher should get 403 Forbidden
    const nonResponsibleTeacher = {
      _id: "teacher-2", // Different teacher
      userId: "teacher-user-id",
    };
    Teacher.findOne.mockReturnValueOnce(
      createSessionQuery(nonResponsibleTeacher)
    );
    const nonResponsibleTeacherResponse = await request(app)
      .put("/api/calendar-events/move-group")
      .set("x-user-role", "teacher")
      .set("x-user-id", "teacher-user-id")
      .send({
        ...validPayload,
        teacherId: "teacher-1", // Different from teacher's _id
      });
    expect(nonResponsibleTeacherResponse.status).toBe(403);
    expect(nonResponsibleTeacherResponse.body.error).toBe(
      "Only admins or the responsible teacher can move exam dates"
    );

    // Test 8: Teacher with roles array ['teacher'] who is responsible should get 200 OK
    Teacher.findOne.mockReturnValueOnce(
      createSessionQuery(responsibleTeacher)
    );
    StudentEnrollment.updateMany.mockResolvedValueOnce({ modifiedCount: 0 });
    Student.updateMany.mockResolvedValueOnce({ modifiedCount: 0 });
    CourseInstance.updateMany.mockResolvedValueOnce({ modifiedCount: 0 });
    const teacherRolesResponse = await request(app)
      .put("/api/calendar-events/move-group")
      .set("x-user-role", "user")
      .set("x-user-roles", JSON.stringify(["teacher"]))
      .set("x-user-id", "teacher-user-id")
      .send({
        ...validPayload,
        teacherId: "teacher-1",
      });
    expect(teacherRolesResponse.status).toBe(200);
  });

  it("updates calendar events via id and surfaces missing events", async () => {
    CalendarEvent.findByIdAndUpdate.mockResolvedValueOnce({
      _id: "event-123",
    });
    const res = await request(app)
      .put("/api/calendar-events/event-123")
      .send({ title: "Updated" });
    expect(res.status).toBe(200);
    expect(res.body.event).toEqual({ _id: "event-123" });

    CalendarEvent.findByIdAndUpdate.mockResolvedValueOnce(null);
    const missingRes = await request(app)
      .put("/api/calendar-events/event-404")
      .send({ title: "Updated" });
    expect(missingRes.status).toBe(404);

    CalendarEvent.findByIdAndUpdate.mockRejectedValueOnce(new Error("boom"));
    const errorRes = await request(app)
      .put("/api/calendar-events/event-crash")
      .send({ title: "Updated" });
    expect(errorRes.status).toBe(500);
  });

  it("rejects syncable events when teacher profile is missing", async () => {
    Teacher.findOne.mockReturnValueOnce(createSessionQuery(null));
    const res = await request(app)
      .get("/api/calendar-events/syncable")
      .set("x-user-role", "teacher");
    expect(res.status).toBe(403);
  });

  it("updates a student's exam fields and guards invalid ids", async () => {
    const invalidIdRes = await request(app)
      .put("/api/update-exam/short")
      .send({ examTime: "11:00" });
    expect(invalidIdRes.status).toBe(400);

    const notFoundRes = await request(app)
      .put("/api/update-exam/aaaaaaaaaaaaaaaaaaaaaaaa")
      .send({ examTime: "11:00" });
    expect(notFoundRes.status).toBe(404);

    const student = {
      _id: "aaaaaaaaaaaaaaaaaaaaaaaa",
      save: vi.fn().mockResolvedValue(true),
    };
    Student.findById.mockResolvedValueOnce(student);
    const okRes = await request(app)
      .put("/api/update-exam/aaaaaaaaaaaaaaaaaaaaaaaa")
      .send({
        examTime: "11:00",
        examMunicipality: "City",
        examLocation: "Hall",
      });
    expect(okRes.status).toBe(200);
    expect(student.save).toHaveBeenCalled();
  });

  it("returns syncable events even when students have no teacher and filters dropout students", async () => {
    const withoutTeacher = {
      ...createStudent(),
      _id: "student-no-teacher",
      teacherId: null,
      dropout: false,
    };
    const dropoutStudent = {
      ...createStudent(),
      _id: "student-dropout",
      dropout: true,
    };
    studentFindResult = [withoutTeacher, dropoutStudent];
    Student.populate.mockResolvedValueOnce(studentFindResult);

    const res = await request(app)
      .get("/api/calendar-events/syncable")
      .set("x-user-role", "admin");

    expect(res.status).toBe(200);
    const allStudentIds = (res.body || []).flatMap(
      (event) => event.extendedProps?.students?.map((student) => student._id) || []
    );
    expect(allStudentIds).not.toContain("student-dropout");
  });

  it("returns 500 when updating an exam throws", async () => {
    Student.findById.mockRejectedValueOnce(new Error("boom update"));
    const res = await request(app)
      .put("/api/update-exam/aaaaaaaaaaaaaaaaaaaaaaaa")
      .send({ examTime: "11:00" });
    expect(res.status).toBe(500);
    expect(res.body.error).toBe("Serverfel");
  });

  it("handles mark-attendance missings and student lookups", async () => {
    Student.findOne.mockResolvedValueOnce(null);
    const res = await request(app)
      .put("/api/mark-attendance/  missing  ")
      .send({ attended: true });
    expect(res.status).toBe(404);
  });

  it("returns 500 when the mark-attendance personal lookup throws", async () => {
    Student.findOne.mockRejectedValueOnce(new Error("lookup boom"));
    const res = await request(app)
      .put("/api/mark-attendance/ 123 ")
      .send({ attended: true });
    expect(res.status).toBe(500);
    expect(res.body.message).toBe("Server error");
  });

  it("marks attendance for a found student", async () => {
    const studentDoc = {
      _id: "attend-1",
      name: "Attend Student",
      personalNumber: "300",
      save: vi.fn().mockResolvedValue(true),
      attendedExam: false,
    };
    Student.findOne.mockResolvedValueOnce(studentDoc);
    const res = await request(app)
      .put("/api/mark-attendance/ 300 ")
      .send({ attended: true });
    expect(res.status).toBe(200);
    expect(res.body.message).toBe("Attendance marked");
    expect(studentDoc.attendedExam).toBe(true);
    expect(studentDoc.save).toHaveBeenCalled();
  });

  it("validates examtime-location payloads and applies updates", async () => {
    const badRes = await request(app)
      .post("/api/examtime-location")
      .send({ studentIds: [], examTime: "08:00" });
    expect(badRes.status).toBe(400);

    Student.updateMany.mockResolvedValueOnce({ modifiedCount: 2 });
    const okRes = await request(app)
      .post("/api/examtime-location")
      .send({
        studentIds: ["student-1"],
        examTime: "08:00",
        examMunicipality: "City",
        examLocation: "Temp",
      });
    expect(okRes.status).toBe(200);
    expect(okRes.body.updatedCount).toBe(2);
  });

  it("returns 500 when examtime-location update fails", async () => {
    Student.updateMany.mockRejectedValueOnce(new Error("boom update"));
    const res = await request(app)
      .post("/api/examtime-location")
      .send({
        studentIds: ["student-1"],
        examTime: "08:00",
        examMunicipality: "City",
        examLocation: "Temp",
      });
    expect(res.status).toBe(500);
    expect(res.body).toEqual({
      message: "Serverfel",
      error: "boom update",
    });
  });

  it("computes attendance stats and handles lookup failures", async () => {
    examAttendanceFindResult = [
      {
        _id: "stats-1",
        attended: true,
        courseName: "Physics",
        teacherId: { userId: { username: "tutor" } },
      },
    ];
    const statsRes = await request(app).get("/api/attendance-stats/student-1");
    expect(statsRes.status).toBe(200);
    expect(statsRes.body.attendanceRate).toBeGreaterThanOrEqual(0);

    const failingChain = {
      populate: vi.fn().mockReturnThis(),
      sort: vi.fn(() => Promise.reject(new Error("boom"))),
    };
    mockExamAttendanceFind.mockReturnValueOnce(failingChain);
    const errRes = await request(app).get("/api/attendance-stats/student-1");
    expect(errRes.status).toBe(500);
  });

  it("accounts for missed exams in attendance statistics", async () => {
    examAttendanceFindResult = [
      {
        _id: "stats-missed",
        attended: false,
        courseName: "Biology",
        teacherId: { userId: { username: "tutor" } },
      },
    ];
    const res = await request(app).get("/api/attendance-stats/student-1");
    expect(res.status).toBe(200);
    expect(res.body.missedExams).toBe(1);
  });

  it("deletes exams and handles missing ones gracefully", async () => {
    Exam.findByIdAndDelete.mockResolvedValueOnce({ _id: "exam-del" });
    const deleted = await request(app).delete("/api/exams/exam-del").set("x-user-role", "admin");
    expect(deleted.status).toBe(200);

    const missing = await request(app).delete("/api/exams/exam-missing").set("x-user-role", "admin");
    expect(missing.status).toBe(404);
  });

  it("returns 500 when exam deletion fails", async () => {
    Exam.findByIdAndDelete.mockRejectedValueOnce(new Error("boom"));
    const res = await request(app).delete("/api/exams/exam-crash").set("x-user-role", "admin");
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: "Kunde inte radera prövning." });
  });

  it("rejects mark-attendance payloads with missing fields", async () => {
    const res = await request(app)
      .post("/api/calendar-events/mark-attendance")
      .send({ teacherId: "teacher-1", students: [] });
    expect(res.status).toBe(400);
  });

  it("handles exam decisions deny and invalid options", async () => {
    const examDoc = {
      _id: "decision-2",
      requestedMonth: "Augusti",
      teacherId: teacherDoc,
    };
    Exam.findById.mockReturnValueOnce(createQueryChain(examDoc));
    Exam.findByIdAndUpdate.mockResolvedValueOnce({
      _id: "decision-2",
      status: "denied",
    });
    const denyRes = await request(app)
      .put("/api/exams/decision-2/decision")
      .set("x-user-role", "admin")
      .send({ decision: "deny", comment: "Nope" });
    expect(denyRes.status).toBe(200);

    Exam.findById.mockReturnValueOnce(createQueryChain(examDoc));
    const invalidRes = await request(app)
      .put("/api/exams/decision-2/decision")
      .set("x-user-role", "admin")
      .send({ decision: "unknown" });
    expect(invalidRes.status).toBe(400);
  });

  it("rejects exam accept when requestedMonth is invalid", async () => {
    const examDoc = {
      _id: "decision-invalid",
      requestedMonth: "InvalidMonth",
      teacherId: teacherDoc,
    };
    Exam.findById.mockReturnValueOnce(createQueryChain(examDoc));
    const res = await request(app)
      .put("/api/exams/decision-invalid/decision")
      .set("x-user-role", "admin")
      .send({ decision: "accept", comment: "Invalid" });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "Ogiltigt datum för accept" });
  });

  it("returns 500 when the decision route throws", async () => {
    Exam.findById.mockRejectedValueOnce(new Error("boom"));
    const res = await request(app)
      .put("/api/exams/decision-error/decision")
      .set("x-user-role", "admin")
      .send({ decision: "accept", comment: "Crash" });
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: "Kunde inte spara beslut." });
  });

  it("returns 404 when the exam decision target is missing", async () => {
    Exam.findById.mockReturnValueOnce(createQueryChain(null));
    const res = await request(app)
      .put("/api/exams/not-found/decision")
      .set("x-user-role", "admin")
      .send({ decision: "accept", comment: "None" });
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: "Prövning hittades inte." });
  });

  it("reports errors when listing exams for a student fails", async () => {
    const failingChain = {
      populate: vi.fn().mockReturnThis(),
      sort: vi.fn(() => Promise.reject(new Error("boom"))),
    };
    mockExamAttendanceFind.mockReturnValueOnce(failingChain);
    const res = await request(app).get("/api/exams/student/student-1");
    expect(res.status).toBe(500);
  });
});
