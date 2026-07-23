import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/utils/courseMatchingService.js", () => ({
    __esModule: true,
    default: {
        processStudentEducation: vi.fn(),
        findBestCourseMatch: vi.fn(),
        updateCourseInstanceStats: vi.fn(),
        getCourseStatistics: vi.fn(),
        findOrCreateCourseInstance: vi.fn(),
    },
}));
vi.mock("../../src/models/Student.js", () => {
    function Student(data = {}) {
        Object.assign(this, data);
        this._id = data._id || "mock-student-id";
    }

    return {
        __esModule: true,
        default: Student,
    };
});
vi.mock("../../src/models/CourseInstance.js", () => {
    const CourseInstanceMock = vi.fn(function (doc = {}) {
        Object.assign(this, doc);
        this.save = vi.fn().mockResolvedValue(this);
    });

    Object.assign(CourseInstanceMock, {
        find: vi.fn(),
        findOne: vi.fn(),
        findById: vi.fn(),
        findByIdAndUpdate: vi.fn(),
        findByIdAndDelete: vi.fn(),
        deleteMany: vi.fn(),
    });

    return {
        __esModule: true,
        default: CourseInstanceMock,
    };
});
vi.mock("../../src/models/StudentEnrollment.js", () => ({
    __esModule: true,
    default: {
        find: vi.fn(),
        countDocuments: vi.fn(),
        findOne: vi.fn(),
        findById: vi.fn(),
        findByIdAndDelete: vi.fn(),
        deleteMany: vi.fn(),
    },
}));
vi.mock("../../src/models/CoursePackage.js", () => ({
    __esModule: true,
    default: {
        find: vi.fn(),
    },
}));
vi.mock("../../src/models/Course.js", () => ({
    __esModule: true,
    default: {
        find: vi.fn(),
        findById: vi.fn(),
    },
}));
vi.mock("../../src/utils/parseStudentExcel.js", () => ({
    __esModule: true,
    parseStudentExcel: vi.fn(),
    normalizeCodeForMatching: vi.fn((value) => value || ""),
}));
vi.mock("../../src/utils/teacherService.js", () => ({
    __esModule: true,
    createOrFindTeacher: vi.fn().mockResolvedValue({ teacher: { _id: "teacher1" }, user: {}, password: "pass" }),
}));
vi.mock("../../src/controllers/notificationController.js", () => ({
    __esModule: true,
    createGlobalNotification: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../../src/controllers/studentController.js", () => ({
    __esModule: true,
    normalizeMunicipalityName: vi.fn((value) => value),
    getClosestMunicipality: vi.fn(() => null),
}));
vi.mock("../../src/utils/slutprovDateCalculator.js", () => ({
    __esModule: true,
    calculateSlutprovDate: vi.fn(),
}));

import {
    createCourseInstance,
    deleteAllCourseInstances,
    deleteCourseInstance,
    findCourseMatch,
    getCourseInstanceEnrollments,
    getCourseInstances,
    getCourseStatistics,
    getStudentEnrollments,
    processStudentEducation,
    updateCourseInstance,
    updateEnrollmentDates,
    updateEnrollmentStatus,
    uploadStudentsForMatching,
} from "../../src/controllers/courseMatchingController.js";
import { createGlobalNotification } from "../../src/controllers/notificationController.js";
import { getClosestMunicipality } from "../../src/controllers/studentController.js";
import Course from "../../src/models/Course.js";
import CourseInstance from "../../src/models/CourseInstance.js";
import CoursePackage from "../../src/models/CoursePackage.js";
import Student from "../../src/models/Student.js";
import StudentEnrollment from "../../src/models/StudentEnrollment.js";
import CourseMatchingService from "../../src/utils/courseMatchingService.js";
import {
    normalizeCodeForMatching,
    parseStudentExcel,
} from "../../src/utils/parseStudentExcel.js";
import { calculateSlutprovDate } from "../../src/utils/slutprovDateCalculator.js";
import { createOrFindTeacher } from "../../src/utils/teacherService.js";

const createRes = () => {
    const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn().mockReturnThis(),
    };
    return res;
};

const createReq = (overrides = {}) => ({
    file: {
        buffer: Buffer.from("ok"),
        originalname: "students.xlsx",
    },
    user: { userId: "user1" },
    userId: "user1",
    cookies: {},
    body: {},
    query: {},
    params: {},
    ...overrides,
});

const createPopulateChain = (result) => {
    const chain = {
        populate: vi.fn(() => chain),
        sort: vi.fn(() => Promise.resolve(result)),
    };
    return chain;
};

beforeEach(() => {
    vi.resetAllMocks();
    calculateSlutprovDate.mockResolvedValue(null);
    Student.prototype.save = vi.fn().mockImplementation(function() {
        return Promise.resolve(this);
    });
    Student.findOne = vi.fn();
    Student.findById = vi.fn();
    Student.findByIdAndDelete = vi.fn();
    Student.countDocuments = vi.fn();
    Student.find = vi.fn();
    CourseMatchingService.processStudentEducation.mockResolvedValue({
        enrollments: [],
        warnings: [],
        errors: [],
    });
    CourseMatchingService.findBestCourseMatch.mockResolvedValue(null);
    Student.findOne.mockResolvedValue(null);
    Student.findById.mockReturnValue({
        lean: vi.fn().mockResolvedValue({ _id: "stu1", education: [] }),
    });
    Student.findByIdAndDelete.mockResolvedValue(undefined);
    Student.countDocuments.mockResolvedValue(0);
    Student.find.mockResolvedValue([]);
    CoursePackage.find.mockReturnValue({ lean: vi.fn().mockResolvedValue([]) });
    Course.find.mockReturnValue({ lean: vi.fn().mockResolvedValue([]) });
    Course.findById = vi.fn().mockResolvedValue({
        _id: "course1",
        courseName: "Course One",
        courseCode: "C1",
        coursePoints: "10",
        courseExtent: "5",
    });
    StudentEnrollment.countDocuments.mockResolvedValue(0);
    StudentEnrollment.findOne.mockReturnValue({
        select: vi.fn().mockResolvedValue({
            slutprovDate: new Date("2025-01-01"),
        }),
    });
    StudentEnrollment.find.mockReturnValue(
        createPopulateChain([{ _id: "enrollment1" }])
    );
    StudentEnrollment.findById.mockResolvedValue(null);
    StudentEnrollment.findByIdAndDelete.mockResolvedValue(null);
    StudentEnrollment.deleteMany.mockResolvedValue({ deletedCount: 0 });
    CourseInstance.find.mockReturnValue(
        createPopulateChain([
            {
                _id: "inst1",
                courseName: "Math",
                toObject: () => ({ _id: "inst1", courseName: "Math" }),
            },
        ])
    );
    CourseInstance.findById.mockResolvedValue(null);
    CourseInstance.findOne.mockResolvedValue(null);
    CourseInstance.findByIdAndUpdate.mockResolvedValue(null);
    CourseInstance.findByIdAndDelete.mockResolvedValue(null);
    CourseInstance.deleteMany.mockResolvedValue({ deletedCount: 0 });
    createOrFindTeacher.mockResolvedValue({
        teacher: { _id: "teacher1" },
        user: {},
        password: "pass",
    });
    createGlobalNotification.mockResolvedValue(undefined);
});

