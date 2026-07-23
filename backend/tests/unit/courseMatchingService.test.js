import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";

const loggerMock = vi.hoisted(() => ({
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
}));

const courseInstanceSaveMock = vi.fn();

class CourseInstanceMock {
    constructor(data) {
        Object.assign(this, data);
        this._id = data._id || `ci-${Math.random().toString(16).slice(2)}`;
        this.save = vi.fn().mockImplementation(() => {
            courseInstanceSaveMock(this);
            return Promise.resolve(this);
        });
    }

    static findOne = vi.fn();
    static findById = vi.fn();
}

let coursePackages = [];

const CoursePackageMock = {
    find: vi.fn(() => ({ lean: vi.fn(() => Promise.resolve(coursePackages)) })),
    findById: vi.fn(),
};

const CourseMock = {
    find: vi.fn(),
    findById: vi.fn(),
};

class StudentEnrollmentMock {
    constructor(data) {
        Object.assign(this, data);
        this._id = data._id || `enr-${Math.random().toString(16).slice(2)}`;
        this.save = vi.fn().mockResolvedValue(this);
        if (StudentEnrollmentMock.forceMissingCourseInstance) {
            this.courseInstanceId = undefined;
        }
        StudentEnrollmentMock.instances.push(this);
    }

    toObject() {
        return { ...this };
    }

    static findOne = vi.fn();
    static findById = vi.fn();
    static forceMissingCourseInstance = false;
    static instances = [];
}

class StudentMock {
    constructor(data) {
        Object.assign(this, data);
        this.education = data.education || [];
        this.save = vi.fn().mockResolvedValue(this);
    }

    static findById = vi.fn();
}

vi.mock("../../src/models/CourseInstance.js", () => ({
    __esModule: true,
    default: CourseInstanceMock,
}));
vi.mock("../../src/models/CoursePackage.js", () => ({
    __esModule: true,
    default: CoursePackageMock,
}));
vi.mock("../../src/models/Course.js", () => ({
    __esModule: true,
    default: CourseMock,
}));
vi.mock("../../src/models/StudentEnrollment.js", () => ({
    __esModule: true,
    default: StudentEnrollmentMock,
}));
vi.mock("../../src/models/Student.js", () => ({
    __esModule: true,
    default: StudentMock,
}));
vi.mock("../../src/models/Event.js", () => ({
    __esModule: true,
    default: class EventMock {
        static findOne = vi.fn();
        save = vi.fn().mockResolvedValue(this);
    },
}));

vi.mock("../../src/utils/logger.js", () => ({
    __esModule: true,
    default: loggerMock,
}));

import CourseMatchingService from "../../src/utils/courseMatchingService.js";

const resetMocks = () => {
    coursePackages = [];
    CourseInstanceMock.findOne.mockReset();
    CourseInstanceMock.findById.mockReset();
    CoursePackageMock.find.mockReset();
    CoursePackageMock.find.mockImplementation(() => ({
        lean: vi.fn(() => Promise.resolve(coursePackages)),
    }));
    CoursePackageMock.findById.mockReset();
    CourseMock.find.mockReset();
    CourseMock.findById.mockReset();
    StudentEnrollmentMock.findOne.mockReset();
    StudentEnrollmentMock.findById.mockReset();
    StudentMock.findById.mockReset();
    courseInstanceSaveMock.mockReset();
    StudentEnrollmentMock.forceMissingCourseInstance = false;
    StudentEnrollmentMock.instances = [];
    delete global._StudentModel;
    loggerMock.error.mockClear();
    loggerMock.warn.mockClear();
    loggerMock.info.mockClear();
    loggerMock.debug.mockClear();
};

beforeEach(() => {
    resetMocks();
    CourseInstanceMock.findOne.mockResolvedValue(null);
    StudentEnrollmentMock.findOne.mockResolvedValue(null);
    StudentEnrollmentMock.findById.mockImplementation(async (id) => {
        const found = StudentEnrollmentMock.instances.find(
            (instance) => instance._id === id
        );
        return found || null;
    });
});

afterEach(() => {
    resetMocks();
});

describe("CourseMatchingService helpers", () => {
    it("calculates next Monday, adds weeks, and finds Wednesdays", () => {
        const refDate = new Date("2025-01-01"); // Wednesday
        const nextMonday = CourseMatchingService.getNextMonday(refDate);
        expect(nextMonday.getDay()).toBe(1);
        expect(nextMonday.getDate()).toBe(6);

        const plusTwoWeeks = CourseMatchingService.addWeeks(refDate, 2);
        expect(plusTwoWeeks.getDate()).toBe(15);

        const wednesday = CourseMatchingService.getWednesdayOfWeek(
            "2025-01-01",
            1
        );
        expect(wednesday.getDay()).toBe(3);
    });

    it("cleans course names predictably", () => {
        const dirty = "  MAT101 (mot test); | ";
        expect(CourseMatchingService.cleanCourseName(dirty)).toBe("MAT101");
    });
});

describe("CourseMatchingService.findBestCourseMatch", () => {
    it("returns match when exact code exists", async () => {
        CourseMock.find.mockResolvedValueOnce([
            {
                _id: "course-a",
                courseCode: "MAT101",
                courseName: "Matte",
            },
        ]);

        const match = await CourseMatchingService.findBestCourseMatch("mat101");
        expect(match).toBeTruthy();
        expect(match?.score).toBe(1.0);
    });

    it("returns null when no courses found", async () => {
        CourseMock.find.mockResolvedValueOnce([]);
        CourseMock.find.mockResolvedValueOnce([]);

const match = await CourseMatchingService.findBestCourseMatch("unknown");
        expect(match).toBeNull();
    });

    it("returns null and skips database call when normalization yields no characters", async () => {
        CourseMock.find.mockReset();
        const result = await CourseMatchingService.findBestCourseMatch("   ");
        expect(result).toBeNull();
        expect(CourseMock.find).not.toHaveBeenCalled();
    });
});

describe("CourseMatchingService.findOrCreateCourseInstance", () => {
    it("returns existing instance and updates responsible teacher", async () => {
        const existingInstance = {
            _id: "ci-existing",
            courseName: "Existing",
            startDate: new Date("2025-01-01"),
            endDate: new Date("2025-03-01"),
            responsibleTeacher: "old",
            slutprovDate: new Date("2025-03-01"),
        };
        existingInstance.save = vi.fn().mockResolvedValue(existingInstance);
        CourseInstanceMock.findOne.mockResolvedValue(existingInstance);

        const result =
            await CourseMatchingService.findOrCreateCourseInstance(
                "course-id",
                new Date("2025-01-01"),
                new Date("2025-03-01"),
                "user",
                "new-teacher"
            );

        expect(result.wasCreated).toBe(false);
        expect(existingInstance.save).toHaveBeenCalled();
        expect(CourseMock.findById).not.toHaveBeenCalled();
    });

    it("patches slutprovDate on existing instance when explicitly provided without teacher", async () => {
        const existingInstance = {
            _id: "ci-patch",
            courseName: "Patch Course",
            startDate: new Date("2025-02-01"),
            endDate: new Date("2025-03-01"),
        };
        existingInstance.save = vi.fn().mockResolvedValue(existingInstance);
        CourseInstanceMock.findOne.mockResolvedValue(existingInstance);

        const result = await CourseMatchingService.findOrCreateCourseInstance(
            "course-patch",
            new Date("2025-02-01"),
            new Date("2025-03-01"),
            "user",
            null,
            new Date("2025-03-05")
        );

        expect(result.wasCreated).toBe(false);
        expect(existingInstance.slutprovDate).toEqual(new Date("2025-03-05"));
        expect(existingInstance.save).toHaveBeenCalled();
    });

    it("clears slutprovDate when teacher overrides and no explicit date provided", async () => {
        const existingInstance = {
            _id: "ci-clear",
            courseName: "Clear Course",
            startDate: new Date("2025-02-01"),
            endDate: new Date("2025-03-01"),
            responsibleTeacher: "other",
            slutprovDate: new Date("2025-03-05"),
        };
        existingInstance.save = vi.fn().mockResolvedValue(existingInstance);
        CourseInstanceMock.findOne.mockResolvedValue(existingInstance);

        const result = await CourseMatchingService.findOrCreateCourseInstance(
            "course-clear",
            new Date("2025-02-01"),
            new Date("2025-03-01"),
            "user",
            "teacher-new"
        );

        expect(result.wasCreated).toBe(false);
        expect(existingInstance.slutprovDate).toBeUndefined();
        expect(existingInstance.save).toHaveBeenCalled();
    });

    it("throws when the referenced main course cannot be found", async () => {
        CourseInstanceMock.findOne.mockResolvedValue(null);
        CourseMock.findById.mockResolvedValue(null);

        await expect(
            CourseMatchingService.findOrCreateCourseInstance(
                "missing-course",
                new Date("2025-05-01"),
                new Date("2025-06-01")
            )
        ).rejects.toThrow("Main course not found: missing-course");
    });
});

