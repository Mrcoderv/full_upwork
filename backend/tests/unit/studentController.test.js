import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../src/models/Student.js", () => ({
  __esModule: true,
  default: {
    find: vi.fn(),
    findOne: vi.fn(),
    bulkWrite: vi.fn(),
  },
}));
vi.mock("../../src/models/Program.js", () => ({
  __esModule: true,
  default: {
    find: vi.fn(),
  },
}));
vi.mock("../../src/models/Course.js", () => ({
  __esModule: true,
  default: {
    find: vi.fn(),
  },
}));
vi.mock("../../src/models/CoursePackage.js", () => ({
  __esModule: true,
  default: {
    find: vi.fn(),
  },
}));
vi.mock("../../src/models/User.js", () => ({
  __esModule: true,
  default: {
    findOne: vi.fn(),
  },
}));
vi.mock("../../src/models/Teacher.js", () => ({
  __esModule: true,
  default: {
    findOne: vi.fn(),
  },
}));
const createOrFindTeacherMock = vi.fn(() =>
  Promise.resolve({ teacher: { _id: "created-teacher" } })
);
globalThis.createOrFindTeacher = createOrFindTeacherMock;

vi.mock("../../src/utils/parseStudentExcel.js", async () => {
  const actual = await vi.importActual(
    "../../src/utils/parseStudentExcel.js"
  );
  return {
    ...actual,
    parseStudentExcel: vi.fn(),
  };
});

vi.mock("../../src/services/emailService.js", () => ({
  __esModule: true,
  maybeSendLarteametEmail: vi.fn(),
  SOLLENTUNA_MUNICIPALITY: "Sollentuna",
}));

const loggerMock = vi.hoisted(() => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
}));
vi.mock("../../src/utils/logger.js", () => ({
  __esModule: true,
  default: loggerMock,
}));

import Student from "../../src/models/Student.js";
import Program from "../../src/models/Program.js";
import Course from "../../src/models/Course.js";
import CoursePackage from "../../src/models/CoursePackage.js";
import User from "../../src/models/User.js";
import Teacher from "../../src/models/Teacher.js";
import {
  uploadXlsx,
  normalizeMunicipalityName,
} from "../../src/controllers/studentController.js";
import * as parseModule from "../../src/utils/parseStudentExcel.js";
import { maybeSendLarteametEmail } from "../../src/services/emailService.js";

const createLeanResult = (value) => ({
  lean: vi.fn().mockResolvedValue(value),
});

const createMockRes = () => {
  const res = {
    status: vi.fn(() => res),
    json: vi.fn(() => res),
    send: vi.fn(() => res),
  };
  return res;
};

beforeEach(() => {
  vi.clearAllMocks();
  Student.find.mockResolvedValue([]);
  Student.findOne.mockResolvedValue({ education: [] });
  Student.bulkWrite.mockResolvedValue({});
  Program.find.mockReturnValue(createLeanResult([]));
  CoursePackage.find.mockReturnValue(createLeanResult([]));
  Course.find.mockReturnValue(createLeanResult([]));
  User.findOne.mockResolvedValue(null);
  Teacher.findOne.mockResolvedValue(null);
  createOrFindTeacherMock.mockClear();
  parseModule.parseStudentExcel.mockResolvedValue([]);
  maybeSendLarteametEmail.mockReset();
  maybeSendLarteametEmail.mockResolvedValue({ sent: true });
});

describe("normalizeMunicipalityName", () => {
  it("handles aliases and normalization", () => {
    expect(normalizeMunicipalityName("uppl. väsby")).toBe("Upplands Väsby");
    expect(normalizeMunicipalityName(" Uppl väsby ")).toBe("Upplands Väsby");
    expect(normalizeMunicipalityName(null)).toBeNull();
    expect(normalizeMunicipalityName("uppl foo väsby")).toBe("Upplands Väsby");
  });
});