describe("uploadStudentsForMatching", () => {
    it("returns 400 when file missing", async () => {
        const req = createReq({ file: undefined });
        const res = createRes();

        await uploadStudentsForMatching(req, res);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith({ error: "No file uploaded" });
    });

    it("returns 422 when sanitize fails because of invalid additionalInfo", async () => {
        const req = createReq();
        const res = createRes();
        parseStudentExcel.mockResolvedValue([
            {
                email: "student@example.com",
                name: "Student",
                additionalInfo: { foo: "bar" },
                education: [{ name: "MATEMATIK NIVÅ 1", startDate: "2024-01-01", endDate: "2024-06-01" }],
            },
        ]);

        await uploadStudentsForMatching(req, res);

        expect(res.status).toHaveBeenCalledWith(422);
        expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({
                success: false,
                reasons: expect.any(Array),
                error: expect.stringContaining("Validering misslyckades"),
            })
        );
    });

    it("returns 422 when an education entry name cannot be converted to text", async () => {
        const req = createReq();
        const res = createRes();
        parseStudentExcel.mockResolvedValue([
            {
                email: "student@example.com",
                name: "Student",
                municipality: { type: "Lidingö" },
                education: [
                    {
                        name: { invalid: "object" },
                        startDate: "2024-01-01",
                        endDate: "2024-02-01",
                    },
                ],
            },
        ]);

        CoursePackage.find.mockReturnValue({
            lean: vi.fn().mockResolvedValue([]),
        });
        Course.find.mockReturnValue({
            lean: vi.fn().mockResolvedValue([
                {
                    _id: "course-1",
                    courseCode: "MAT101",
                    courseName: "Mathematik 1",
                },
            ]),
        });

        await uploadStudentsForMatching(req, res);

        expect(res.status).toHaveBeenCalledWith(422);
        const payload = res.json.mock.calls[0][0];
        expect(payload.reasons).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    type: "invalid_field",
                    field: "KURS/PAKET",
                }),
            ])
        );
    });

    it("processes parsed students, creates teacher, and enrolls course/package data", async () => {
        const req = createReq();
        const res = createRes();
        const coursePackage = {
            _id: "pkg-1",
            coursePackageCode: "MATHPKG",
            coursePackageName: "Mathematik paket",
        };
        const course = {
            _id: "course-1",
            courseCode: "ENGCOURSE",
            courseName: "Engelska",
        };

        parseStudentExcel.mockResolvedValue([
            {
                email: "student@example.com",
                name: "Student",
                additionalInfo: "Notes",
                teacher: "Teacher One",
                municipality: { type: "Lidingö" },
                education: [
                    {
                        name: "MATHPKG",
                        startDate: "2024-01-01",
                        endDate: "2024-02-01",
                        slutprovDate: "2024-03-01",
                    },
                    {
                        name: "ENGCOURSE",
                        startDate: "2024-01-15",
                        endDate: "2024-02-15",
                        slutprovDate: "2024-03-15",
                    },
                ],
            },
        ]);

        CoursePackage.find.mockReturnValue({
            lean: vi.fn().mockResolvedValue([coursePackage]),
        });
        Course.find.mockReturnValue({
            lean: vi.fn().mockResolvedValue([course]),
        });

        const teacherResult = {
            wasCreated: true,
            teacher: { _id: "teacher-id" },
            user: { username: "Teacher One", email: "teacher@example.com" },
            password: "secure",
        };
        createOrFindTeacher.mockResolvedValue(teacherResult);
        CourseMatchingService.processStudentEducation.mockImplementation(
            async (_studentId, entries) => ({
                enrollments: entries.map((entry) => ({
                    type: entry.type,
                    name: entry.name || entry.packageName,
                })),
                warnings: [],
                errors: [],
            })
        );

        await uploadStudentsForMatching(req, res);

        expect(createGlobalNotification).toHaveBeenCalledWith(
            "teacher_auto_created",
            expect.stringContaining("Teacher One")
        );
        expect(CourseMatchingService.processStudentEducation).toHaveBeenCalledTimes(2);
        expect(CourseMatchingService.processStudentEducation).toHaveBeenNthCalledWith(
            1,
            expect.any(String),
            [
                expect.objectContaining({
                    type: "CoursePackage",
                    refId: coursePackage._id,
                    name: coursePackage.coursePackageName,
                }),
            ],
            expect.any(String)
        );
        expect(CourseMatchingService.processStudentEducation).toHaveBeenNthCalledWith(
            2,
            expect.any(String),
            [
                expect.objectContaining({
                    type: "Course",
                    name: "ENGCOURSE",
                }),
            ],
            expect.any(String)
        );
        expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({
                success: true,
                message: expect.stringContaining("created 1 new teacher account"),
                results: expect.objectContaining({
                    students: expect.any(Array),
                    enrollments: expect.arrayContaining([
                        expect.objectContaining({ type: "CoursePackage" }),
                        expect.objectContaining({ type: "Course" }),
                    ]),
                    createdTeachers: expect.arrayContaining([
                        expect.objectContaining({ name: "Teacher One" }),
                    ]),
                }),
            })
        );
    });

    it("deduplicates missing package errors and filters instance-created warnings", async () => {
        const req = createReq();
        const res = createRes();
        const coursePackage = {
            _id: "pkg-1",
            coursePackageCode: "MATHPKG",
            coursePackageName: "Mathematik paket",
        };

        parseStudentExcel.mockResolvedValue([
            {
                email: "student@example.com",
                name: "Student",
                teacher: "Teacher One",
                additionalInfo: "Notes",
                municipality: { type: "Lidingö" },
                education: [
                    {
                        name: "MATHPKG",
                        startDate: "2024-01-01",
                        endDate: "2024-02-01",
                        slutprovDate: "2024-03-01",
                    },
                ],
            },
        ]);

        CoursePackage.find.mockReturnValue({
            lean: vi.fn().mockResolvedValue([coursePackage]),
        });
        Course.find.mockReturnValue({
            lean: vi.fn().mockResolvedValue([]),
        });

        CourseMatchingService.processStudentEducation.mockResolvedValue({
            enrollments: [{ type: "CoursePackage", name: coursePackage.coursePackageName }],
            warnings: [
                { type: "instance_created", message: "Skip this" },
                { type: "custom_warning", message: "Keep this" },
            ],
            errors: [
                {
                    type: "missing_package",
                    packageName: "PKG1",
                    message: "First",
                },
                {
                    type: "missing_package",
                    packageName: "PKG1",
                    message: "Second",
                },
            ],
        });

        await uploadStudentsForMatching(req, res);

        const payload = res.json.mock.calls[0][0];
        expect(payload).toEqual(
            expect.objectContaining({
                success: true,
                results: expect.objectContaining({
                    warnings: [expect.objectContaining({ type: "custom_warning" })],
                    errors: [
                        expect.objectContaining({
                            type: "missing_package",
                            error: "First",
                        }),
                    ],
                }),
            })
        );
    });

    it("does not abort when a student already has a course package but no new enrollments", async () => {
        const req = createReq();
        const res = createRes();
        const course = {
            _id: "course-package",
            courseCode: "COURSE123",
            courseName: "Course 123",
        };

        parseStudentExcel.mockResolvedValue([
            {
                email: "pkgowner@example.com",
                name: "Package Owner",
                municipality: { type: "Lidingö" },
                education: [
                    {
                        name: "COURSE123",
                        startDate: "2024-01-01",
                        endDate: "2024-02-01",
                    },
                ],
            },
        ]);

        CoursePackage.find.mockReturnValue({
            lean: vi.fn().mockResolvedValue([]),
        });
        Course.find.mockReturnValue({
            lean: vi.fn().mockResolvedValue([course]),
        });

        CourseMatchingService.processStudentEducation.mockResolvedValue({
            enrollments: [],
            warnings: [],
            errors: [],
        });

        Student.findById.mockReturnValue({
            lean: vi.fn().mockResolvedValue({
                _id: "pkg-existing",
                education: [{ type: "CoursePackage" }],
            }),
        });

        await uploadStudentsForMatching(req, res);

        expect(res.status).not.toHaveBeenCalled();
        const payload = res.json.mock.calls[0][0];
        expect(payload.success).toBe(true);
        expect(payload.results.enrollments).toHaveLength(0);
    });

    it("returns 422 when no enrollments can be created", async () => {
        const req = createReq();
        const res = createRes();
        const course = {
            _id: "course-1",
            courseCode: "MAT101",
            courseName: "Matte",
        };

        parseStudentExcel.mockResolvedValue([
            {
                email: "student@example.com",
                name: "Student",
                municipality: { type: "Lidingö" },
                education: [
                    {
                        name: "MAT101",
                        startDate: "2024-01-01",
                        endDate: "2024-02-01",
                    },
                ],
            },
        ]);

        CoursePackage.find.mockReturnValue({
            lean: vi.fn().mockResolvedValue([]),
        });
        Course.find.mockReturnValue({
            lean: vi.fn().mockResolvedValue([course]),
        });

        CourseMatchingService.processStudentEducation.mockResolvedValue({
            enrollments: [],
            warnings: [],
            errors: [],
        });

        Student.findById.mockReturnValue({
            lean: vi.fn().mockResolvedValue({ _id: "stu1", education: [] }),
        });

        await uploadStudentsForMatching(req, res);

        const payload = res.json.mock.calls[0][0];
        expect(res.status).toHaveBeenCalledWith(422);
        expect(payload.success).toBe(false);
        expect(payload.errorTypes.no_enrollments_created).toBe(1);
        expect(payload.reasons).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    type: "no_enrollments_created",
                    educationCodes: "MAT101",
                }),
            ])
        );
        expect(payload.summary).toContain("Inga registreringar skapade");
    });

    it("handles cleanup failures when zero enrollments were created", async () => {
        const req = createReq();
        const res = createRes();
        const course = {
            _id: "course-2",
            courseCode: "MAT101",
            courseName: "Matte",
        };

        parseStudentExcel.mockResolvedValue([
            {
                email: "cleanup@example.com",
                name: "Cleanup",
                municipality: { type: "Lidingö" },
                education: [
                    {
                        name: "MAT101",
                        startDate: "2024-01-01",
                        endDate: "2024-02-01",
                    },
                ],
            },
        ]);

        CoursePackage.find.mockReturnValue({
            lean: vi.fn().mockResolvedValue([]),
        });
        Course.find.mockReturnValue({
            lean: vi.fn().mockResolvedValue([course]),
        });

        CourseMatchingService.processStudentEducation.mockResolvedValue({
            enrollments: [],
            warnings: [],
            errors: [],
        });

        Student.findById.mockReturnValue({
            lean: vi.fn().mockResolvedValue({ _id: "stu-clean", education: [] }),
        });
        Student.findByIdAndDelete.mockRejectedValue(new Error("cleanup fail"));

        await uploadStudentsForMatching(req, res);

        expect(Student.findByIdAndDelete).toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(422);
    });

    it("deduplicates entries with the same email before processing", async () => {
        const req = createReq();
        const res = createRes();
        parseStudentExcel.mockResolvedValue([
            {
                email: "dup@example.com",
                name: "Student",
                teacher: "Teacher One",
                additionalInfo: "Notes",
                municipality: { type: "Lidingö" },
                education: [
                    {
                        name: "MATHPKG",
                        startDate: "2024-01-01",
                        endDate: "2024-01-31",
                    },
                ],
            },
            {
                email: "dup@example.com",
                name: "Student Duplicate",
                teacher: "Teacher One",
                additionalInfo: "More notes",
                municipality: { type: "Lidingö" },
                education: [
                    {
                        name: "ENGCOURSE",
                        startDate: "2024-02-01",
                        endDate: "2024-02-28",
                    },
                ],
            },
        ]);

        CoursePackage.find.mockReturnValue({
            lean: vi.fn().mockResolvedValue([
                {
                    _id: "pkg-1",
                    coursePackageCode: "MATHPKG",
                    coursePackageName: "Matematikk paket",
                },
            ]),
        });
        Course.find.mockReturnValue({
            lean: vi.fn().mockResolvedValue([
                {
                    _id: "course-1",
                    courseCode: "ENGCOURSE",
                    courseName: "Engelska",
                },
            ]),
        });

        CourseMatchingService.processStudentEducation.mockImplementation(
            async (_studentId, entries) => ({
                enrollments: entries.map((entry) => ({
                    type: entry.type || "Course",
                    name: entry.name || entry.packageName,
                })),
                warnings: [],
                errors: [],
            })
        );

        await uploadStudentsForMatching(req, res);

        const payload = res.json.mock.calls[0][0];
        expect(payload.success).toBe(true);
        expect(payload.results.students).toHaveLength(1);
        expect(payload.results.enrollments).toHaveLength(2);
    });

    it("prefers personal number when locating existing students", async () => {
        const req = createReq();
        const res = createRes();
        Student.findOne.mockResolvedValue(null);
        parseStudentExcel.mockResolvedValue([
            {
                email: "personal@example.com",
                name: "Personal Student",
                personalNumber: "19900101-1234",
                municipality: { type: "Lidingö" },
                education: [
                    {
                        name: "COURSE123",
                        startDate: "2025-01-01",
                        endDate: "2025-02-01",
                    },
                ],
            },
        ]);

        CoursePackage.find.mockReturnValue({
            lean: vi.fn().mockResolvedValue([]),
        });
        Course.find.mockReturnValue({
            lean: vi.fn().mockResolvedValue([
                {
                    _id: "course-personal",
                    courseCode: "COURSE123",
                    courseName: "Course 123",
                },
            ]),
        });

        CourseMatchingService.processStudentEducation.mockResolvedValue({
            enrollments: [{ type: "Course", name: "COURSE123" }],
            warnings: [],
            errors: [],
        });

        await uploadStudentsForMatching(req, res);

        expect(Student.findOne).toHaveBeenCalledWith({
            personalNumber: "19900101-1234",
        });
    });

    it("assigns a teacher to an existing student when missing teacherId", async () => {
        const req = createReq();
        const res = createRes();
        const existingStudent = {
            _id: "stu-existing",
            teacherId: null,
            save: vi.fn().mockResolvedValue(true),
        };
        Student.findOne.mockResolvedValue(existingStudent);
        parseStudentExcel.mockResolvedValue([
            {
                email: "exists@example.com",
                name: "Existing Student",
                teacher: "Teacher One",
                municipality: { type: "Lidingö" },
                education: [
                    {
                        name: "COURSE123",
                        startDate: "2025-01-01",
                        endDate: "2025-02-01",
                    },
                ],
            },
        ]);

        CoursePackage.find.mockReturnValue({
            lean: vi.fn().mockResolvedValue([]),
        });
        Course.find.mockReturnValue({
            lean: vi.fn().mockResolvedValue([
                {
                    _id: "course-existing",
                    courseCode: "COURSE123",
                    courseName: "Course 123",
                },
            ]),
        });

        CourseMatchingService.processStudentEducation.mockResolvedValue({
            enrollments: [{ type: "Course", name: "COURSE123" }],
            warnings: [],
            errors: [],
        });

        await uploadStudentsForMatching(req, res);

        expect(existingStudent.save).toHaveBeenCalled();
        expect(existingStudent.teacherId).toBe("teacher1");
    });

    it("does not fail when a student has no education entries", async () => {
        const req = createReq();
        const res = createRes();
        parseStudentExcel.mockResolvedValue([
            {
                email: "noeducation@example.com",
                name: "No Education Student",
                municipality: { type: "Lidingö" },
                education: [],
            },
        ]);
        CoursePackage.find.mockReturnValue({
            lean: vi.fn().mockResolvedValue([]),
        });
        Course.find.mockReturnValue({
            lean: vi.fn().mockResolvedValue([]),
        });
        CourseMatchingService.processStudentEducation.mockResolvedValue({
            enrollments: [],
            warnings: [],
            errors: [],
        });
        Student.findById.mockReturnValue({
            lean: vi.fn().mockResolvedValue({
                _id: "no-ed",
                education: [{ type: "CoursePackage" }],
            }),
        });

        await uploadStudentsForMatching(req, res);

        expect(CourseMatchingService.processStudentEducation).not.toHaveBeenCalled();
        expect(res.status).not.toHaveBeenCalled();
        const payload = res.json.mock.calls[0][0];
        expect(payload.success).toBe(true);
    });

    it("skips education entries that normalize to an empty string", async () => {
        const req = createReq();
        const res = createRes();
        normalizeCodeForMatching.mockImplementation((value) =>
            value === "1v" ? "" : value || ""
        );
        parseStudentExcel.mockResolvedValue([
            {
                email: "empty@example.com",
                name: "Empty Normalized",
                municipality: { type: "Lidingö" },
                education: [
                    {
                        name: "1v",
                        startDate: "2025-01-01",
                        endDate: "2025-02-01",
                    },
                ],
            },
        ]);
        CoursePackage.find.mockReturnValue({
            lean: vi.fn().mockResolvedValue([]),
        });
        Course.find.mockReturnValue({
            lean: vi.fn().mockResolvedValue([]),
        });
        CourseMatchingService.processStudentEducation.mockResolvedValue({
            enrollments: [],
            warnings: [],
            errors: [],
        });
        Student.findById.mockReturnValue({
            lean: vi.fn().mockResolvedValue({
                _id: "empty-norm",
                education: [{ type: "CoursePackage" }],
            }),
        });

        await uploadStudentsForMatching(req, res);

        expect(CourseMatchingService.processStudentEducation).not.toHaveBeenCalled();
        expect(res.status).not.toHaveBeenCalled();
    });

    it("coerces numeric education names and text fields before processing", async () => {
        const req = createReq();
        const res = createRes();
        parseStudentExcel.mockResolvedValue([
            {
                email: "coerce@example.com",
                name: "Coerce",
                teacher: "Teacher Snap",
                additionalInfo: { text: "Stringified" },
                municipality: { type: "Lidingö" },
                education: [
                    {
                        name: 123,
                        startDate: "2025-01-01",
                        endDate: "2025-02-01",
                    },
                ],
            },
        ]);

        CoursePackage.find.mockReturnValue({
            lean: vi.fn().mockResolvedValue([]),
        });
        Course.find.mockReturnValue({
            lean: vi.fn().mockResolvedValue([
                {
                    _id: "course-num",
                    courseCode: "123",
                    courseName: "Number Course",
                },
            ]),
        });

        CourseMatchingService.processStudentEducation.mockResolvedValue({
            enrollments: [{ type: "Course", name: "123" }],
            warnings: [],
            errors: [],
        });

        await uploadStudentsForMatching(req, res);

        const entryArgs = CourseMatchingService.processStudentEducation.mock.calls[0][1][0];
        expect(entryArgs.name).toBe("123");

        const payload = res.json.mock.calls[0][0];
        expect(payload.results.students[0].additionalInfo).toBe("Stringified");
    });

    it("returns 400 when parsed file contains no valid students", async () => {
        const req = createReq();
        const res = createRes();
        parseStudentExcel.mockResolvedValue([]);

        await uploadStudentsForMatching(req, res);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith({ error: "No valid data found in file." });
    });

    it("sanitizes richText before matching course codes", async () => {
        const req = createReq();
        const res = createRes();

        parseStudentExcel.mockResolvedValue([
            {
                email: "richtext@example.com",
                name: "Rich Student",
                additionalInfo: { richText: [{ text: "Some info" }] },
                municipality: { type: "Lidingö" },
                education: [
                    {
                        name: { richText: [{ text: "MATH101" }] },
                        startDate: "2025-01-01",
                        endDate: "2025-02-01",
                    },
                ],
            },
        ]);

        CoursePackage.find.mockReturnValue({
            lean: vi.fn().mockResolvedValue([]),
        });
        Course.find.mockReturnValue({
            lean: vi.fn().mockResolvedValue([
                {
                    _id: "course-2",
                    courseCode: "MATH101",
                    courseName: "Matematik 101",
                },
            ]),
        });

        await uploadStudentsForMatching(req, res);

        const entryArgs = CourseMatchingService.processStudentEducation.mock.calls[0][1][0];
        expect(entryArgs.name).toBe("MATH101");
    });

    it("returns 422 when a course name cannot be matched", async () => {
        const req = createReq();
        const res = createRes();

        parseStudentExcel.mockResolvedValue([
            {
                email: "nomatch@example.com",
                name: "No Match",
                municipality: { type: "Lidingö" },
                education: [
                    {
                        name: "UNKNOWNCODE",
                        startDate: "2025-01-01",
                        endDate: "2025-02-01",
                    },
                ],
            },
        ]);

        CoursePackage.find.mockReturnValue({
            lean: vi.fn().mockResolvedValue([]),
        });
        Course.find.mockReturnValue({
            lean: vi.fn().mockResolvedValue([
                { courseCode: "MAT101", courseName: "Matematik 1" },
            ]),
        });

        await uploadStudentsForMatching(req, res);

        expect(res.status).toHaveBeenCalledWith(422);
        const payload = res.json.mock.calls[0][0];
        expect(payload.errorTypes.no_match).toBe(1);
        expect(payload.reasons).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    type: "no_match",
                    courseCode: "UNKNOWNCODE",
                }),
            ])
        );
    });

    it("suggests nearby codes when a course name is slightly misspelled", async () => {
        const req = createReq();
        const res = createRes();
        parseStudentExcel.mockResolvedValue([
            {
                email: "suggest@example.com",
                name: "Suggest Student",
                municipality: { type: "Lidingö" },
                education: [
                    {
                        name: "MAT101A",
                        startDate: "2025-01-01",
                        endDate: "2025-02-01",
                    },
                ],
            },
        ]);

        CoursePackage.find.mockReturnValue({
            lean: vi.fn().mockResolvedValue([]),
        });
        Course.find.mockReturnValue({
            lean: vi.fn().mockResolvedValue([
                {
                    courseCode: "MAT101",
                    courseName: "Mathematik 1",
                },
            ]),
        });

        await uploadStudentsForMatching(req, res);

        expect(res.status).toHaveBeenCalledWith(422);
        const payload = res.json.mock.calls[0][0];
        const reason = payload.reasons[0];
        expect(reason.suggestions).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    code: "MAT101",
                }),
            ])
        );
    });

    it("skips course package entries when the normalized code loses its match", async () => {
        const req = createReq();
        const res = createRes();
        let normalizeCall = 0;
        normalizeCodeForMatching.mockImplementation((value) => {
            normalizeCall += 1;
            if (normalizeCall <= 2) return "PKG01";
            return "PKG01_MISSING";
        });
        parseStudentExcel.mockResolvedValue([
            {
                email: "pkgskip@example.com",
                name: "Package Skip",
                municipality: { type: "Lidingö" },
                education: [
                    {
                        name: "PKG01",
                        startDate: "2025-01-01",
                        endDate: "2025-02-01",
                    },
                ],
            },
        ]);

        CoursePackage.find.mockReturnValue({
            lean: vi.fn().mockResolvedValue([
                {
                    coursePackageCode: "PKG01",
                    coursePackageName: "Package 01",
                },
            ]),
        });
        Course.find.mockReturnValue({
            lean: vi.fn().mockResolvedValue([]),
        });
        Student.findById.mockReturnValue({
            lean: vi.fn().mockResolvedValue({
                _id: "pkg-skip",
                education: [{ type: "CoursePackage" }],
            }),
        });
        CourseMatchingService.processStudentEducation.mockResolvedValue({
            enrollments: [],
            warnings: [],
            errors: [],
        });

        await uploadStudentsForMatching(req, res);

        expect(CourseMatchingService.processStudentEducation).not.toHaveBeenCalled();
        expect(res.status).not.toHaveBeenCalled();
        const payload = res.json.mock.calls[0][0];
        expect(payload.success).toBe(true);
    });

    it("records teacher creation errors without aborting the upload", async () => {
        const req = createReq();
        const res = createRes();
        parseStudentExcel.mockResolvedValue([
            {
                email: "teachererror@example.com",
                name: "Teacher Error",
                teacher: "Problem Teacher",
                municipality: { type: "Lidingö" },
                education: [
                    {
                        name: "COURSE123",
                        startDate: "2025-01-01",
                        endDate: "2025-02-01",
                    },
                ],
            },
        ]);

        createOrFindTeacher.mockRejectedValueOnce(new Error("teacher creation failed"));
        CoursePackage.find.mockReturnValue({
            lean: vi.fn().mockResolvedValue([]),
        });
        Course.find.mockReturnValue({
            lean: vi.fn().mockResolvedValue([
                {
                    _id: "course-3",
                    courseCode: "COURSE123",
                    courseName: "Course 123",
                },
            ]),
        });

        CourseMatchingService.processStudentEducation.mockResolvedValue({
            enrollments: [{ type: "Course", name: "COURSE123" }],
            warnings: [],
            errors: [],
        });

        await uploadStudentsForMatching(req, res);

        const payload = res.json.mock.calls[0][0];
        expect(payload.success).toBe(true);
        expect(payload.results.errors).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    type: "teacher_creation",
                    teacher: "Problem Teacher",
                    error: expect.stringContaining("teacher creation failed"),
                }),
            ])
        );
    });

    it("continues when notification creation fails during teacher auto-creation", async () => {
        const req = createReq();
        const res = createRes();
        createGlobalNotification.mockRejectedValueOnce(new Error("notify fail"));
        createOrFindTeacher.mockResolvedValueOnce({
            wasCreated: true,
            teacher: { _id: "teacher-notify" },
            user: { username: "Teacher Notify" },
            password: "pass",
        });
        parseStudentExcel.mockResolvedValue([
            {
                email: "notify@example.com",
                name: "Notify Student",
                teacher: "Teacher Notify",
                municipality: { type: "Lidingö" },
                education: [
                    {
                        name: "COURSE123",
                        startDate: "2025-01-01",
                        endDate: "2025-02-01",
                    },
                ],
            },
        ]);

        CoursePackage.find.mockReturnValue({
            lean: vi.fn().mockResolvedValue([]),
        });
        Course.find.mockReturnValue({
            lean: vi.fn().mockResolvedValue([
                {
                    _id: "course-notify",
                    courseCode: "COURSE123",
                    courseName: "Course 123",
                },
            ]),
        });

        CourseMatchingService.processStudentEducation.mockResolvedValue({
            enrollments: [{ type: "Course", name: "COURSE123" }],
            warnings: [],
            errors: [],
        });

        await uploadStudentsForMatching(req, res);

        expect(createGlobalNotification).toHaveBeenCalled();
        expect(res.status).not.toHaveBeenCalled();
        const payload = res.json.mock.calls[0][0];
        expect(payload.success).toBe(true);
    });

    it("falls back to closest municipality when normalized value is unavailable", async () => {
        const req = createReq();
        const res = createRes();
        getClosestMunicipality.mockReturnValueOnce("Solna");
        parseStudentExcel.mockResolvedValue([
            {
                email: "fuzzy@example.com",
                name: "Fuzzy Student",
                municipality: "Soln",
                education: [
                    {
                        name: "COURSE123",
                        startDate: "2025-01-01",
                        endDate: "2025-02-01",
                    },
                ],
            },
        ]);

        CoursePackage.find.mockReturnValue({
            lean: vi.fn().mockResolvedValue([]),
        });
        Course.find.mockReturnValue({
            lean: vi.fn().mockResolvedValue([
                {
                    _id: "course-fuzzy",
                    courseCode: "COURSE123",
                    courseName: "Course 123",
                },
            ]),
        });

        CourseMatchingService.processStudentEducation.mockResolvedValue({
            enrollments: [{ type: "Course", name: "COURSE123" }],
            warnings: [],
            errors: [],
        });

        await uploadStudentsForMatching(req, res);

        const payload = res.json.mock.calls[0][0];
        expect(payload.results.students[0].municipality.type).toBe("Solna");
    });

    it("returns 422 when the municipality cannot be normalized or matched", async () => {
        const req = createReq();
        const res = createRes();
        parseStudentExcel.mockResolvedValue([
            {
                email: "badmuni@example.com",
                name: "Bad Mun",
                municipality: "Atlantis",
                education: [
                    {
                        name: "MAT101",
                        startDate: "2025-01-01",
                        endDate: "2025-02-01",
                    },
                ],
            },
        ]);

        CoursePackage.find.mockReturnValue({
            lean: vi.fn().mockResolvedValue([]),
        });
        Course.find.mockReturnValue({
            lean: vi.fn().mockResolvedValue([
                {
                    _id: "course-4",
                    courseCode: "MAT101",
                    courseName: "Matte 101",
                },
            ]),
        });

        await uploadStudentsForMatching(req, res);

        expect(res.status).not.toHaveBeenCalled();
        const payload = res.json.mock.calls[0][0];
        expect(payload.success).toBe(true);
        expect(payload.results.errors).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    type: "student_creation",
                    reasons: expect.arrayContaining([
                        expect.objectContaining({
                            type: "invalid_municipality",
                            message: expect.stringContaining("Ogiltig kommun"),
                        }),
                    ]),
                }),
            ])
        );
    });

    it("records enrollment_error when processing a package fails", async () => {
        const req = createReq();
        const res = createRes();

        parseStudentExcel.mockResolvedValue([
            {
                email: "pkgerr@example.com",
                name: "Package Error",
                municipality: { type: "Lidingö" },
                education: [
                    {
                        name: "MATHPKG",
                        startDate: "2025-01-01",
                        endDate: "2025-01-15",
                    },
                    {
                        name: "GOODCOURSE",
                        startDate: "2025-02-01",
                        endDate: "2025-02-15",
                    },
                ],
            },
        ]);

        CoursePackage.find.mockReturnValue({
            lean: vi.fn().mockResolvedValue([
                {
                    _id: "pkg-2",
                    coursePackageCode: "MATHPKG",
                    coursePackageName: "Mattepaket",
                },
            ]),
        });
        Course.find.mockReturnValue({
            lean: vi.fn().mockResolvedValue([
                {
                    _id: "course-5",
                    courseCode: "GOODCOURSE",
                    courseName: "Good Course",
                },
            ]),
        });

        CourseMatchingService.processStudentEducation
            .mockRejectedValueOnce(new Error("package fail"))
            .mockResolvedValueOnce({
                enrollments: [{ type: "Course", name: "GOODCOURSE" }],
                warnings: [],
                errors: [],
            });

        await uploadStudentsForMatching(req, res);

        const payload = res.json.mock.calls[0][0];
        expect(payload.results.errors).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    type: "enrollment_error",
                    packageName: "Mattepaket",
                }),
            ])
        );
    });

    it("records enrollment_error when processing a course fails", async () => {
        const req = createReq();
        const res = createRes();

        parseStudentExcel.mockResolvedValue([
            {
                email: "courseerr@example.com",
                name: "Course Error",
                municipality: { type: "Lidingö" },
                education: [
                    {
                        name: "FAILCOURSE",
                        startDate: "2025-01-01",
                        endDate: "2025-01-15",
                    },
                    {
                        name: "GOODCOURSE",
                        startDate: "2025-02-01",
                        endDate: "2025-02-15",
                    },
                ],
            },
        ]);

        CoursePackage.find.mockReturnValue({
            lean: vi.fn().mockResolvedValue([]),
        });
        Course.find.mockReturnValue({
            lean: vi.fn().mockResolvedValue([
                { _id: "course-6", courseCode: "FAILCOURSE", courseName: "Fail Course" },
                { _id: "course-7", courseCode: "GOODCOURSE", courseName: "Good Course" },
            ]),
        });

        CourseMatchingService.processStudentEducation
            .mockRejectedValueOnce(new Error("course fail"))
            .mockResolvedValueOnce({
                enrollments: [{ type: "Course", name: "GOODCOURSE" }],
                warnings: [],
                errors: [],
            });

        await uploadStudentsForMatching(req, res);

        const payload = res.json.mock.calls[0][0];
        expect(payload.results.errors).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    type: "enrollment_error",
                    courseCode: "FAILCOURSE",
                }),
            ])
        );
    });

    it("records student creation errors without detailed reasons", async () => {
        const req = createReq();
        const res = createRes();
        Student.prototype.save.mockRejectedValueOnce(new Error("save fail"));
        parseStudentExcel.mockResolvedValue([
            {
                email: "studentfail@example.com",
                name: "Student Fail",
                municipality: { type: "Lidingö" },
                education: [
                    {
                        name: "COURSE123",
                        startDate: "2025-01-01",
                        endDate: "2025-02-01",
                    },
                ],
            },
        ]);

        CoursePackage.find.mockReturnValue({
            lean: vi.fn().mockResolvedValue([]),
        });
        Course.find.mockReturnValue({
            lean: vi.fn().mockResolvedValue([
                {
                    _id: "course-fail",
                    courseCode: "COURSE123",
                    courseName: "Course 123",
                },
            ]),
        });

        await uploadStudentsForMatching(req, res);

        const payload = res.json.mock.calls[0][0];
        expect(payload.results.errors).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    type: "student_creation",
                    suggestion: expect.stringContaining(
                        "Kontrollera att alla obligatoriska fält"
                    ),
                }),
            ])
        );
    });

    it("returns 500 when parsing the uploaded file fails", async () => {
        const req = createReq();
        const res = createRes();
        parseStudentExcel.mockRejectedValue(new Error("parse failure"));

        await uploadStudentsForMatching(req, res);

        expect(res.status).toHaveBeenCalledWith(500);
        expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({
                success: false,
                error: "Ett internt serverfel uppstod vid bearbetning av filen.",
            })
        );
    });
});