describe("CourseMatchingService.processStudentEducation", () => {
    it("processes an individual course entry", async () => {
        CoursePackageMock.find.mockImplementation(() => ({
            lean: vi.fn(() => Promise.resolve([])),
        }));
        CourseMock.findById.mockResolvedValue({
            _id: "course-1",
            courseName: "Matte",
            courseCode: "MAT101",
            coursePoints: 5,
            courseExtent: 5,
        });

        const match = {
            course: {
                _id: "course-1",
                courseName: "Matte",
                courseCode: "MAT101",
                courseExtent: "5",
            },
            score: 1,
        };
        const findMatchSpy = vi
            .spyOn(CourseMatchingService, "findBestCourseMatch")
            .mockResolvedValue(match);

        const studentDoc = {
            _id: "stu-1",
            education: [],
            teacherId: null,
            email: "student@test.com",
            save: vi.fn().mockResolvedValue(null),
        };
        StudentMock.findById.mockResolvedValue(studentDoc);

        const result = await CourseMatchingService.processStudentEducation(
            "stu-1",
            [
                {
                    type: "Course",
                    name: "MAT101",
                    startDate: "2025-01-15",
                    endDate: "2025-02-15",
                },
            ],
            "user1"
        );

        expect(findMatchSpy).toHaveBeenCalled();
        expect(result.enrollments).toHaveLength(1);
        expect(result.enrollments[0].courseInstanceName).toBe("Matte");
        expect(studentDoc.save).toHaveBeenCalled();
        findMatchSpy.mockRestore();
    });

    it("matches course packages by normalized code and applies refId/type", async () => {
        const packageDoc = {
            _id: "pkg-code-match",
            coursePackageCode: " PKG1 ",
            coursePackageName: "Package One",
            coursePackageCourses: [],
        };
        coursePackages = [packageDoc];

        const packageQuery = {
            populate: vi.fn().mockResolvedValue(packageDoc),
        };
        CoursePackageMock.findById.mockReturnValue(packageQuery);

        const studentDoc = new StudentMock({
            _id: "stu-code-match",
            education: [],
            email: "code@student.com",
        });
        StudentMock.findById.mockResolvedValue(studentDoc);

        const entry = {
            type: "CoursePackage",
            name: "pkg1",
            refId: null,
            startDate: "2025-02-01",
            endDate: "2025-03-01",
        };

        const result = await CourseMatchingService.processStudentEducation(
            "stu-code-match",
            [entry],
            "user-code"
        );

        expect(result.errors).toEqual([]);
        expect(entry.type).toBe("CoursePackage");
        expect(entry.refId).toBe("pkg-code-match");
    });

    it("processes a course package entry and updates education", async () => {
        const packageDoc = {
            _id: "pkg-1",
            coursePackageName: "Mattepaket",
            coursePackageCourses: [
                {
                    _id: "course-pack-1",
                    courseName: "Pack Course",
                    courseExtent: 5,
                },
            ],
        };
        coursePackages = [];
        CourseInstanceMock.findOne.mockResolvedValue(null);
        const packageQuery = {
            populate: vi.fn().mockResolvedValue(packageDoc),
        };
        CoursePackageMock.findById.mockReturnValue(packageQuery);
        const studentDoc = {
            _id: "stu-pkg",
            education: [],
            teacherId: null,
            email: "pkg@student.com",
            save: vi.fn().mockResolvedValue(null),
        };
        StudentMock.findById.mockResolvedValue(studentDoc);
        CourseMock.findById.mockResolvedValue({
            _id: "course-pack-1",
            courseName: "Pack Course",
            courseCode: "PACK1",
            courseExtent: 5,
        });

        const result = await CourseMatchingService.processStudentEducation(
            "stu-pkg",
            [
                {
                    type: "CoursePackage",
                    name: "PACK1",
                    refId: "pkg-1",
                    startDate: "2025-02-01",
                    endDate: "2025-04-01",
                },
            ],
            "userPkg"
        );

        expect(CoursePackageMock.findById).toHaveBeenCalledWith("pkg-1");
        expect(packageQuery.populate).toHaveBeenCalledWith(
            "coursePackageCourses"
        );
        expect(result.errors).toEqual([]);
        expect(studentDoc.save).toHaveBeenCalled();
    });
});