describe("uploadXlsx", () => {
  it("returns 400 when no file is provided", async () => {
    const res = createMockRes();
    await uploadXlsx({}, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: "No file uploaded" });
  });

  it("returns 400 when parsing yields no students", async () => {
    parseModule.parseStudentExcel.mockResolvedValue([]);
    const res = createMockRes();
    const req = {
      file: { buffer: Buffer.from("data"), originalname: "test.xlsx" },
    };
    await uploadXlsx(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: "No valid data to save." });
  });

  it("returns 422 when pre-validation fails for unmatched courses", async () => {
    const parsedStudents = [
      {
        email: "nomatch@example.com",
        name: "Nomatch",
        municipality: "Solna",
        education: [{ name: "UNKNOWN COURSE NIVÅ 2" }],
      },
    ];
    parseModule.parseStudentExcel.mockResolvedValue(parsedStudents);
    const res = createMockRes();
    const req = {
      file: { buffer: Buffer.from("data"), originalname: "nomatch.xlsx" },
    };
    await uploadXlsx(req, res);
    expect(res.status).toHaveBeenCalledWith(422);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: "Unmatched courses found; upload aborted.",
        reasons: expect.any(Array),
      })
    );
  });

  it("processes valid student uploads", async () => {
    const parsedStudents = [
      {
        email: "merge@example.com",
        name: "Merge Student",
        municipality: "uppl. väsby",
        teacher: "Teacher, First",
        education: [{ name: "PKG-001" }],
      },
      {
        email: "merge@example.com",
        name: "Merge Student",
        municipality: "uppl. väsby",
        teacher: "Teacher, First",
        education: [{ name: "CRS-999 NIVÅ 1" }],
      },
    ];
    parseModule.parseStudentExcel.mockResolvedValue(parsedStudents);
    Program.find.mockReturnValue(
      createLeanResult([{ programName: "Test Program", _id: "prog-1" }])
    );
    CoursePackage.find.mockReturnValue(
      createLeanResult([
        { coursePackageCode: "PKG-001", _id: "pkg-1" },
        { coursePackageCode: "CRS-999 NIVÅ 1", _id: "pkg-2" },
      ])
    );
    Course.find.mockReturnValue(
      createLeanResult([{ courseCode: "CRS-ABC", _id: "course-1" }])
    );
    User.findOne.mockResolvedValue({ _id: "user-1", username: "teacheruser" });
    Teacher.findOne.mockResolvedValue({ _id: "teacher-1" });
    const res = createMockRes();
    const req = {
      file: { buffer: Buffer.from("data"), originalname: "valid.xlsx" },
    };
    await uploadXlsx(req, res);

    expect(Student.bulkWrite).toHaveBeenCalledTimes(1);
    expect(Student.findOne).toHaveBeenCalledWith({
      email: "merge@example.com",
    });
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        message: "Upload successful",
        students: expect.any(Array),
        warnings: expect.any(Array),
      })
    );
    const payload = res.json.mock.calls[0][0];
    expect(payload.students).toHaveLength(1);
    expect(payload.warnings).toEqual([]);
  });

  it("skips blank education rows and still accepts valid entries", async () => {
    const parsedStudents = [
      {
        email: "blank@example.com",
        name: "Blank Student",
        municipality: "Solna",
        teacher: "Teacher, First",
        education: [
          { name: "" },
          { name: "CRS-202 NIVÅ 2" },
        ],
      },
    ];
    parseModule.parseStudentExcel.mockResolvedValue(parsedStudents);
    Course.find.mockReturnValue(
      createLeanResult([{ courseCode: "CRS-202 NIVÅ 2", _id: "course-2" }])
    );
    const res = createMockRes();
    const req = {
      file: { buffer: Buffer.from("data"), originalname: "blank.xlsx" },
    };
    await uploadXlsx(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(Student.bulkWrite).toHaveBeenCalled();
  });

  it("fires the Lärteamet email exactly once for a newly created Sollentuna student", async () => {
    const parsedStudents = [
      {
        email: "sollentuna@example.com",
        name: "Sollentuna Student",
        municipality: "Sollentuna",
        teacher: "Teacher, First",
        education: [{ name: "CRS-101 NIVÅ 1" }],
      },
    ];
    parseModule.parseStudentExcel.mockResolvedValue(parsedStudents);
    Course.find.mockReturnValue(
      createLeanResult([{ courseCode: "CRS-101 NIVÅ 1", _id: "course-101" }])
    );
    const res = createMockRes();
    const req = {
      file: { buffer: Buffer.from("data"), originalname: "sollentuna.xlsx" },
    };
    await uploadXlsx(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(maybeSendLarteametEmail).toHaveBeenCalledTimes(1);
    expect(maybeSendLarteametEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        student: expect.objectContaining({
          email: "sollentuna@example.com",
          name: "Sollentuna Student",
          municipality: "Sollentuna",
        }),
        studentName: "Sollentuna Student",
        email: "sollentuna@example.com",
      })
    );
  });

  it("fires the Lärteamet email per-student for new Sollentuna students in a bulk upload", async () => {
    const parsedStudents = [
      {
        email: "sollentuna-a@example.com",
        name: "Student A",
        municipality: "Sollentuna",
        teacher: "Teacher, First",
        education: [{ name: "CRS-101 NIVÅ 1" }],
      },
      {
        email: "sollentuna-b@example.com",
        name: "Student B",
        municipality: "Sollentuna",
        teacher: "Teacher, First",
        education: [{ name: "CRS-101 NIVÅ 1" }],
      },
    ];
    parseModule.parseStudentExcel.mockResolvedValue(parsedStudents);
    Course.find.mockReturnValue(
      createLeanResult([{ courseCode: "CRS-101 NIVÅ 1", _id: "course-101" }])
    );
    const res = createMockRes();
    const req = {
      file: { buffer: Buffer.from("data"), originalname: "bulk-sollentuna.xlsx" },
    };
    await uploadXlsx(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(maybeSendLarteametEmail).toHaveBeenCalledTimes(2);
    const sentTo = maybeSendLarteametEmail.mock.calls.map(
      (call) => call[0].email
    );
    expect(sentTo.sort()).toEqual([
      "sollentuna-a@example.com",
      "sollentuna-b@example.com",
    ]);
  });

  it("does NOT re-fire the Lärteamet email for an existing re-uploaded Sollentuna student", async () => {
    const parsedStudents = [
      {
        email: "sollentuna-existing@example.com",
        name: "Returning Sollentuna",
        municipality: "Sollentuna",
        teacher: "Teacher, First",
        education: [{ name: "CRS-101 NIVÅ 1" }],
      },
    ];
    parseModule.parseStudentExcel.mockResolvedValue(parsedStudents);
    Course.find.mockReturnValue(
      createLeanResult([{ courseCode: "CRS-101 NIVÅ 1", _id: "course-101" }])
    );
    Student.find.mockResolvedValue([
      { email: "sollentuna-existing@example.com", education: [] },
    ]);
    const res = createMockRes();
    const req = {
      file: { buffer: Buffer.from("data"), originalname: "existing.xlsx" },
    };
    await uploadXlsx(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(maybeSendLarteametEmail).not.toHaveBeenCalled();
  });

  it("does NOT fire the Lärteamet email for non-Sollentuna students", async () => {
    const parsedStudents = [
      {
        email: "solna@example.com",
        name: "Solna Student",
        municipality: "Solna",
        teacher: "Teacher, First",
        education: [{ name: "CRS-101 NIVÅ 1" }],
      },
    ];
    parseModule.parseStudentExcel.mockResolvedValue(parsedStudents);
    Course.find.mockReturnValue(
      createLeanResult([{ courseCode: "CRS-101 NIVÅ 1", _id: "course-101" }])
    );
    const res = createMockRes();
    const req = {
      file: { buffer: Buffer.from("data"), originalname: "solna.xlsx" },
    };
    await uploadXlsx(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(maybeSendLarteametEmail).not.toHaveBeenCalled();
  });

  it("does not abort the upload when the Lärteamet email send fails", async () => {
    const parsedStudents = [
      {
        email: "sollentuna-fail@example.com",
        name: "Failed Email",
        municipality: "Sollentuna",
        teacher: "Teacher, First",
        education: [{ name: "CRS-101 NIVÅ 1" }],
      },
    ];
    parseModule.parseStudentExcel.mockResolvedValue(parsedStudents);
    Course.find.mockReturnValue(
      createLeanResult([{ courseCode: "CRS-101 NIVÅ 1", _id: "course-101" }])
    );
    maybeSendLarteametEmail.mockRejectedValue(new Error("SMTP down"));
    const res = createMockRes();
    const req = {
      file: { buffer: Buffer.from("data"), originalname: "sollentuna-fail.xlsx" },
    };
    await uploadXlsx(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(loggerMock.error).toHaveBeenCalledWith(
      expect.anything(),
      "Lärteamet email trigger failed (non-fatal)"
    );
  });

  it("returns 500 when the municipality cannot be matched", async () => {
    const parsedStudents = [
      {
        email: "fail@example.com",
        name: "No City",
        municipality: "Atlantis",
        teacher: "Teacher, First",
        education: [{ name: "CRS-404 NIVÅ 1" }],
      },
    ];
    parseModule.parseStudentExcel.mockResolvedValue(parsedStudents);
    Course.find.mockReturnValue(
      createLeanResult([{ courseCode: "CRS-404 NIVÅ 1", _id: "course-404" }])
    );
    const res = createMockRes();
    const req = {
      file: { buffer: Buffer.from("data"), originalname: "nomatch.xlsx" },
    };
    await uploadXlsx(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: "Failed to process file",
        details: expect.stringContaining("Could not match municipality"),
      })
    );
  });

  it("calls createOrFindTeacher when the user lookup returns nothing", async () => {
    const parsedStudents = [
      {
        email: "create@example.com",
        name: "Teacherless",
        municipality: "Solna",
        teacher: "Unknown, Teacher",
        subject: "Matte",
        education: [{ name: "CRS-777 NIVÅ 2" }],
      },
    ];
    parseModule.parseStudentExcel.mockResolvedValue(parsedStudents);
    Course.find.mockReturnValue(
      createLeanResult([{ courseCode: "CRS-777 NIVÅ 2", _id: "course-7" }])
    );
    User.findOne.mockResolvedValue(null);
    Teacher.findOne.mockResolvedValue(null);
    const res = createMockRes();
    const req = {
      file: { buffer: Buffer.from("data"), originalname: "teacher.xlsx" },
    };
    await uploadXlsx(req, res);

    expect(createOrFindTeacherMock).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it("skips education entries with empty normalized names", async () => {
    parseModule.parseStudentExcel.mockResolvedValue([
      {
        email: "skip@example.com",
        name: "Skipping Student",
        municipality: "Solna",
        teacher: "Teacher, Skip",
        education: [{ name: "()" }],
      },
    ]);
    const res = createMockRes();
    const req = {
      file: { buffer: Buffer.from("data"), originalname: "skip.xlsx" },
    };
    await uploadXlsx(req, res);

    expect(loggerMock.debug).toHaveBeenCalledWith(
      expect.objectContaining({ originalName: "()" }),
      "Skipping entry with empty normalized name"
    );
    expect(Student.bulkWrite).toHaveBeenCalledTimes(1);
  });

  it("provides suggestions when unmatched courses are prevalidated", async () => {
    parseModule.parseStudentExcel.mockResolvedValue([
      {
        email: "suggest@example.com",
        name: "Suggest Student",
        municipality: "Solna",
        education: [{ name: "SOMECOURSE NIVÅ 1" }],
      },
    ]);
    CoursePackage.find.mockReturnValue(
      createLeanResult([{ coursePackageCode: "OTHERPKG", _id: "pkg-1" }])
    );
    Course.find.mockReturnValue(
      createLeanResult([{ courseCode: "SOMECOURSE NIVÅ 2", _id: "course-1" }])
    );
    const res = createMockRes();
    const req = {
      file: { buffer: Buffer.from("data"), originalname: "suggest.xlsx" },
    };

    await uploadXlsx(req, res);

    expect(res.status).toHaveBeenCalledWith(422);
    const payload = res.json.mock.calls[0][0];
    expect(payload.reasons[0].message).toContain("closest course");
  });

  it("matches program entries and creates teachers when missing", async () => {
    parseModule.parseStudentExcel.mockResolvedValue([
      {
        email: "program@example.com",
        name: "Program Student",
        municipality: "Solna",
        teacher: "New Teacher, Lead",
        subject: "Mathematics",
        education: [{ name: "Test Program" }],
      },
    ]);
    Program.find.mockReturnValue(
      createLeanResult([{ programName: "Test Program", _id: "prog-1" }])
    );
    CoursePackage.find.mockReturnValue(createLeanResult([]));
    Course.find.mockReturnValue(createLeanResult([]));
    const res = createMockRes();
    const req = {
      file: { buffer: Buffer.from("data"), originalname: "program.xlsx" },
    };
    const normalizeSpy = vi
      .spyOn(parseModule, "normalizeCodeForMatching")
      .mockReturnValue("testprogram");

    try {
      await uploadXlsx(req, res);
    } finally {
      normalizeSpy.mockRestore();
    }

    expect(createOrFindTeacherMock).toHaveBeenCalledWith(
      "New Teacher, Lead",
      null,
      "Mathematics"
    );
    const bulkOps = Student.bulkWrite.mock.calls[0][0];
    const studentUpdate = bulkOps[0].updateOne.update.$set;
    expect(studentUpdate.teacherId).toBe("created-teacher");
    expect(studentUpdate.education[0]).toMatchObject({
      type: "Program",
      refId: "prog-1",
    });
    expect(res.status).toHaveBeenCalledWith(200);
  });
});