describe("processStudentEducation controller", () => {
    it("processes education entries successfully", async () => {
        const req = {
            body: {
                studentId: "stu123",
                educationEntries: [{ type: "Course", name: "MAT101" }],
            },
            user: { userId: "u1" },
        };
        const res = createRes();
        Student.findById.mockResolvedValue({ _id: "stu123" });
        CourseMatchingService.processStudentEducation.mockResolvedValue({
            enrollments: [{ id: "enr1" }],
            warnings: [],
            errors: [],
        });

        await processStudentEducation(req, res);

        expect(CourseMatchingService.processStudentEducation).toHaveBeenCalledWith(
            "stu123",
            [{ type: "Course", name: "MAT101" }],
            "u1",
            {
                "examMode": undefined,
                "needsSupport": undefined,
            }
        );
        expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({
                success: true,
                results: expect.any(Object),
            })
        );
    });

    it("returns 400 when studentId or education entries missing", async () => {
        const req = { body: {} };
        const res = createRes();

        await processStudentEducation(req, res);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith({
            error: "Student ID and education entries are required",
        });
    });

    it("returns 404 when student not found", async () => {
        const req = {
            body: {
                studentId: "missing",
                educationEntries: [{ type: "Course", name: "MAT101" }],
            },
        };
        const res = createRes();
        Student.findById.mockResolvedValue(null);

        await processStudentEducation(req, res);

        expect(res.status).toHaveBeenCalledWith(404);
        expect(res.json).toHaveBeenCalledWith({ error: "Student not found" });
    });

    it("handles internal errors gracefully", async () => {
        const req = {
            body: {
                studentId: "stu123",
                educationEntries: [{ type: "Course", name: "MAT101" }],
            },
        };
        const res = createRes();
        Student.findById.mockResolvedValue({ _id: "stu123" });
        CourseMatchingService.processStudentEducation.mockRejectedValue(
            new Error("boom")
        );

        await processStudentEducation(req, res);

        expect(res.status).toHaveBeenCalledWith(500);
        expect(res.json).toHaveBeenCalledWith({ error: "Internal server error" });
    });
});