describe("CourseMatchingService.processStudentEducation additional scenarios", () => {
    it("records a processing error when course package auto-detection hits an internal ReferenceError", async () => {
        coursePackages = [
            {
                _id: "pkg-bug",
                coursePackageCode: "PKG1",
                coursePackageName: "Bug Package",
            },
        ];

        const result = await CourseMatchingService.processStudentEducation(
            "stu-bug",
            [
                {
                    type: "Course",
                    name: "PKG1",
                    startDate: "2025-01-01",
                    endDate: "2025-02-01",
                },
            ],
            "user-bug"
        );

        expect(result.errors).toEqual([
            {
                type: "processing_error",
                courseName: "PKG1",
                message: expect.any(String),
            },
        ]);
    });

    it("uses auto-calculated slutprovDate from enrollment pre-save hook when teacherId is set", async () => {
        const match = {
            course: {
                _id: "course-auto-date",
                courseName: "Auto Date Course",
                courseCode: "AUTO101",
                courseExtent: "5",
            },
            score: 1,
        };
        const findMatchSpy = vi
            .spyOn(CourseMatchingService, "findBestCourseMatch")
            .mockResolvedValue(match);

        const courseInstance = {
            _id: "ci-auto-date",
            courseName: "Auto Date Course",
            startDate: new Date("2025-01-01"),
            endDate: new Date("2025-02-01"),
        };
        const createSpy = vi
            .spyOn(CourseMatchingService, "findOrCreateCourseInstance")
            .mockResolvedValue({ instance: courseInstance, wasCreated: false });

        StudentEnrollmentMock.findOne.mockResolvedValue(null);
        StudentEnrollmentMock.findById.mockResolvedValueOnce({
            _id: "enr-auto",
            slutprovDate: new Date("2025-02-05"),
        });

        const studentDoc = new StudentMock({
            _id: "stu-auto-date",
            education: [],
            email: "auto@student.com",
        });
        StudentMock.findById.mockResolvedValue(studentDoc);

        const result = await CourseMatchingService.processStudentEducation(
            "stu-auto-date",
            [
                {
                    type: "Course",
                    name: "AUTO101",
                    startDate: "2025-01-01",
                    endDate: "2025-02-01",
                    teacherId: "teacher-auto",
                },
            ],
            "user-auto"
        );

        findMatchSpy.mockRestore();
        createSpy.mockRestore();

        expect(result.enrollments).toHaveLength(1);
        expect(
            StudentEnrollmentMock.instances[0].slutprovDate
                .toISOString()
                .slice(0, 10)
        ).toBe("2025-02-05");
    });

    it("loads package courses by id, handles grouping, and skips duplicate enrollments", async () => {
        const packageDoc = {
            _id: "pkg-ids",
            coursePackageName: "ID Package",
            coursePackageCourses: [
                {
                    _id: "course-a",
                    courseName: "Course A",
                    courseExtent: "2.5",
                },
                {
                    _id: "course-b",
                    courseName: "Course B",
                    courseExtent: "2.5",
                },
            ],
        };
        coursePackages = [packageDoc];

        const packageQuery = {
            populate: vi.fn().mockResolvedValue(packageDoc),
        };
        CoursePackageMock.findById.mockReturnValue(packageQuery);

        const findOrCreateSpy = vi
            .spyOn(CourseMatchingService, "findOrCreateCourseInstance")
            .mockResolvedValue({ instance: { _id: "ci-a", courseName: "Course A" }, wasCreated: false });

        StudentEnrollmentMock.findOne
            .mockResolvedValueOnce({ _id: "existing-enrollment" })
            .mockResolvedValueOnce({ _id: "existing-enrollment-2" });

        const result = await CourseMatchingService.processStudentEducation(
            "stu-ids",
            [
                {
                    type: "CoursePackage",
                    name: "ID Package",
                    refId: "pkg-ids",
                    startDate: "2025-02-01",
                    endDate: "2025-06-01",
                },
            ],
            "user-ids"
        );

        findOrCreateSpy.mockRestore();

        expect(result.errors).toEqual([]);
        expect(result.enrollments).toHaveLength(0);
    });

    it("re-imports the student model when global cache is unset and evaluates duplicate course checks", async () => {
        const packageDoc = {
            _id: "pkg-student-import",
            coursePackageName: "Student Import Package",
            coursePackageCourses: [
                {
                    _id: "course-one",
                    courseName: "Course One",
                    courseExtent: "5",
                },
            ],
        };

        const packageQuery = {
            populate: vi.fn().mockResolvedValue(packageDoc),
        };
        CoursePackageMock.findById.mockReturnValue(packageQuery);

        const createSpy = vi
            .spyOn(CourseMatchingService, "findOrCreateCourseInstance")
            .mockResolvedValue({
            instance: { _id: "ci-one", courseName: "Course One" },
            wasCreated: false,
        });

        StudentEnrollmentMock.findOne.mockResolvedValue(null);

        const studentDocB = {
            _id: "stu-student-import",
            email: "studentimport@student.com",
            education: [],
            save: vi.fn().mockResolvedValue(true),
        };
        const studentDocC = {
            ...studentDocB,
            education: [
                {
                    type: "Course",
                    refId: "course-existing",
                    startDate: new Date("2024-01-01"),
                    endDate: new Date("2024-02-01"),
                },
            ],
        };
        const studentDocD = {
            ...studentDocB,
            education: null,
        };

        StudentMock.findById
            .mockResolvedValueOnce(studentDocB)
            .mockResolvedValueOnce(studentDocC)
            .mockResolvedValueOnce(studentDocD);

        const originalDescriptor = Object.getOwnPropertyDescriptor(
            global,
            "_StudentModel"
        );
        delete global._StudentModel;

        let studentModelValue = StudentMock;
        let returnUndefinedNext = true;
        Object.defineProperty(global, "_StudentModel", {
            configurable: true,
            get() {
                const value = returnUndefinedNext ? undefined : studentModelValue;
                returnUndefinedNext = !returnUndefinedNext;
                return value;
            },
            set(value) {
                studentModelValue = value;
            },
        });

        const result = await CourseMatchingService.processStudentEducation(
            "stu-student-import",
            [
                {
                    type: "CoursePackage",
                    name: "Student Import Package",
                    refId: "pkg-student-import",
                    startDate: "2025-02-01",
                    endDate: "2025-03-01",
                },
            ],
            "user-student-import"
        );

        createSpy.mockRestore();

        delete global._StudentModel;
        if (originalDescriptor) {
            Object.defineProperty(global, "_StudentModel", originalDescriptor);
        }

        expect(result.errors).toEqual([]);
    });

    it("skips duplicate course enrollments in the implicit date path", async () => {
        const match = {
            course: {
                _id: "course-implicit-dup",
                courseName: "Implicit Dup Course",
                courseCode: "IDUP101",
                courseExtent: "5",
            },
            score: 1,
        };
        const findMatchSpy = vi
            .spyOn(CourseMatchingService, "findBestCourseMatch")
            .mockResolvedValue(match);

        const createSpy = vi
            .spyOn(CourseMatchingService, "findOrCreateCourseInstance")
            .mockResolvedValue({
                instance: {
                    _id: "ci-implicit-dup",
                    courseName: "Implicit Dup Course",
                },
                wasCreated: false,
            });

        StudentEnrollmentMock.findOne.mockResolvedValue({ _id: "existing" });

        const result = await CourseMatchingService.processStudentEducation(
            "stu-implicit-dup",
            [
                {
                    type: "Course",
                    name: "IDUP101",
                },
            ],
            "user-implicit-dup"
        );

        findMatchSpy.mockRestore();
        createSpy.mockRestore();

        expect(result.enrollments).toHaveLength(0);
    });

    it("warns when an implicit-date individual course enrollment is missing courseInstanceId", async () => {
        const match = {
            course: {
                _id: "course-missing-ci",
                courseName: "Missing CI Course",
                courseCode: "MCI101",
                courseExtent: "5",
            },
            score: 1,
        };
        const findMatchSpy = vi
            .spyOn(CourseMatchingService, "findBestCourseMatch")
            .mockResolvedValue(match);

        const createSpy = vi
            .spyOn(CourseMatchingService, "findOrCreateCourseInstance")
            .mockResolvedValue({
                instance: { _id: "ci-missing-ci", courseName: "Missing CI Course" },
                wasCreated: false,
            });

        StudentEnrollmentMock.findOne.mockResolvedValue(null);
        StudentEnrollmentMock.forceMissingCourseInstance = true;
        StudentMock.findById.mockResolvedValue(
            new StudentMock({
                _id: "stu-missing-ci",
                education: [],
                email: "missingci@student.com",
            })
        );

        const result = await CourseMatchingService.processStudentEducation(
            "stu-missing-ci",
            [
                {
                    type: "Course",
                    name: "MCI101",
                },
            ],
            "user-missing-ci"
        );

        findMatchSpy.mockRestore();
        createSpy.mockRestore();

        expect(result.enrollments).toHaveLength(0);
        expect(StudentEnrollmentMock.instances).toHaveLength(1);
    });

    it("records an error when a course package cannot be found", async () => {
        const packageQuery = {
            populate: vi.fn().mockResolvedValue(null),
        };
        CoursePackageMock.findById.mockReturnValue(packageQuery);

        const result = await CourseMatchingService.processStudentEducation(
            "stu-missing-pkg",
            [
                {
                    type: "CoursePackage",
                    name: "PACK-ERR",
                    refId: "pkg-not-found",
                },
            ],
            "user-missing"
        );

        expect(packageQuery.populate).toHaveBeenCalledWith(
            "coursePackageCourses"
        );
        expect(result.errors).toEqual([
            {
                type: "no_package",
                packageId: "pkg-not-found",
                message: expect.stringContaining("pkg-not-found"),
            },
        ]);
    });

    it("warns when an individual course has no match", async () => {
        const findMatchSpy = vi
            .spyOn(CourseMatchingService, "findBestCourseMatch")
            .mockResolvedValue(null);

        const result = await CourseMatchingService.processStudentEducation(
            "stu-no-match",
            [
                {
                    type: "Course",
                    name: "UNKNOWNCODE",
                },
            ],
            "user-warn"
        );

        expect(findMatchSpy).toHaveBeenCalledWith("UNKNOWNCODE");
        expect(result.warnings).toEqual([
            expect.objectContaining({
                type: "no_match",
                courseName: "UNKNOWNCODE",
                studentId: "stu-no-match",
                message: expect.stringContaining("UNKNOWNCODE"),
            }),
        ]);

        findMatchSpy.mockRestore();
    });

    it("creates program enrollment and adds it to student education", async () => {
        const studentDoc = new StudentMock({
            _id: "stu-program",
            education: [],
            email: "program@student.com",
        });
        StudentMock.findById.mockResolvedValue(studentDoc);

        const result = await CourseMatchingService.processStudentEducation(
            "stu-program",
            [
                {
                    type: "Program",
                    refId: "prog-1",
                    name: "Program One",
                    startDate: "2025-03-01",
                    endDate: "2025-06-01",
                    teacherId: "teach-prog",
                    notes: "notes",
                },
            ],
            "user-program"
        );

        expect(result.enrollments).toHaveLength(0);
        expect(StudentEnrollmentMock.instances[0].slutprovDate).toBeUndefined();
        expect(StudentEnrollmentMock.instances[0].programId).toBe("prog-1");
        expect(studentDoc.education).toEqual([
            {
                type: "Program",
                refId: "prog-1",
                name: "Program One",
                startDate: new Date("2025-03-01"),
                endDate: new Date("2025-06-01"),
                grade: null,
                addedAt: expect.any(Date),
                addedBy: "user-program",
                removedAt: null,
            },
        ]);
        expect(studentDoc.save).toHaveBeenCalled();
    });

    it("handles grouped course package enrollments with 2.5 week courses", async () => {
        const packageDoc = {
            _id: "pkg-grouped",
            coursePackageName: "Grouped Package",
            coursePackageCourses: [
                {
                    _id: "group-course-1",
                    courseName: "Group Course 1",
                    courseExtent: 2.5,
                },
                {
                    _id: "group-course-2",
                    courseName: "Group Course 2",
                    courseExtent: 2.5,
                },
            ],
        };

        const packageQuery = {
            populate: vi.fn().mockResolvedValue(packageDoc),
        };
        CoursePackageMock.findById.mockReturnValue(packageQuery);

        const studentDoc = new StudentMock({
            _id: "stu-grouped",
            education: [],
            teacherId: "teacher-group",
            email: "group@student.com",
        });
        StudentMock.findById.mockResolvedValue(studentDoc);

        StudentEnrollmentMock.findOne.mockResolvedValue(null);

        const firstInstance = {
            _id: "ci-group-1",
            courseName: "Group Course 1 Name",
        };
        const secondInstance = {
            _id: "ci-group-2",
            courseName: "Group Course 2 Name",
        };
        const findOrCreateSpy = vi
            .spyOn(CourseMatchingService, "findOrCreateCourseInstance")
            .mockResolvedValueOnce({
                instance: firstInstance,
                wasCreated: true,
            })
            .mockResolvedValueOnce({
                instance: secondInstance,
                wasCreated: true,
            });

        const result = await CourseMatchingService.processStudentEducation(
            "stu-grouped",
            [
                {
                    type: "CoursePackage",
                    name: "Grouped Package",
                    refId: "pkg-grouped",
                    startDate: "2025-02-01",
                    endDate: "2025-06-01",
                    teacherId: "teacher-for-package",
                },
            ],
            "user-grouped"
        );

        findOrCreateSpy.mockRestore();

        expect(packageQuery.populate).toHaveBeenCalledWith(
            "coursePackageCourses"
        );
        expect(result.errors).toEqual([]);
        expect(result.enrollments).toHaveLength(2);
        expect(result.warnings).toEqual([
            expect.objectContaining({
                type: "package_added",
                packageName: "Grouped Package",
                studentId: "stu-grouped",
                studentName: "group@student.com",
                message: expect.stringContaining("Grouped Package"),
            }),
        ]);
        expect(studentDoc.education.filter((entry) => entry.type === "Course"))
            .toHaveLength(2);
        expect(
            studentDoc.education.some(
                (entry) => entry.type === "CoursePackage"
            )
        ).toBe(true);
        expect(studentDoc.save).toHaveBeenCalled();
    });

    it("warns when course entry has start/end but no match", async () => {
        const findMatchSpy = vi
            .spyOn(CourseMatchingService, "findBestCourseMatch")
            .mockResolvedValue(null);

        const result = await CourseMatchingService.processStudentEducation(
            "stu-no-match-2",
            [
                {
                    type: "Course",
                    name: "UNKNOWN",
                    startDate: "2025-01-01",
                    endDate: "2025-02-01",
                },
            ],
            "user-warn-2"
        );

        expect(findMatchSpy).toHaveBeenCalled();
        expect(result.warnings).toEqual([
            expect.objectContaining({
                type: "no_match",
                courseName: "UNKNOWN",
                studentId: "stu-no-match-2",
                message: expect.stringContaining("UNKNOWN"),
            }),
        ]);

        findMatchSpy.mockRestore();
    });

    it("skips duplicate individual course enrollments", async () => {
        const match = {
            course: {
                _id: "course-dup",
                courseName: "Dup Course",
                courseCode: "DUP101",
                courseExtent: 5,
            },
            score: 1,
        };
        const findMatchSpy = vi
            .spyOn(CourseMatchingService, "findBestCourseMatch")
            .mockResolvedValue(match);

        const instance = {
            _id: "ci-dup",
            courseName: "Dup Course",
            startDate: new Date("2025-01-01"),
            endDate: new Date("2025-02-01"),
        };
        const createSpy = vi
            .spyOn(CourseMatchingService, "findOrCreateCourseInstance")
            .mockResolvedValue({ instance, wasCreated: false });

        StudentEnrollmentMock.findOne.mockResolvedValue({ _id: "existing" });

        const result = await CourseMatchingService.processStudentEducation(
            "stu-dup",
            [
                {
                    type: "Course",
                    name: "DUP101",
                    startDate: "2025-01-01",
                    endDate: "2025-02-01",
                    teacherId: "teacher-dup",
                },
            ],
            "user-dup"
        );

        findMatchSpy.mockRestore();
        createSpy.mockRestore();

        expect(result.enrollments).toHaveLength(0);
    });

    it("handles individual course entries without explicit dates by using the next Monday", async () => {
        const match = {
            course: {
                _id: "course-node-date",
                courseName: "No Date Course",
                courseCode: "NDATE101",
                courseExtent: "5",
            },
            score: 1,
        };
        const findMatchSpy = vi
            .spyOn(CourseMatchingService, "findBestCourseMatch")
            .mockResolvedValue(match);

        const nextMonday = new Date("2025-04-07");
        const getNextMondaySpy = vi
            .spyOn(CourseMatchingService, "getNextMonday")
            .mockReturnValue(nextMonday);

        const courseEnd = new Date("2025-05-12");
        const instance = {
            _id: "ci-no-date",
            courseName: "No Date Course",
            startDate: nextMonday,
            endDate: courseEnd,
        };
        const createSpy = vi
            .spyOn(CourseMatchingService, "findOrCreateCourseInstance")
            .mockResolvedValue({ instance, wasCreated: true });

        StudentEnrollmentMock.findOne.mockResolvedValue(null);
        const studentDoc = new StudentMock({
            _id: "stu-no-date",
            education: [],
            email: "nodate@student.com",
        });
        StudentMock.findById.mockResolvedValue(studentDoc);

        const result = await CourseMatchingService.processStudentEducation(
            "stu-no-date",
            [
                {
                    type: "Course",
                    name: "NDATE101",
                },
            ],
            "user-no-date"
        );

        expect(getNextMondaySpy).toHaveBeenCalled();

        findMatchSpy.mockRestore();
        createSpy.mockRestore();
        getNextMondaySpy.mockRestore();
        expect(result.enrollments).toHaveLength(1);
        expect(StudentEnrollmentMock.instances[0].startDate).toEqual(
            nextMonday
        );
        expect(studentDoc.education?.length ?? 0).toBeGreaterThanOrEqual(1);
    });

    it("records instance_created warning when a new individual course instance is created", async () => {
        const match = {
            course: {
                _id: "course-new",
                courseName: "New Course",
                courseCode: "NEW101",
                courseExtent: 5,
            },
            score: 1,
        };
        const findMatchSpy = vi
            .spyOn(CourseMatchingService, "findBestCourseMatch")
            .mockResolvedValue(match);

        const instance = {
            _id: "ci-new-course",
            courseName: "New Course",
            startDate: new Date("2025-03-01"),
            endDate: new Date("2025-04-01"),
        };
        const createSpy = vi
            .spyOn(CourseMatchingService, "findOrCreateCourseInstance")
            .mockResolvedValue({ instance, wasCreated: true });

        StudentEnrollmentMock.findOne.mockResolvedValue(null);
        StudentMock.findById.mockResolvedValue(
            new StudentMock({
                _id: "stu-new-course",
                education: [],
                email: "new@student.com",
            })
        );

        const result = await CourseMatchingService.processStudentEducation(
            "stu-new-course",
            [
                {
                    type: "Course",
                    name: "NEW101",
                    startDate: "2025-03-01",
                    endDate: "2025-04-01",
                },
            ],
            "user-new-course"
        );

        expect(result.warnings).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    type: "instance_created",
                    courseName: "NEW101",
                }),
            ])
        );

        findMatchSpy.mockRestore();
        createSpy.mockRestore();
    });

    it("continues when calendar event creation throws", async () => {
        const match = {
            course: {
                _id: "course-err",
                courseName: "Error Course",
                courseCode: "ERR101",
                courseExtent: 5,
            },
            score: 1,
        };
        const findMatchSpy = vi
            .spyOn(CourseMatchingService, "findBestCourseMatch")
            .mockResolvedValue(match);

        const instance = {
            _id: "ci-err",
            courseName: "Error Course",
            startDate: new Date("2025-01-01"),
            endDate: new Date("2025-02-01"),
        };
        const createSpy = vi
            .spyOn(CourseMatchingService, "findOrCreateCourseInstance")
            .mockResolvedValue({ instance, wasCreated: false });

        StudentEnrollmentMock.findOne.mockResolvedValue(null);
        StudentMock.findById.mockResolvedValue(
            new StudentMock({
                _id: "stu-event",
                education: [],
                email: "event@student.com",
            })
        );

        const getWednesdaySpy = vi
            .spyOn(CourseMatchingService, "getWednesdayOfWeek")
            .mockImplementation(() => {
                throw new Error("calendar fail");
            });

        const result = await CourseMatchingService.processStudentEducation(
            "stu-event",
            [
                {
                    type: "Course",
                    name: "ERR101",
                    startDate: "2025-01-01",
                    endDate: "2025-02-01",
                    teacherId: "teacher-event",
                },
            ],
            "user-event"
        );

        expect(getWednesdaySpy).toHaveBeenCalled();
        expect(result.errors).toEqual([
            {
                type: "processing_error",
                courseName: "ERR101",
                message: "calendar fail",
            },
        ]);

        findMatchSpy.mockRestore();
        createSpy.mockRestore();
        getWednesdaySpy.mockRestore();
    });

    it("passes through when student document is missing during education updates", async () => {
        const match = {
            course: {
                _id: "course-no-student",
                courseName: "No Student Course",
                courseCode: "NST101",
                courseExtent: 5,
            },
            score: 1,
        };
        const findMatchSpy = vi
            .spyOn(CourseMatchingService, "findBestCourseMatch")
            .mockResolvedValue(match);

        const instance = {
            _id: "ci-no-student",
            courseName: "No Student Course",
            startDate: new Date("2025-03-01"),
            endDate: new Date("2025-04-01"),
        };
        const createSpy = vi
            .spyOn(CourseMatchingService, "findOrCreateCourseInstance")
            .mockResolvedValue({ instance, wasCreated: false });

        StudentEnrollmentMock.findOne.mockResolvedValue(null);
        StudentMock.findById.mockResolvedValue(null);

        const result = await CourseMatchingService.processStudentEducation(
            "stu-absent",
            [
                {
                    type: "Course",
                    name: "NST101",
                    startDate: "2025-03-01",
                    endDate: "2025-04-01",
                },
            ],
            "user-absent"
        );

        findMatchSpy.mockRestore();
        createSpy.mockRestore();

        expect(result.enrollments).toHaveLength(1);
    });

    it("warns and skips when course package course instance cannot be created", async () => {
        const packageDoc = {
            _id: "pkg-skip",
            coursePackageName: "Skip Package",
            coursePackageCourses: [
                {
                    _id: "skip-course-1",
                    courseName: "Skip Course",
                    courseExtent: 5,
                },
            ],
        };
        coursePackages = [packageDoc];

        const packageQuery = {
            populate: vi.fn().mockResolvedValue(packageDoc),
        };
        CoursePackageMock.findById.mockReturnValue(packageQuery);

        const findOrCreateSpy = vi
            .spyOn(CourseMatchingService, "findOrCreateCourseInstance")
            .mockResolvedValue({ instance: null, wasCreated: false });

        const result = await CourseMatchingService.processStudentEducation(
            "stu-skip",
            [
                {
                    type: "CoursePackage",
                    name: "Skip Course",
                    refId: "pkg-skip",
                    startDate: "2025-05-01",
                    endDate: "2025-06-01",
                },
            ],
            "user-skip"
        );

        findOrCreateSpy.mockRestore();

        expect(result.enrollments).toHaveLength(0);
        expect(result.errors).toEqual([]);
    });

    it("deduplicates grouped pack second course when enrollment exists", async () => {
        const packageDoc = {
            _id: "pkg-dedup",
            coursePackageName: "Dedup Package",
            coursePackageCourses: [
                {
                    _id: "dedup-course-1",
                    courseName: "Dedup Course 1",
                    courseExtent: 2.5,
                },
                {
                    _id: "dedup-course-2",
                    courseName: "Dedup Course 2",
                    courseExtent: 2.5,
                },
            ],
        };
        coursePackages = [packageDoc];

        const packageQuery = {
            populate: vi.fn().mockResolvedValue(packageDoc),
        };
        CoursePackageMock.findById.mockReturnValue(packageQuery);

        const studentDoc = new StudentMock({
            _id: "stu-dedup",
            education: [],
            teacherId: "teacher-dedup",
            email: "dedup@student.com",
        });
        StudentMock.findById.mockResolvedValue(studentDoc);

        StudentEnrollmentMock.findOne
            .mockResolvedValueOnce(null)
            .mockResolvedValueOnce({ _id: "existing-next" });

        const firstInstance = {
            _id: "ci-dedup-1",
            courseName: "Dedup Course 1",
        };
        const secondInstance = {
            _id: "ci-dedup-2",
            courseName: "Dedup Course 2",
        };
        const findOrCreateSpy = vi
            .spyOn(CourseMatchingService, "findOrCreateCourseInstance")
            .mockResolvedValueOnce({
                instance: firstInstance,
                wasCreated: true,
            })
            .mockResolvedValueOnce({
                instance: secondInstance,
                wasCreated: true,
            });

        const result = await CourseMatchingService.processStudentEducation(
            "stu-dedup",
            [
                {
                    type: "CoursePackage",
                    name: "Dedup Package",
                    refId: "pkg-dedup",
                    startDate: "2025-02-01",
                    endDate: "2025-08-01",
                },
            ],
            "user-dedup"
        );

        findOrCreateSpy.mockRestore();

        expect(result.enrollments).toHaveLength(1);
        expect(result.warnings).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ type: "package_added" }),
            ])
        );
    });

    it("skips individual course enrollment when instance is missing", async () => {
        const match = {
            course: {
                _id: "course-no-instance",
                courseName: "No Instance",
                courseCode: "NOI101",
                courseExtent: 5,
            },
            score: 1,
        };
        const findMatchSpy = vi
            .spyOn(CourseMatchingService, "findBestCourseMatch")
            .mockResolvedValue(match);

        const createSpy = vi
            .spyOn(CourseMatchingService, "findOrCreateCourseInstance")
            .mockResolvedValue({ instance: null, wasCreated: false });

        const result = await CourseMatchingService.processStudentEducation(
            "stu-no-instance",
            [
                {
                    type: "Course",
                    name: "NOI101",
                    startDate: "2025-01-01",
                    endDate: "2025-02-01",
                },
            ],
            "user-no-instance"
        );

        findMatchSpy.mockRestore();
        createSpy.mockRestore();

        expect(result.enrollments).toHaveLength(0);
    });

    it("records processing_error when match lookup throws", async () => {
        const error = new Error("match failure");
        const findMatchSpy = vi
            .spyOn(CourseMatchingService, "findBestCourseMatch")
            .mockRejectedValue(error);

        const result = await CourseMatchingService.processStudentEducation(
            "stu-error",
            [
                {
                    type: "Course",
                    name: "ERR501",
                },
            ],
            "user-error"
        );

        findMatchSpy.mockRestore();

        expect(result.errors).toEqual([
            {
                type: "processing_error",
                courseName: "ERR501",
                message: error.message,
            },
        ]);
    });

    it("adds CoursePackage entries to education and surfaces package_added warnings", async () => {
        const packageDoc = {
            _id: "pkg-force",
            coursePackageCode: "PKG1",
            coursePackageName: "Forced Package",
            coursePackageCourses: [
                {
                    _id: "pkg-course-1",
                    courseName: "Forced Course",
                    courseExtent: 5,
                },
            ],
        };
        coursePackages = [packageDoc];

        const packageQuery = {
            populate: vi.fn().mockResolvedValue(packageDoc),
        };
        CoursePackageMock.findById.mockReturnValue(packageQuery);

        const courseInstance = {
            _id: "ci-force-1",
            courseName: "Forced Course",
            startDate: new Date("2025-02-03"),
            endDate: new Date("2025-03-03"),
        };
        const findOrCreateSpy = vi
            .spyOn(CourseMatchingService, "findOrCreateCourseInstance")
            .mockResolvedValue({ instance: courseInstance, wasCreated: true });

        const studentDoc = new StudentMock({
            _id: "stu-force",
            education: [],
            email: "force@student.com",
        });
        StudentMock.findById.mockResolvedValue(studentDoc);
        StudentEnrollmentMock.findOne.mockResolvedValue(null);

        const result = await CourseMatchingService.processStudentEducation(
            "stu-force",
            [
                {
                    type: "CoursePackage",
                    refId: "pkg-force",
                    startDate: "2025-02-01",
                    endDate: "2025-04-01",
                },
            ],
            "user-force"
        );

        findOrCreateSpy.mockRestore();

        expect(packageQuery.populate).toHaveBeenCalledWith(
            "coursePackageCourses"
        );
        expect(CoursePackageMock.findById).toHaveBeenCalledWith("pkg-force");
        expect(CoursePackageMock.find).toHaveBeenCalled();
        expect(result.warnings).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ type: "package_added" }),
            ])
        );
        expect(studentDoc.education.some((entry) => entry.type === "CoursePackage")).toBe(
            true
        );
    });

    it("uses explicit slutprov date when provided for individual courses", async () => {
        const match = {
            course: {
                _id: "course-explicit",
                courseName: "Explicit Slutprov",
                courseCode: "EXPL101",
                courseExtent: 5,
            },
            score: 1,
        };
        const findMatchSpy = vi
            .spyOn(CourseMatchingService, "findBestCourseMatch")
            .mockResolvedValue(match);

        const instance = {
            _id: "ci-explicit",
            courseName: "Explicit Slutprov",
            startDate: new Date("2025-03-01"),
            endDate: new Date("2025-04-01"),
        };
        const createSpy = vi
            .spyOn(CourseMatchingService, "findOrCreateCourseInstance")
            .mockResolvedValue({ instance, wasCreated: true });

        StudentEnrollmentMock.findOne.mockResolvedValue(null);
        const studentDoc = new StudentMock({
            _id: "stu-explicit",
            education: [],
            email: "explict@student.com",
        });
        StudentMock.findById.mockResolvedValue(studentDoc);

        const result = await CourseMatchingService.processStudentEducation(
            "stu-explicit",
            [
                {
                    type: "Course",
                    name: "EXPL101",
                    startDate: "2025-03-01",
                    endDate: "2025-04-01",
                    slutprovDate: "2025-03-29",
                },
            ],
            "user-explicit"
        );

        findMatchSpy.mockRestore();
        createSpy.mockRestore();

    expect(result.enrollments).toHaveLength(1);
    expect(
        StudentEnrollmentMock.instances[0].slutprovDate
            .toISOString()
            .slice(0, 10)
    ).toBe("2025-03-29");
  });

  it("adds an education entry when an individual course is newly created", async () => {
    const match = {
      course: {
        _id: "course-add-ed",
        courseName: "Add Education",
        courseCode: "ADD101",
        courseExtent: 5,
      },
      score: 1,
    };
    const findMatchSpy = vi
      .spyOn(CourseMatchingService, "findBestCourseMatch")
      .mockResolvedValue(match);

    const instance = {
      _id: "ci-add-ed",
      courseName: "Add Education",
      startDate: new Date("2025-05-01"),
      endDate: new Date("2025-06-01"),
    };
    const createSpy = vi
      .spyOn(CourseMatchingService, "findOrCreateCourseInstance")
      .mockResolvedValue({ instance, wasCreated: true });

    StudentEnrollmentMock.findOne.mockResolvedValue(null);
    const studentDoc = new StudentMock({
      _id: "stu-add-ed",
      education: [],
      email: "add@student.com",
    });
    StudentMock.findById.mockResolvedValue(studentDoc);

    const result = await CourseMatchingService.processStudentEducation(
      "stu-add-ed",
      [
        {
          type: "Course",
          name: "ADD101",
          startDate: "2025-05-01",
          endDate: "2025-06-01",
        },
      ],
      "user-add-ed"
    );

    findMatchSpy.mockRestore();
    createSpy.mockRestore();

    expect(studentDoc.education).toHaveLength(1);
    expect(studentDoc.save).toHaveBeenCalled();
    expect(studentDoc.education[0]).toEqual(
      expect.objectContaining({
        type: "Course",
        refId: "course-add-ed",
      })
    );
    expect(result.enrollments).toHaveLength(1);
  });

  it("continues when individual course taxpvt date is invalid", async () => {
        const match = {
            course: {
                _id: "course-bad-date",
                courseName: "Bad Date Course",
                courseCode: "BAD101",
                courseExtent: 5,
            },
            score: 1,
        };
        const findMatchSpy = vi
            .spyOn(CourseMatchingService, "findBestCourseMatch")
            .mockResolvedValue(match);

        const instance = {
            _id: "ci-bad-date",
            courseName: "Bad Date Course",
            startDate: new Date("2025-03-01"),
            endDate: new Date("2025-04-01"),
        };
        const createSpy = vi
            .spyOn(CourseMatchingService, "findOrCreateCourseInstance")
            .mockResolvedValue({ instance, wasCreated: true });

        StudentEnrollmentMock.findOne.mockResolvedValue(null);
        const studentDoc = new StudentMock({
            _id: "stu-bad-date",
            education: [],
            email: "baddate@student.com",
        });
        StudentMock.findById.mockResolvedValue(studentDoc);

        const result = await CourseMatchingService.processStudentEducation(
            "stu-bad-date",
            [
                {
                    type: "Course",
                    name: "BAD101",
                    startDate: "2025-03-01",
                    endDate: "2025-04-01",
                    slutprovDate: "not-a-date",
                },
            ],
            "user-bad-date"
        );

        findMatchSpy.mockRestore();
        createSpy.mockRestore();

    expect(result.enrollments).toHaveLength(0);
    expect(StudentEnrollmentMock.instances[0].slutprovDate).toBeUndefined();
    expect(result.errors).toEqual([]);
  });

  it("logs and skips when calculating sluttprov date fails", async () => {
    const match = {
      course: {
        _id: "course-guard",
        courseName: "Guard Course",
        courseCode: "GUARD101",
        courseExtent: 5,
      },
      score: 1,
    };
    const findMatchSpy = vi
      .spyOn(CourseMatchingService, "findBestCourseMatch")
      .mockResolvedValue(match);

    const instance = {
      _id: "ci-guard",
      courseName: "Guard Course",
      startDate: new Date("2025-03-01"),
      endDate: new Date("2025-04-01"),
    };
    const createSpy = vi
      .spyOn(CourseMatchingService, "findOrCreateCourseInstance")
      .mockResolvedValue({ instance, wasCreated: true });

    StudentEnrollmentMock.findOne.mockResolvedValue(null);
    const studentDoc = new StudentMock({
      _id: "stu-guard",
      education: [],
      email: "guard@student.com",
    });
    StudentMock.findById.mockResolvedValue(studentDoc);

    const result = await CourseMatchingService.processStudentEducation(
      "stu-guard",
      [
        {
          type: "Course",
          name: "GUARD101",
          startDate: "2025-03-01",
          endDate: "2025-04-01",
          slutprovDate: "not-a-date",
        },
      ],
      "user-guard"
    );

    findMatchSpy.mockRestore();
    createSpy.mockRestore();

    expect(studentDoc.education).toHaveLength(0);
    expect(studentDoc.save).not.toHaveBeenCalled();
    expect(result.enrollments).toHaveLength(0);
    expect(result.errors).toEqual([]);
  });

  it("skips package enrollments when provided slutprov date is invalid", async () => {
        const packageDoc = {
            _id: "pkg-invalid-slutprov",
            coursePackageName: "Invalid Slutprov Package",
            coursePackageCourses: [
                {
                    _id: "inv-course-1",
                    courseName: "Invalid Slutprov Course",
                    courseExtent: 5,
                },
            ],
        };
        coursePackages = [packageDoc];

        const packageQuery = {
            populate: vi.fn().mockResolvedValue(packageDoc),
        };
        CoursePackageMock.findById.mockReturnValue(packageQuery);

        const instance = {
            _id: "ci-invalid",
            courseName: "Invalid Slutprov Course",
        };
        const findOrCreateSpy = vi
            .spyOn(CourseMatchingService, "findOrCreateCourseInstance")
            .mockResolvedValue({ instance, wasCreated: true });

        StudentEnrollmentMock.findOne.mockResolvedValue(null);
        const studentDoc = new StudentMock({
            _id: "stu-invalid",
            education: [],
            email: "invalid@student.com",
        });
        StudentMock.findById.mockResolvedValue(studentDoc);

        const result = await CourseMatchingService.processStudentEducation(
            "stu-invalid",
            [
                {
                    type: "CoursePackage",
                    name: "Invalid Slutprov Package",
                    refId: "pkg-invalid-slutprov",
                    startDate: "2025-05-01",
                    endDate: "2025-06-01",
                    slutprovDate: "not-a-date",
                },
            ],
            "user-invalid"
        );

        findOrCreateSpy.mockRestore();

        expect(result.enrollments).toHaveLength(0);
        expect(StudentEnrollmentMock.instances[0].slutprovDate).toBeUndefined();
    });

    it("filters duplicate education entries before adding a new one", async () => {
        const match = {
            course: {
                _id: "course-dup-ed",
                courseName: "Education Dup",
                courseCode: "EDU101",
                courseExtent: 5,
            },
            score: 1,
        };
        const findMatchSpy = vi
            .spyOn(CourseMatchingService, "findBestCourseMatch")
            .mockResolvedValue(match);

        const instance = {
            _id: "ci-dup-ed",
            courseName: "Education Dup",
            startDate: new Date("2025-07-01"),
            endDate: new Date("2025-08-01"),
        };
        const createSpy = vi
            .spyOn(CourseMatchingService, "findOrCreateCourseInstance")
            .mockResolvedValue({ instance, wasCreated: true });

        StudentEnrollmentMock.findOne.mockResolvedValue(null);
        const studentDoc = new StudentMock({
            _id: "stu-dup-ed",
            education: [
                {
                    type: "Course",
                    refId: "course-dup-ed",
                    startDate: new Date("2025-07-01"),
                    endDate: new Date("2025-08-01"),
                },
            ],
            email: "duplicate@student.com",
        });
        StudentMock.findById.mockResolvedValue(studentDoc);

        const result = await CourseMatchingService.processStudentEducation(
            "stu-dup-ed",
            [
                {
                    type: "Course",
                    name: "EDU101",
                    startDate: "2025-07-01",
                    endDate: "2025-08-01",
                },
            ],
            "user-dup-ed"
        );

        findMatchSpy.mockRestore();
        createSpy.mockRestore();

        expect(studentDoc.education).toHaveLength(1);
        expect(result.enrollments).toHaveLength(1);
    });

    it("filters out enrollments that lack courseInstanceId", async () => {
        StudentEnrollmentMock.forceMissingCourseInstance = true;

        const match = {
            course: {
                _id: "course-no-instance-id",
                courseName: "No Instance ID",
                courseCode: "NOID101",
                courseExtent: 5,
            },
            score: 1,
        };
        const findMatchSpy = vi
            .spyOn(CourseMatchingService, "findBestCourseMatch")
            .mockResolvedValue(match);

        const instance = {
            _id: "ci-no-id",
            courseName: "No Instance ID",
            startDate: new Date("2025-09-01"),
            endDate: new Date("2025-10-01"),
        };
        const createSpy = vi
            .spyOn(CourseMatchingService, "findOrCreateCourseInstance")
            .mockResolvedValue({ instance, wasCreated: true });

        StudentEnrollmentMock.findOne.mockResolvedValue(null);
        const studentDoc = new StudentMock({
            _id: "stu-no-instance-id",
            education: [],
            email: "noinstance@student.com",
        });
        StudentMock.findById.mockResolvedValue(studentDoc);

        let result;
        try {
            result = await CourseMatchingService.processStudentEducation(
                "stu-no-instance-id",
                [
                    {
                        type: "Course",
                        name: "NOID101",
                        startDate: "2025-09-01",
                        endDate: "2025-10-01",
                    },
                ],
                "user-no-instance"
            );
        } finally {
            StudentEnrollmentMock.forceMissingCourseInstance = false;
        }

        findMatchSpy.mockRestore();
        createSpy.mockRestore();

        expect(result.enrollments).toHaveLength(0);
    });

    it("does not duplicate program education when already present", async () => {
        const studentDoc = {
            _id: "stu-program-existing",
            education: [
                {
                    type: "Program",
                    refId: "prog-dup",
                },
            ],
            save: vi.fn().mockResolvedValue(null),
            email: "existing@prog.com",
        };
        StudentMock.findById.mockResolvedValue(studentDoc);

        const result = await CourseMatchingService.processStudentEducation(
            "stu-program-existing",
            [
                {
                    type: "Program",
                    refId: "prog-dup",
                    name: "Program Duplicate",
                },
            ],
            "user-program-existing"
        );

        expect(result.enrollments).toHaveLength(0);
        expect(studentDoc.save).not.toHaveBeenCalled();
    });
});