describe("findCourseMatch", () => {
    it("returns 400 when missing courseName", async () => {
        const req = { query: {} };
        const res = createRes();

        await findCourseMatch(req, res);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith({ error: "Course name is required" });
    });

    it("returns match when found", async () => {
        const req = { query: { courseName: "MAT101" } };
        const res = createRes();
        CourseMatchingService.findBestCourseMatch.mockResolvedValue({
            course: { _id: "c1", courseCode: "MAT101" },
            score: 1,
        });

        await findCourseMatch(req, res);

        expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({
                success: true,
                match: {
                    course: expect.objectContaining({ courseCode: "MAT101" }),
                    score: 1,
                },
            })
        );
    });

    it("returns no match when service returns null", async () => {
        const req = { query: { courseName: "MATH" } };
        const res = createRes();
        CourseMatchingService.findBestCourseMatch.mockResolvedValue(null);

        await findCourseMatch(req, res);

        expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({
                success: false,
                message: "No matching course found",
                suggestions: [],
            })
        );
    });

    it("handles internal errors when searching for match", async () => {
        const req = { query: { courseName: "MATH" } };
        const res = createRes();
        CourseMatchingService.findBestCourseMatch.mockRejectedValue(
            new Error("boom")
        );

        await findCourseMatch(req, res);

        expect(res.status).toHaveBeenCalledWith(500);
        expect(res.json).toHaveBeenCalledWith({ error: "Internal server error" });
    });
});

describe("getCourseInstances", () => {
    it("builds query and returns instances", async () => {
        const req = {
            query: {
                courseId: "c1",
                startDate: "2024-01-01",
                endDate: "2024-12-31",
                isActive: "true",
            },
        };
        const res = createRes();

        await getCourseInstances(req, res);

        expect(CourseInstance.find).toHaveBeenCalled();
        expect(StudentEnrollment.countDocuments).toHaveBeenCalled();
        expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({
                success: true,
                instances: expect.any(Array),
            })
        );
    });

    it("returns 500 when fetching instances fails", async () => {
        const req = { query: {} };
        const res = createRes();
        CourseInstance.find.mockRejectedValue(new Error("boom"));

        await getCourseInstances(req, res);

        expect(res.status).toHaveBeenCalledWith(500);
        expect(res.json).toHaveBeenCalledWith({ error: "Internal server error" });
    });
});

describe("getStudentEnrollments", () => {
    it("returns enrollments for student", async () => {
        const req = {
            params: { studentId: "stu1" },
            query: { status: "enrolled" },
        };
        const res = createRes();

        await getStudentEnrollments(req, res);

        expect(StudentEnrollment.find).toHaveBeenCalledWith(
            expect.objectContaining({ studentId: "stu1", status: "enrolled" })
        );
        expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({ success: true, enrollments: expect.any(Array) })
        );
    });

    it("applies date filters when provided", async () => {
        const req = {
            params: { studentId: "stu1" },
            query: { startDate: "2025-01-01", endDate: "2025-02-01" },
        };
        const res = createRes();

        await getStudentEnrollments(req, res);

        const queryArg = StudentEnrollment.find.mock.calls[0][0];
        expect(queryArg.studentId).toBe("stu1");
        expect(queryArg.$and).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ startDate: expect.any(Object) }),
                expect.objectContaining({ endDate: expect.any(Object) }),
            ])
        );
        expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({ success: true, enrollments: expect.any(Array) })
        );
    });

    it("handles errors when fetching student enrollments", async () => {
        const req = { params: { studentId: "stu1" }, query: {} };
        const res = createRes();
        StudentEnrollment.find.mockRejectedValue(new Error("boom"));

        await getStudentEnrollments(req, res);

        expect(res.status).toHaveBeenCalledWith(500);
        expect(res.json).toHaveBeenCalledWith({ error: "Internal server error" });
    });
});