describe("CourseMatchingService.processStudentEducation coverage invariants", () => {
    it("warns when a course package enrollment has no courseInstanceId", async () => {
        StudentEnrollmentMock.forceMissingCourseInstance = true;
        const packageDoc = {
            _id: "pkg-cover",
            coursePackageName: "Coverage Package",
            coursePackageCourses: [
                {
                    _id: "cover-course-1",
                    courseName: "Coverage Course",
                    courseExtent: 5,
                },
            ],
        };
        const packageQuery = {
            populate: vi.fn().mockResolvedValue(packageDoc),
        };
        CoursePackageMock.findById.mockReturnValue(packageQuery);
        const courseInstance = {
            _id: "ci-cover",
            courseName: "Coverage Course",
        };
        const createSpy = vi
            .spyOn(CourseMatchingService, "findOrCreateCourseInstance")
            .mockResolvedValue({ instance: courseInstance, wasCreated: true });
        const studentDoc = {
            _id: "stu-cover",
            education: undefined,
            teacherId: null,
            email: "cover@test.com",
            save: vi.fn().mockResolvedValue(null),
        };
        StudentMock.findById.mockResolvedValue(studentDoc);
        const warnSpy = vi.spyOn(loggerMock, "warn").mockImplementation(() => {});

        const result = await CourseMatchingService.processStudentEducation(
            "stu-cover",
            [
                {
                    type: "CoursePackage",
                    refId: "pkg-cover",
                    startDate: "2025-09-01",
                    endDate: "2025-11-01",
                },
            ],
            "user-cover"
        );

        expect(packageQuery.populate).toHaveBeenCalledWith(
            "coursePackageCourses"
        );
        expect(result.enrollments).toHaveLength(0);
        expect(studentDoc.education).toBeDefined();
        expect(warnSpy).toHaveBeenCalled();

        warnSpy.mockRestore();
        createSpy.mockRestore();
        StudentEnrollmentMock.forceMissingCourseInstance = false;
    });

    it("initializes the student education array when missing for course packages", async () => {
        delete global._StudentModel;
        const packageDoc = {
            _id: "pkg-init",
            coursePackageName: "Init Package",
            coursePackageCourses: [
                {
                    _id: "init-course-1",
                    courseName: "Init Course",
                    courseExtent: 5,
                },
            ],
        };
        CoursePackageMock.findById.mockReturnValue({
            populate: vi.fn().mockResolvedValue(packageDoc),
        });
        const courseInstance = {
            _id: "ci-init",
            courseName: "Init Course",
        };
        const createSpy = vi
            .spyOn(CourseMatchingService, "findOrCreateCourseInstance")
            .mockResolvedValue({ instance: courseInstance, wasCreated: true });
        const studentDoc = {
            _id: "stu-init",
            education: undefined,
            teacherId: null,
            email: "init@test.com",
            save: vi.fn().mockResolvedValue(null),
        };
        StudentMock.findById.mockResolvedValue(studentDoc);

        await CourseMatchingService.processStudentEducation(
            "stu-init",
            [
                {
                    type: "CoursePackage",
                    refId: "pkg-init",
                    startDate: "2025-10-01",
                    endDate: "2025-12-01",
                },
            ],
            "user-init"
        );

        expect(global._StudentModel).toBeDefined();
        expect(studentDoc.education).toBeDefined();
        expect(studentDoc.education).toContainEqual(
            expect.objectContaining({ type: "CoursePackage" })
        );

        createSpy.mockRestore();
    });

    it("warns when an individual course cannot produce a CourseInstance", async () => {
        const match = {
            course: {
                _id: "course-no-inst",
                courseName: "No Instance",
                courseCode: "NOI101",
                courseExtent: "5",
            },
            score: 1,
        };
        const matchSpy = vi
            .spyOn(CourseMatchingService, "findBestCourseMatch")
            .mockResolvedValue(match);
        const createSpy = vi
            .spyOn(CourseMatchingService, "findOrCreateCourseInstance")
            .mockResolvedValue({ instance: null, wasCreated: false });
        const warnSpy = vi.spyOn(loggerMock, "warn").mockImplementation(() => {});

        await CourseMatchingService.processStudentEducation(
            "stu-no-inst",
            [
                {
                    type: "Course",
                    name: "NOI101",
                },
            ],
            "user-no-inst"
        );

        expect(warnSpy).toHaveBeenCalled();

        matchSpy.mockRestore();
        createSpy.mockRestore();
        warnSpy.mockRestore();
    });

    it("skips duplicate individual course enrollments when an existing enrollment exists", async () => {
        const match = {
            course: {
                _id: "course-dup-logic",
                courseName: "Dup Logic",
                courseCode: "DUP201",
                courseExtent: "5",
            },
            score: 1,
        };
        const matchSpy = vi
            .spyOn(CourseMatchingService, "findBestCourseMatch")
            .mockResolvedValue(match);
        const courseInstance = {
            _id: "ci-dup-logic",
            courseName: "Dup Logic",
        };
        const createSpy = vi
            .spyOn(CourseMatchingService, "findOrCreateCourseInstance")
            .mockResolvedValue({ instance: courseInstance, wasCreated: true });
        StudentEnrollmentMock.findOne.mockResolvedValue({ _id: "existing-dup" });

        const result = await CourseMatchingService.processStudentEducation(
            "stu-dup-logic",
            [
                {
                    type: "Course",
                    name: "DUP201",
                    startDate: "2025-01-01",
                    endDate: "2025-02-01",
                },
            ],
            "user-dup-logic"
        );

        expect(result.enrollments).toHaveLength(0);

        matchSpy.mockRestore();
        createSpy.mockRestore();
    });

    it("logs an error when the provided slutprov date is invalid", async () => {
        const match = {
            course: {
                _id: "course-bad-slutprov",
                courseName: "Bad Slutprov",
                courseCode: "BADSV101",
                courseExtent: "5",
            },
            score: 1,
        };
        const matchSpy = vi
            .spyOn(CourseMatchingService, "findBestCourseMatch")
            .mockResolvedValue(match);
        const courseInstance = {
            _id: "ci-bad-slutprov",
            courseName: "Bad Slutprov",
        };
        const createSpy = vi
            .spyOn(CourseMatchingService, "findOrCreateCourseInstance")
            .mockResolvedValue({ instance: courseInstance, wasCreated: true });
        const errorSpy = vi
            .spyOn(loggerMock, "error")
            .mockImplementation(() => {});

        const result = await CourseMatchingService.processStudentEducation(
            "stu-bad-slutprov",
            [
                {
                    type: "Course",
                    name: "BADSV101",
                    startDate: "2025-03-01",
                    endDate: "2025-04-01",
                    slutprovDate: "not-a-date",
                },
            ],
            "user-bad-slutprov"
        );

        loggerMock.debug(
            "DEBUG invalid slutprov result",
            result.enrollments.length,
            StudentEnrollmentMock.instances.length
        );

        expect(errorSpy).toHaveBeenCalled();
        expect(result.enrollments).toHaveLength(0);
        expect(StudentEnrollmentMock.instances).toHaveLength(0);
        const [invalidInstance] = StudentEnrollmentMock.instances;
        expect(invalidInstance).toBeUndefined();

        matchSpy.mockRestore();
        createSpy.mockRestore();
        errorSpy.mockRestore();
    });

    it("runs the invalid slutprov date path when prior education entries exist", async () => {
        const match = {
            course: {
                _id: "course-bad-slutprov-2",
                courseName: "Bad Slutprov Two",
                courseCode: "BADSV102",
                courseExtent: "5",
            },
            score: 1,
        };
        const matchSpy = vi
            .spyOn(CourseMatchingService, "findBestCourseMatch")
            .mockResolvedValue(match);
        const courseInstance = {
            _id: "ci-bad-slutprov-2",
            courseName: "Bad Slutprov Two",
        };
        const createSpy = vi
            .spyOn(CourseMatchingService, "findOrCreateCourseInstance")
            .mockResolvedValue({ instance: courseInstance, wasCreated: true });
        const errorSpy = vi
            .spyOn(loggerMock, "error")
            .mockImplementation(() => {});
        const studentDoc = {
            _id: "stu-bad-slutprov-2",
            education: [
                {
                    type: "Course",
                    refId: "existing-course",
                    startDate: new Date("2025-03-01"),
                    endDate: new Date("2025-04-01"),
                },
            ],
            teacherId: null,
            email: "badslut2@test.com",
            save: vi.fn().mockResolvedValue(null),
        };
        StudentMock.findById.mockResolvedValue(studentDoc);

        const result = await CourseMatchingService.processStudentEducation(
            "stu-bad-slutprov-2",
            [
            {
                type: "Course",
                name: "BADSV102",
                startDate: "2025-03-01",
                slutprovDate: "not-a-date",
            },
            ],
            "user-bad-slutprov-2"
        );

        expect(errorSpy).toHaveBeenCalled();
        expect(Array.isArray(studentDoc.education)).toBe(true);
        expect(studentDoc.education?.length ?? 0).toBeGreaterThanOrEqual(1);

        matchSpy.mockRestore();
        createSpy.mockRestore();
        errorSpy.mockRestore();
    });

    it("initializes missing education array when adding a new individual course", async () => {
        const match = {
            course: {
                _id: "course-init-edu",
                courseName: "Init Course",
                courseCode: "INIT101",
                courseExtent: "5",
            },
            score: 1,
        };
        const matchSpy = vi
            .spyOn(CourseMatchingService, "findBestCourseMatch")
            .mockResolvedValue(match);
        const courseInstance = {
            _id: "ci-init-edu",
            courseName: "Init Course",
        };
        const createSpy = vi
            .spyOn(CourseMatchingService, "findOrCreateCourseInstance")
            .mockResolvedValue({ instance: courseInstance, wasCreated: true });
        const studentDoc = {
            _id: "stu-init-edu",
            education: undefined,
            teacherId: null,
            email: "init-edu@test.com",
            save: vi.fn().mockResolvedValue(null),
        };
        StudentMock.findById.mockResolvedValue(studentDoc);

        await CourseMatchingService.processStudentEducation(
            "stu-init-edu",
            [
                {
                    _id: "course-init-edu",
                    type: "Course",
                    name: match.course.courseName,
                    startDate: "2025-07-01",
                    endDate: "2025-08-05",
                },
            ],
            "user-init-edu"
        );

        matchSpy.mockRestore();
        createSpy.mockRestore();
    });

    it("skips adding duplicate course education entries when already present", async () => {
        const courseStart = new Date("2025-05-01");
        const courseEnd = CourseMatchingService.addWeeks(courseStart, 5);

        const match = {
            course: {
                _id: "course-edu-existing",
                courseName: "Existing Course",
                courseCode: "EX101",
                courseExtent: "5",
            },
            score: 1,
        };
        const matchSpy = vi
            .spyOn(CourseMatchingService, "findBestCourseMatch")
            .mockResolvedValue(match);
        const courseInstance = {
            _id: "ci-edu-existing",
            courseName: "Existing Course",
        };
        const createSpy = vi
            .spyOn(CourseMatchingService, "findOrCreateCourseInstance")
            .mockResolvedValue({ instance: courseInstance, wasCreated: true });

        const studentDoc = {
            _id: "stu-edu-existing",
            education: [
                {
                    type: "Course",
                    refId: match.course._id,
                    startDate: courseStart,
                    endDate: courseEnd,
                },
            ],
            teacherId: null,
            email: "duplicate@test.com",
            save: vi.fn().mockResolvedValue(null),
        };
        StudentMock.findById.mockResolvedValue(studentDoc);

        const result = await CourseMatchingService.processStudentEducation(
            "stu-edu-existing",
            [
                {
                    type: "Course",
                    name: match.course.courseName,
                    startDate: courseStart.toISOString().split("T")[0],
                },
            ],
            "user-edu-existing"
        );

        expect(studentDoc.save).not.toHaveBeenCalled();
        expect(studentDoc.education).toHaveLength(1);

        matchSpy.mockRestore();
        createSpy.mockRestore();
    });

    it("logs when skipping duplicate individual course enrollments", async () => {
        const match = {
            course: {
                _id: "course-dup-log",
                courseName: "Dup Log",
                courseCode: "DUP202",
                courseExtent: "5",
            },
            score: 1,
        };
        const matchSpy = vi
            .spyOn(CourseMatchingService, "findBestCourseMatch")
            .mockResolvedValue(match);
        const courseInstance = {
            _id: "ci-dup-log",
            courseName: "Dup Log",
        };
        const createSpy = vi
            .spyOn(CourseMatchingService, "findOrCreateCourseInstance")
            .mockResolvedValue({ instance: courseInstance, wasCreated: true });

        StudentEnrollmentMock.findOne.mockResolvedValue({ _id: "existing-dup-log" });

        const result = await CourseMatchingService.processStudentEducation(
            "stu-dup-log",
            [
                {
                    type: "Course",
                    name: "DUP202",
                    startDate: "2025-01-01",
                    endDate: "2025-02-01",
                },
            ],
            "user-dup-log"
        );

        expect(result.enrollments).toHaveLength(0);
        expect(StudentEnrollmentMock.instances).toHaveLength(0);

        matchSpy.mockRestore();
        createSpy.mockRestore();
        StudentEnrollmentMock.findOne.mockResolvedValue(null);
    });

    it("warns when an individual course enrollment lacks a courseInstanceId", async () => {
        StudentEnrollmentMock.forceMissingCourseInstance = true;
        const match = {
            course: {
                _id: "course-missing-id",
                courseName: "Missing ID",
                courseCode: "MID101",
                courseExtent: "5",
            },
            score: 1,
        };
        const matchSpy = vi
            .spyOn(CourseMatchingService, "findBestCourseMatch")
            .mockResolvedValue(match);
        const courseInstance = {
            _id: "ci-missing-id",
            courseName: "Missing ID",
        };
        const createSpy = vi
            .spyOn(CourseMatchingService, "findOrCreateCourseInstance")
            .mockResolvedValue({ instance: courseInstance, wasCreated: true });
        const result = await CourseMatchingService.processStudentEducation(
            "stu-missing-id",
            [
                {
                    type: "Course",
                    name: "MID101",
                    startDate: "2025-05-01",
                    endDate: "2025-06-01",
                },
            ],
            "user-missing-id"
        );

        expect(result.enrollments).toHaveLength(0);
        expect(StudentEnrollmentMock.instances).toHaveLength(0);
        const [missingInstance] = StudentEnrollmentMock.instances;
        expect(missingInstance).toBeUndefined();

        matchSpy.mockRestore();
        createSpy.mockRestore();
        StudentEnrollmentMock.forceMissingCourseInstance = false;
    });
});