describe("getCourseInstanceEnrollments", () => {
    it("returns enrollments for course instance", async () => {
        const mockEnrollments = [{ _id: "e1" }];
        const chain = {
            populate: vi.fn().mockReturnThis(),
            sort: vi.fn().mockResolvedValue(mockEnrollments),
        };
        StudentEnrollment.find.mockReturnValue(chain);

        const req = {
            params: { instanceId: "inst1" },
            query: { status: "enrolled" },
        };
        const res = createRes();

        await getCourseInstanceEnrollments(req, res);

        expect(StudentEnrollment.find).toHaveBeenCalledWith(
            expect.objectContaining({ courseInstanceId: "inst1", status: "enrolled" })
        );
        expect(chain.populate).toHaveBeenCalledTimes(4);
        expect(chain.sort).toHaveBeenCalledWith({ startDate: -1 });
        expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({ success: true, enrollments: mockEnrollments })
        );
    });

    it("handles errors when fetching course instance enrollments", async () => {
        const req = { params: { instanceId: "inst1" }, query: {} };
        const res = createRes();
        StudentEnrollment.find.mockRejectedValue(new Error("boom"));

        await getCourseInstanceEnrollments(req, res);

        expect(res.status).toHaveBeenCalledWith(500);
        expect(res.json).toHaveBeenCalledWith({ error: "Internal server error" });
    });
});

describe("updateEnrollmentStatus", () => {
    it("updates status and stats when enrollment exists", async () => {
        const changeStatus = vi.fn().mockResolvedValue(undefined);
        const enrollmentDoc = {
            changeStatus,
            courseInstanceId: "ci-1",
        };
        const populatedEnrollment = {
            _id: "enroll-1",
            courseInstanceId: "ci-1",
            status: "completed",
        };
        const populateChain = {
            populate: vi.fn(() => populateChain),
            then: (resolve) => resolve(populatedEnrollment),
            catch: () => populateChain,
        };
        StudentEnrollment.findById
            .mockResolvedValueOnce(enrollmentDoc)
            .mockReturnValueOnce(populateChain);
        const req = {
            params: { enrollmentId: "enroll-1" },
            body: { status: "completed", reason: "done", notes: "ok" },
            user: { userId: "user1" },
        };
        const res = createRes();

        await updateEnrollmentStatus(req, res);

        expect(changeStatus).toHaveBeenCalledWith("completed", "done", "ok", "user1");
        expect(CourseMatchingService.updateCourseInstanceStats).toHaveBeenCalledWith("ci-1");
        expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({
                success: true,
                enrollment: populatedEnrollment,
            })
        );
    });

    it("returns 404 when enrollment not found", async () => {
        StudentEnrollment.findById.mockResolvedValue(null);
        const req = {
            params: { enrollmentId: "missing" },
            body: {},
        };
        const res = createRes();

        await updateEnrollmentStatus(req, res);

        expect(res.status).toHaveBeenCalledWith(404);
        expect(res.json).toHaveBeenCalledWith({ error: "Enrollment not found" });
    });

    it("returns 500 when updating status fails unexpectedly", async () => {
        const req = {
            params: { enrollmentId: "enr-2" },
            body: { status: "done" },
            user: { userId: "u1" },
        };
        const res = createRes();
        StudentEnrollment.findById.mockRejectedValue(new Error("boom"));

        await updateEnrollmentStatus(req, res);

        expect(res.status).toHaveBeenCalledWith(500);
        expect(res.json).toHaveBeenCalledWith({ error: "Internal server error", message: "boom" });
    });
});

describe("updateEnrollmentDates", () => {
    it("updates dates when enrollment exists", async () => {
        const save = vi.fn().mockResolvedValue(undefined);
        StudentEnrollment.findById.mockResolvedValue({
            startDate: new Date(),
            endDate: new Date(),
            save,
        });
        const req = {
            params: { enrollmentId: "enroll-2" },
            body: { startDate: "2025-01-01", endDate: "2025-02-01" },
        };
        const res = createRes();

        await updateEnrollmentDates(req, res);

        expect(save).toHaveBeenCalled();
        expect(res.json).toHaveBeenCalledWith({
            success: true,
            message: "Enrollment dates updated successfully",
            enrollment: expect.any(Object),
        });
    });

    it("returns 404 when enrollment missing", async () => {
        StudentEnrollment.findById.mockResolvedValue(null);
        const req = { params: { enrollmentId: "absent" }, body: {} };
        const res = createRes();

        await updateEnrollmentDates(req, res);

        expect(res.status).toHaveBeenCalledWith(404);
        expect(res.json).toHaveBeenCalledWith({ error: "Enrollment not found" });
    });

    it("returns 500 when enrollment date update fails", async () => {
        const req = { params: { enrollmentId: "enroll-3" }, body: {} };
        const res = createRes();
        StudentEnrollment.findById.mockRejectedValue(new Error("boom"));

        await updateEnrollmentDates(req, res);

        expect(res.status).toHaveBeenCalledWith(500);
        expect(res.json).toHaveBeenCalledWith({ error: "Internal server error" });
    });
});

describe("getCourseStatistics", () => {
    it("returns 400 when dates missing", async () => {
        const req = { query: { startDate: "2025-01-01" } };
        const res = createRes();

        await getCourseStatistics(req, res);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith({ error: "Start date and end date are required" });
    });

    it("delegates to service when dates present", async () => {
        CourseMatchingService.getCourseStatistics.mockResolvedValue({ total: 3 });
        const req = {
            query: { startDate: "2025-01-01", endDate: "2025-12-31", courseId: "course" },
        };
        const res = createRes();

        await getCourseStatistics(req, res);

        expect(CourseMatchingService.getCourseStatistics).toHaveBeenCalledWith(
            new Date("2025-01-01"),
            new Date("2025-12-31"),
            "course"
        );
        expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({ success: true, statistics: { total: 3 } })
        );
    });

    it("returns 500 when fetching statistics fails", async () => {
        const req = {
            query: {
                startDate: "2025-01-01",
                endDate: "2025-12-31",
            },
        };
        const res = createRes();
        CourseMatchingService.getCourseStatistics.mockRejectedValue(
            new Error("boom")
        );

        await getCourseStatistics(req, res);

        expect(res.status).toHaveBeenCalledWith(500);
        expect(res.json).toHaveBeenCalledWith({ error: "Internal server error" });
    });
});

describe("createCourseInstance", () => {
    it("returns 400 when required fields missing", async () => {
        const req = { body: { startDate: "2025-01-01" } };
        const res = createRes();

        await createCourseInstance(req, res);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith({
            error: "Main course ID, start date, and end date are required",
        });
    });

    it("creates a course instance with inherited values", async () => {
        const req = {
            body: {
                mainCourseId: "course1",
                startDate: "2025-01-01",
                endDate: "2025-02-01",
            },
            user: { userId: "user1" },
        };
        const res = createRes();

        await createCourseInstance(req, res);

        const payload = res.json.mock.calls[0][0];
        expect(payload).toMatchObject({
            success: true,
            message: "Course instance created successfully",
            wasCreated: true,
        });
        expect(payload.instance).toMatchObject({
            mainCourseId: "course1",
            courseCode: "C12501",
            courseName: "Course One",
            coursePoints: "10",
            courseExtent: "5",
            createdBy: "user1",
            isActive: true,
        });
        expect(payload.instance.save).toHaveBeenCalled();
    });

    it("applies provided course data when creating instance", async () => {
        const req = {
            body: {
                mainCourseId: "course1",
                startDate: "2025-01-01",
                endDate: "2025-02-01",
                courseName: "Updated Name",
                coursePoints: "4",
                responsibleTeacher: "teach-1",
            },
            user: { userId: "user1" },
        };
        const res = createRes();

        await createCourseInstance(req, res);

        const payload = res.json.mock.calls[0][0];
        expect(payload.success).toBe(true);
        expect(payload.wasCreated).toBe(true);
        expect(payload.instance).toMatchObject({
            courseName: "Updated Name",
            coursePoints: "4",
            responsibleTeacher: "teach-1",
        });
        expect(payload.instance.save).toHaveBeenCalled();
    });

    it("returns 404 if main course is missing", async () => {
        Course.findById.mockResolvedValueOnce(null);
        const req = {
            body: {
                mainCourseId: "course1",
                startDate: "2025-01-01",
                endDate: "2025-02-01",
            },
        };
        const res = createRes();

        await createCourseInstance(req, res);

        expect(res.status).toHaveBeenCalledWith(404);
        expect(res.json).toHaveBeenCalledWith({ error: "Main course not found" });
    });
});

describe("updateCourseInstance", () => {
    it("returns 404 when instance missing", async () => {
        CourseInstance.findById.mockResolvedValue(null);
        const req = { params: { instanceId: "missing" }, body: {} };
        const res = createRes();

        await updateCourseInstance(req, res);

        expect(res.status).toHaveBeenCalledWith(404);
        expect(res.json).toHaveBeenCalledWith({ error: "Course instance not found" });
    });

    it("updates instance when found", async () => {
        const savedInstance = { _id: "inst-2", courseName: "Demo" };
        const save = vi.fn().mockResolvedValue(savedInstance);
        CourseInstance.findById.mockResolvedValue({
            _id: "inst-2",
            courseName: "Demo",
            mainCourseId: "course1",
            save,
        });
        const req = {
            params: { instanceId: "inst-2" },
            body: { notes: "updated" },
        };
        const res = createRes();

        await updateCourseInstance(req, res);

        expect(save).toHaveBeenCalled();
        expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({
                success: true,
                message: "Course instance updated successfully",
                instance: savedInstance,
            })
        );
    });

    it("auto-calculates slutprovDate when teacher or end date change", async () => {
        const req = {
            params: { instanceId: "inst-auto" },
            body: {
                responsibleTeacher: "teacher1",
                endDate: "2025-03-01",
            },
        };
        const res = createRes();
        const instance = {
            _id: "inst-auto",
            courseName: "Auto",
            responsibleTeacher: "teacher1",
            endDate: new Date("2025-02-01"),
            mainCourseId: "course1",
        };
        const calculatedDate = new Date("2025-02-24");
        instance.save = vi.fn().mockResolvedValue({
            ...instance,
            slutprovDate: calculatedDate,
        });
        CourseInstance.findById.mockResolvedValue(instance);
        calculateSlutprovDate.mockResolvedValue(calculatedDate);

        await updateCourseInstance(req, res);

        expect(calculateSlutprovDate).toHaveBeenCalledWith("teacher1", expect.any(Date));
        const calledDate = calculateSlutprovDate.mock.calls[0][1];
        expect(calledDate.getFullYear()).toBe(2025);
        expect(calledDate.getMonth()).toBe(2);
        expect(calledDate.getDate()).toBe(1);
        expect(instance.save).toHaveBeenCalled();
        expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({
                success: true,
                message: "Course instance updated successfully",
                instance: expect.objectContaining({ slutprovDate: calculatedDate }),
            })
        );
    });

    it("returns 500 when update fails", async () => {
        const req = {
            params: { instanceId: "inst-500" },
            body: {},
        };
        const res = createRes();
        CourseInstance.findById.mockRejectedValue(new Error("boom"));

        await updateCourseInstance(req, res);

        expect(res.status).toHaveBeenCalledWith(500);
        expect(res.json).toHaveBeenCalledWith({ error: "Internal server error" });
    });
});

describe("deleteCourseInstance", () => {
    it("returns 404 when instance not found", async () => {
        CourseInstance.findByIdAndDelete.mockResolvedValue(null);
        const req = { params: { instanceId: "missing" } };
        const res = createRes();

        await deleteCourseInstance(req, res);

        expect(res.status).toHaveBeenCalledWith(404);
        expect(res.json).toHaveBeenCalledWith({ error: "Course instance not found" });
    });

    it("deletes instance and enrollments", async () => {
        CourseInstance.findByIdAndDelete.mockResolvedValue({ _id: "inst-3" });
        StudentEnrollment.deleteMany.mockResolvedValue({ deletedCount: 1 });
        const req = { params: { instanceId: "inst-3" } };
        const res = createRes();

        await deleteCourseInstance(req, res);

        expect(StudentEnrollment.deleteMany).toHaveBeenCalledWith({ courseInstanceId: "inst-3" });
        expect(res.json).toHaveBeenCalledWith({
            success: true,
            message: "Course instance and related enrollments deleted",
        });
    });

    it("returns 500 when deleting instance fails", async () => {
        const req = { params: { instanceId: "inst-err" } };
        const res = createRes();
        CourseInstance.findByIdAndDelete.mockRejectedValue(new Error("boom"));

        await deleteCourseInstance(req, res);

        expect(res.status).toHaveBeenCalledWith(500);
        expect(res.json).toHaveBeenCalledWith({ error: "Internal server error" });
    });
});

describe("deleteAllCourseInstances", () => {
    it("clears all instances and enrollments", async () => {
        CourseInstance.deleteMany.mockResolvedValue({ deletedCount: 2 });
        StudentEnrollment.deleteMany.mockResolvedValue({ deletedCount: 3 });
        const req = {};
        const res = createRes();

        await deleteAllCourseInstances(req, res);

        expect(res.json).toHaveBeenCalledWith({
            success: true,
            message: "All course instances (2) and related enrollments (3) deleted",
        });
    });

    it("returns 500 when bulk deletion fails", async () => {
        const req = {};
        const res = createRes();
        CourseInstance.deleteMany.mockRejectedValue(new Error("boom"));

        await deleteAllCourseInstances(req, res);

        expect(res.status).toHaveBeenCalledWith(500);
        expect(res.json).toHaveBeenCalledWith({ error: "Internal server error" });
    });
});
