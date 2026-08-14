import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
    class StudentEnrollmentMock {
        constructor(data = {}) {
            Object.assign(this, data);
            this._id = data._id || `enr-${Math.random().toString(16).slice(2)}`;
            this.save = vi.fn().mockResolvedValue(this);
            this.changeStatus = vi.fn().mockResolvedValue(undefined);
        }

        static find = vi.fn();
        static findById = vi.fn();
        static findOne = vi.fn();
        static countDocuments = vi.fn();
        static findByIdAndDelete = vi.fn();
    }

    return {
        courseMatchingServiceMock: {
            updateCourseInstanceStats: vi.fn(),
            findOrCreateCourseInstance: vi.fn(),
        },
        StudentEnrollmentMock,
        StudentMock: {
            findById: vi.fn(),
        },
        CourseInstanceMock: {
            findById: vi.fn(),
            findByIdAndDelete: vi.fn(),
        },
        CourseMock: {
            findById: vi.fn(),
        },
        UserMock: {
            find: vi.fn(),
        },
        AssignmentSubmissionMock: {
            find: vi.fn(),
        },
    };
});

const {
    courseMatchingServiceMock,
    StudentEnrollmentMock,
    StudentMock,
    CourseInstanceMock,
    CourseMock,
    UserMock,
    AssignmentSubmissionMock,
} = mocks;

vi.mock("../../src/utils/courseMatchingService.js", () => ({
    __esModule: true,
    default: mocks.courseMatchingServiceMock,
}));
vi.mock("../../src/models/StudentEnrollment.js", () => ({
    __esModule: true,
    default: mocks.StudentEnrollmentMock,
}));
vi.mock("../../src/models/Student.js", () => ({
    __esModule: true,
    default: mocks.StudentMock,
}));
vi.mock("../../src/models/CourseInstance.js", () => ({
    __esModule: true,
    default: mocks.CourseInstanceMock,
}));
vi.mock("../../src/models/Course.js", () => ({
    __esModule: true,
    default: mocks.CourseMock,
}));
vi.mock("../../src/models/User.js", () => ({
    __esModule: true,
    default: mocks.UserMock,
}));
vi.mock("../../src/models/AssignmentSubmission.js", () => ({
    __esModule: true,
    default: mocks.AssignmentSubmissionMock,
}));

import {
    addStudentsToInstance,
    buildCourseCards,
    deleteEnrollmentAndShift,
    fetchCourseInstanceEnrollments,
    fetchStudentEnrollments,
    updateEnrollmentDates,
    updateEnrollmentStatus,
    updateStudyplanTempo,
} from "../../src/services/enrollmentService.js";

const createFindChain = ({ result, resolveOn = "sort" }) => {
    const chain = {
        populate: vi.fn(() => chain),
        sort: vi.fn(() => (resolveOn === "sort" ? Promise.resolve(result) : chain)),
        select: vi.fn(() => (resolveOn === "select" ? Promise.resolve(result) : chain)),
        lean: vi.fn(() => (resolveOn === "lean" ? Promise.resolve(result) : chain)),
    };
    return chain;
};

beforeEach(() => {
    vi.clearAllMocks();
    StudentEnrollmentMock.find.mockReturnValue(createFindChain({ result: [] }));
    StudentEnrollmentMock.findById.mockResolvedValue(null);
    StudentEnrollmentMock.findOne.mockResolvedValue(null);
    StudentEnrollmentMock.countDocuments.mockResolvedValue(0);
    StudentEnrollmentMock.findByIdAndDelete.mockResolvedValue(null);
    StudentMock.findById.mockResolvedValue(null);
    CourseInstanceMock.findById.mockResolvedValue(null);
    CourseInstanceMock.findByIdAndDelete.mockResolvedValue(null);
    CourseMock.findById.mockResolvedValue(null);
    UserMock.find.mockReturnValue({
        select: vi.fn().mockReturnThis(),
        lean: vi.fn().mockResolvedValue([]),
    });
    AssignmentSubmissionMock.find.mockResolvedValue([]);
    courseMatchingServiceMock.updateCourseInstanceStats.mockResolvedValue(undefined);
    courseMatchingServiceMock.findOrCreateCourseInstance.mockResolvedValue({
        instance: { _id: "new-instance" },
    });
});

describe("fetchStudentEnrollments", () => {
    it("builds a query with the status filter", async () => {
        StudentEnrollmentMock.find.mockReturnValue(
            createFindChain({ result: [{ _id: "e1" }] })
        );

        const enrollments = await fetchStudentEnrollments({
            studentId: "stu1",
            status: "enrolled",
        });

        expect(StudentEnrollmentMock.find).toHaveBeenCalledWith({
            studentId: "stu1",
            status: "enrolled",
        });
        expect(enrollments).toEqual([{ _id: "e1" }]);
    });

    it("applies date-range filters as a $and clause", async () => {
        const chain = createFindChain({ result: [] });
        StudentEnrollmentMock.find.mockReturnValue(chain);

        await fetchStudentEnrollments({
            studentId: "stu1",
            startDate: "2025-01-01",
            endDate: "2025-02-01",
        });

        const query = StudentEnrollmentMock.find.mock.calls[0][0];
        expect(query.studentId).toBe("stu1");
        expect(query.$and).toEqual([
            { startDate: { $gte: expect.any(Date) } },
            { endDate: { $lte: expect.any(Date) } },
        ]);
    });

    it("does not add a $and clause when no date filters are given", async () => {
        await fetchStudentEnrollments({ studentId: "stu1" });

        expect(StudentEnrollmentMock.find).toHaveBeenCalledWith({ studentId: "stu1" });
    });
});

describe("buildCourseCards", () => {
    const INSTANCE_1 = "111111111111111111111111";
    const STUDENT_1 = "000000000000000000000001";

    it("aggregates enrollments per course instance and attaches shared students", async () => {
        const instance = {
            _id: INSTANCE_1,
            courseName: "Svenska 1",
            courseCode: "SVEENG01",
            coursePoints: "100",
            courseExtent: "5",
            startDate: new Date("2026-01-05"),
            endDate: new Date("2026-02-09"),
            responsibleTeacher: { _id: "t1", name: "Mirsada", email: "mirsada@mindful.se" },
            mainCourseId: { _id: "c1", courseName: "Svenska 1", courseCode: "SVEENG01" },
            modules: [],
        };
        const ownEnrollments = [
            {
                _id: "enrA",
                courseInstanceId: instance,
                mainCourseId: { _id: "c1", courseName: "Svenska 1", courseCode: "SVEENG01" },
                startDate: instance.startDate,
                endDate: instance.endDate,
                status: "active",
            },
        ];
        const sharedEnrollments = [
            {
                courseInstanceId: INSTANCE_1,
                studentId: { _id: STUDENT_1, name: "Anna Andersson", email: "a@mindful.se" },
            },
            {
                courseInstanceId: INSTANCE_1,
                studentId: { _id: "000000000000000000000002", name: "Berta Berg", email: "b@mindful.se" },
            },
        ];
        StudentEnrollmentMock.find
            .mockReturnValueOnce(createFindChain({ result: ownEnrollments }))
            .mockReturnValueOnce(createFindChain({ result: sharedEnrollments, resolveOn: "select" }));

        const cards = await buildCourseCards(STUDENT_1);

        expect(cards).toHaveLength(1);
        expect(cards[0].courseName).toBe("Svenska 1");
        expect(cards[0].weeks).toBe(5);
        expect(cards[0].responsibleTeacher).toBe("Mirsada");
        expect(cards[0].students.map((s) => s.name)).toEqual(["Anna Andersson", "Berta Berg"]);
        expect(StudentEnrollmentMock.find).toHaveBeenNthCalledWith(1, { studentId: STUDENT_1 });
        expect(StudentEnrollmentMock.find).toHaveBeenNthCalledWith(2, {
            courseInstanceId: { $in: [INSTANCE_1] },
        });
    });

    it("computes progress from accepted submissions for assignment modules", async () => {
        const validEnrollmentId = "999999999999999999999999";
        const instance = {
            _id: INSTANCE_1,
            courseName: "Svenska 1",
            courseCode: "SVEENG01",
            coursePoints: "100",
            courseExtent: "5",
            startDate: new Date("2026-01-05"),
            endDate: new Date("2026-02-09"),
            mainCourseId: { _id: "c1", courseName: "Svenska 1", courseCode: "SVEENG01" },
            modules: [
                { moduleNumber: 1, title: "M1", assignment: { title: "Inlämning" } },
                { moduleNumber: 2, title: "M2", assignment: { title: "Inlämning 2" } },
            ],
        };
        const ownEnrollments = [
            {
                _id: validEnrollmentId,
                courseInstanceId: instance,
                mainCourseId: { _id: "c1", courseName: "Svenska 1", courseCode: "SVEENG01" },
                startDate: instance.startDate,
                endDate: instance.endDate,
                status: "active",
            },
        ];
        StudentEnrollmentMock.find
            .mockReturnValueOnce(createFindChain({ result: ownEnrollments }))
            .mockReturnValueOnce(createFindChain({ result: [], resolveOn: "select" }));
        AssignmentSubmissionMock.find.mockResolvedValue([
            { moduleNumber: 1, enrollmentId: validEnrollmentId, feedback: { status: "godkänd" } },
            { moduleNumber: 2, enrollmentId: validEnrollmentId, feedback: { status: "" } },
        ]);

        const cards = await buildCourseCards(STUDENT_1);

        expect(cards).toHaveLength(1);
        expect(cards[0].progress).toEqual({ completed: 1, total: 2, percent: 50 });
        expect(AssignmentSubmissionMock.find).toHaveBeenCalledWith({
            enrollmentId: { $in: [validEnrollmentId] },
        });
    });

    it("reports null progress for cards without assignment modules", async () => {
        const instance = {
            _id: INSTANCE_1,
            courseName: "Svenska 1",
            courseCode: "SVEENG01",
            coursePoints: "100",
            courseExtent: "5",
            startDate: new Date("2026-01-05"),
            endDate: new Date("2026-02-09"),
            mainCourseId: { _id: "c1", courseName: "Svenska 1", courseCode: "SVEENG01" },
            modules: [{ moduleNumber: 1, title: "M1" }],
        };
        const ownEnrollments = [
            {
                _id: "enrA",
                courseInstanceId: instance,
                mainCourseId: { _id: "c1", courseName: "Svenska 1", courseCode: "SVEENG01" },
                startDate: instance.startDate,
                endDate: instance.endDate,
                status: "active",
            },
        ];
        StudentEnrollmentMock.find
            .mockReturnValueOnce(createFindChain({ result: ownEnrollments }))
            .mockReturnValueOnce(createFindChain({ result: [], resolveOn: "select" }));

        const cards = await buildCourseCards(STUDENT_1);

        expect(cards[0].progress).toBeNull();
        expect(AssignmentSubmissionMock.find).not.toHaveBeenCalled();
    });
});

describe("fetchCourseInstanceEnrollments", () => {
    it("queries enrollments for an instance and attaches lastLoginAt", async () => {
        const lastLoginDate = new Date("2026-07-01T12:00:00.000Z");
        const enrollments = [
            { _id: "e1", studentId: { _id: "s1", email: "s1@example.com" } },
            { _id: "e2", studentId: { _id: "s2", email: "s2@example.com" } },
        ];
        StudentEnrollmentMock.find.mockReturnValue(
            createFindChain({ result: enrollments, resolveOn: "lean" })
        );
        UserMock.find.mockReturnValue({
            select: vi.fn().mockReturnThis(),
            lean: vi.fn().mockResolvedValue([
                { email: "s1@example.com", lastLoginAt: lastLoginDate },
            ]),
        });

        const result = await fetchCourseInstanceEnrollments({
            instanceId: "inst1",
            status: "enrolled",
        });

        expect(StudentEnrollmentMock.find).toHaveBeenCalledWith({
            courseInstanceId: "inst1",
            status: "enrolled",
        });
        expect(UserMock.find).toHaveBeenCalledWith({
            email: { $in: ["s1@example.com", "s2@example.com"] },
        });
        expect(result[0].lastLoginAt).toEqual(lastLoginDate);
        expect(result[1].lastLoginAt).toBeNull();
    });

    it("keeps the lastLoginAt lookup failure non-fatal", async () => {
        const enrollments = [
            { _id: "e1", studentId: { _id: "s1", email: "s1@example.com" } },
        ];
        StudentEnrollmentMock.find.mockReturnValue(createFindChain({ result: enrollments, resolveOn: "lean" }));
        UserMock.find.mockReturnValue({
            select: vi.fn().mockReturnThis(),
            lean: vi.fn().mockRejectedValue(new Error("db down")),
        });

        const result = await fetchCourseInstanceEnrollments({ instanceId: "inst1" });

        expect(result).toEqual(enrollments);
    });
});

describe("updateEnrollmentStatus", () => {
    it("changes status, refreshes stats, and returns the reloaded enrollment", async () => {
        const enrollmentDoc = {
            _id: "enroll-1",
            courseInstanceId: "ci-1",
            changeStatus: vi.fn().mockResolvedValue(undefined),
        };
        const populatedEnrollment = {
            _id: "enroll-1",
            courseInstanceId: "ci-1",
            status: "completed",
        };
        StudentEnrollmentMock.findById
            .mockResolvedValueOnce(enrollmentDoc)
            .mockReturnValueOnce({
                populate: vi.fn().mockReturnThis(),
                then: (resolve) => resolve(populatedEnrollment),
            });

        const result = await updateEnrollmentStatus({
            enrollmentId: "enroll-1",
            status: "completed",
            reason: "done",
            notes: "ok",
            userId: "user1",
        });

        expect(enrollmentDoc.changeStatus).toHaveBeenCalledWith("completed", "done", "ok", "user1");
        expect(courseMatchingServiceMock.updateCourseInstanceStats).toHaveBeenCalledWith("ci-1");
        expect(result).toEqual(populatedEnrollment);
    });

    it("keeps course instance stats failures non-fatal", async () => {
        const enrollmentDoc = {
            _id: "enroll-1",
            courseInstanceId: "ci-1",
            changeStatus: vi.fn().mockResolvedValue(undefined),
        };
        const populatedEnrollment = { _id: "enroll-1", status: "completed" };
        StudentEnrollmentMock.findById
            .mockResolvedValueOnce(enrollmentDoc)
            .mockReturnValueOnce({
                populate: vi.fn().mockReturnThis(),
                then: (resolve) => resolve(populatedEnrollment),
            });
        courseMatchingServiceMock.updateCourseInstanceStats.mockRejectedValue(new Error("boom"));

        const result = await updateEnrollmentStatus({
            enrollmentId: "enroll-1",
            status: "completed",
            userId: "user1",
        });

        expect(result).toEqual(populatedEnrollment);
    });

    it("throws a 404 AppError when the enrollment is missing", async () => {
        StudentEnrollmentMock.findById.mockResolvedValue(null);

        await expect(
            updateEnrollmentStatus({ enrollmentId: "missing", status: "active" })
        ).rejects.toMatchObject({ statusCode: 404, message: "Enrollment not found" });
    });

    it("throws a 400 AppError with valid statuses for unknown statuses", async () => {
        const enrollmentDoc = { changeStatus: vi.fn() };
        StudentEnrollmentMock.findById.mockResolvedValue(enrollmentDoc);

        await expect(
            updateEnrollmentStatus({ enrollmentId: "enroll-1", status: "bogus" })
        ).rejects.toMatchObject({
            statusCode: 400,
            message: "Invalid status",
            validStatuses: expect.arrayContaining(["active", "completed", "dropped"]),
        });
        expect(enrollmentDoc.changeStatus).not.toHaveBeenCalled();
    });
});

describe("updateEnrollmentDates", () => {
    it("updates provided dates and saves", async () => {
        const save = vi.fn().mockResolvedValue(undefined);
        const enrollmentDoc = { startDate: new Date(), endDate: new Date(), save };
        StudentEnrollmentMock.findById.mockResolvedValue(enrollmentDoc);

        const result = await updateEnrollmentDates({
            enrollmentId: "enroll-2",
            startDate: "2025-01-01",
            endDate: "2025-02-01",
        });

        expect(result.startDate).toEqual(new Date("2025-01-01"));
        expect(result.endDate).toEqual(new Date("2025-02-01"));
        expect(save).toHaveBeenCalledTimes(1);
    });

    it("throws a 404 AppError when the enrollment is missing", async () => {
        StudentEnrollmentMock.findById.mockResolvedValue(null);

        await expect(
            updateEnrollmentDates({ enrollmentId: "absent" })
        ).rejects.toMatchObject({ statusCode: 404, message: "Enrollment not found" });
    });
});

describe("deleteEnrollmentAndShift", () => {
    it("deletes the target enrollment and shifts remaining dates", async () => {
        const enrollment1 = {
            _id: "e1",
            mainCourseId: "c1",
            courseInstanceId: "ci1",
            startDate: new Date("2026-01-05"),
            endDate: new Date("2026-02-09"),
            teacherId: "t1",
        };
        const enrollment2 = {
            _id: "e2",
            mainCourseId: "c2",
            courseInstanceId: "ci2",
            startDate: new Date("2026-03-02"),
            endDate: new Date("2026-05-11"),
            teacherId: "t1",
        };
        StudentMock.findById.mockReturnValue({
            select: vi.fn().mockResolvedValue({ teacherId: "t1", name: "Anna" }),
        });
        StudentEnrollmentMock.find.mockReturnValue({
            sort: vi.fn().mockResolvedValue([enrollment1, enrollment2]),
        });
        StudentEnrollmentMock.findByIdAndDelete.mockResolvedValue(null);
        StudentEnrollmentMock.countDocuments.mockResolvedValue(0);
        courseMatchingServiceMock.findOrCreateCourseInstance.mockResolvedValue({
            instance: { _id: "new-ci" },
        });
        const saveEnrollment2 = vi.fn().mockResolvedValue(undefined);
        enrollment2.save = saveEnrollment2;

        const result = await deleteEnrollmentAndShift({
            studentId: "stu1",
            enrollmentId: "e1",
            userId: "user1",
        });

        expect(StudentEnrollmentMock.findByIdAndDelete).toHaveBeenCalledWith("e1");
        expect(StudentEnrollmentMock.countDocuments).toHaveBeenCalledWith({
            courseInstanceId: "ci1",
        });
        expect(CourseInstanceMock.findByIdAndDelete).toHaveBeenCalledWith("ci1");
        expect(courseMatchingServiceMock.findOrCreateCourseInstance).toHaveBeenCalledWith(
            "c2",
            new Date("2026-01-05"),
            new Date("2026-02-09"),
            "user1",
            "t1"
        );
        expect(enrollment2.startDate).toEqual(new Date("2026-01-05"));
        expect(enrollment2.courseInstanceId).toBe("new-ci");
        expect(saveEnrollment2).toHaveBeenCalledTimes(1);
        expect(result).toEqual({ deletedEnrollmentId: "e1", updatedEnrollmentsCount: 1 });
    });

    it("throws a 404 AppError when the student is missing", async () => {
        StudentMock.findById.mockReturnValue({ select: vi.fn().mockResolvedValue(null) });

        await expect(
            deleteEnrollmentAndShift({ studentId: "stu1", enrollmentId: "e1" })
        ).rejects.toMatchObject({ statusCode: 404, message: "Student not found" });
    });

    it("throws a 404 AppError when the enrollment is not part of the study plan", async () => {
        StudentMock.findById.mockReturnValue({
            select: vi.fn().mockResolvedValue({ teacherId: "t1", name: "Anna" }),
        });
        StudentEnrollmentMock.find.mockReturnValue({
            sort: vi.fn().mockResolvedValue([{ _id: "e1", mainCourseId: "c1" }]),
        });

        await expect(
            deleteEnrollmentAndShift({ studentId: "stu1", enrollmentId: "missing" })
        ).rejects.toMatchObject({
            statusCode: 404,
            message: "Enrollment not found for student",
        });
    });
});

describe("updateStudyplanTempo", () => {
    it("throws a 400 AppError for invalid tempos", async () => {
        await expect(
            updateStudyplanTempo({ studentId: "stu1", tempoWeeks: 7 })
        ).rejects.toMatchObject({ statusCode: 400, message: "Invalid tempoWeeks" });
    });

    it("throws a 404 AppError when the student is missing", async () => {
        StudentMock.findById.mockReturnValue({ select: vi.fn().mockResolvedValue(null) });

        await expect(
            updateStudyplanTempo({ studentId: "stu1", tempoWeeks: 5 })
        ).rejects.toMatchObject({ statusCode: 404, message: "Student not found" });
    });

    it("returns 0 when there are no future enrollments", async () => {
        StudentMock.findById.mockReturnValue({
            select: vi.fn().mockResolvedValue({ teacherId: "t1", name: "Anna" }),
        });
        StudentEnrollmentMock.find.mockReturnValue({
            sort: vi.fn().mockResolvedValue([
                { _id: "e1", mainCourseId: "c1", startDate: new Date("2020-01-01") },
            ]),
        });

        const result = await updateStudyplanTempo({ studentId: "stu1", tempoWeeks: 5 });

        expect(result).toEqual({ updatedCount: 0 });
    });

    it("re-creates future enrollments at the new tempo", async () => {
        StudentMock.findById.mockReturnValue({
            select: vi.fn().mockResolvedValue({ teacherId: "t1", name: "Anna" }),
        });
        StudentEnrollmentMock.find.mockReturnValue({
            sort: vi.fn().mockResolvedValue([
                {
                    _id: "e1",
                    mainCourseId: "c1",
                    courseInstanceId: "ci1",
                    startDate: new Date("2030-09-01"),
                    status: "enrolled",
                },
            ]),
        });
        courseMatchingServiceMock.findOrCreateCourseInstance.mockResolvedValue({
            instance: { _id: "new-ci" },
        });

        const result = await updateStudyplanTempo({
            studentId: "stu1",
            tempoWeeks: 5,
            userId: "user1",
        });

        expect(courseMatchingServiceMock.findOrCreateCourseInstance).toHaveBeenCalledWith(
            "c1",
            expect.any(Date),
            expect.any(Date),
            "user1",
            "t1"
        );
        expect(StudentEnrollmentMock.findByIdAndDelete).toHaveBeenCalledWith("e1");
        expect(StudentEnrollmentMock.countDocuments).toHaveBeenCalledWith({
            courseInstanceId: "ci1",
        });
        expect(CourseInstanceMock.findByIdAndDelete).toHaveBeenCalledWith("ci1");
        expect(result).toEqual({ updatedCount: 1 });
    });
});

describe("addStudentsToInstance", () => {
    const instance = {
        _id: "inst1",
        mainCourseId: "c1",
        courseName: "Svenska 1",
        startDate: new Date("2026-01-05"),
        endDate: new Date("2026-02-09"),
        responsibleTeacher: "t1",
        slutprovDate: null,
    };

    it("throws a 400 AppError when studentIds is missing or empty", async () => {
        await expect(
            addStudentsToInstance({ instanceId: "inst1" })
        ).rejects.toMatchObject({ statusCode: 400, message: "Student IDs array is required" });
        await expect(
            addStudentsToInstance({ instanceId: "inst1", studentIds: [] })
        ).rejects.toMatchObject({ statusCode: 400, message: "Student IDs array is required" });
    });

    it("throws a 404 AppError when the instance is missing", async () => {
        CourseInstanceMock.findById.mockResolvedValue(null);

        await expect(
            addStudentsToInstance({ instanceId: "inst1", studentIds: ["s1"] })
        ).rejects.toMatchObject({ statusCode: 404, message: "Course instance not found" });
    });

    it("throws a 404 AppError when the main course is missing", async () => {
        CourseInstanceMock.findById.mockResolvedValue(instance);
        CourseMock.findById.mockResolvedValue(null);

        await expect(
            addStudentsToInstance({ instanceId: "inst1", studentIds: ["s1"] })
        ).rejects.toMatchObject({ statusCode: 404, message: "Main course not found" });
    });

    it("creates enrollments and skips duplicates", async () => {
        CourseInstanceMock.findById.mockResolvedValue(instance);
        CourseMock.findById.mockResolvedValue({ _id: "c1", courseName: "Svenska 1" });
        StudentMock.findById.mockResolvedValue({ _id: "s1", name: "Anna", teacherId: "t1" });
        StudentEnrollmentMock.findOne.mockResolvedValue({ _id: "existing" });

        const result = await addStudentsToInstance({
            instanceId: "inst1",
            studentIds: ["s1"],
        });

        expect(StudentEnrollmentMock.findOne).toHaveBeenCalledWith({
            studentId: "s1",
            courseInstanceId: "inst1",
        });
        expect(StudentMock.findById).not.toHaveBeenCalled();
        expect(result.enrollments).toHaveLength(0);
        expect(result.errors).toHaveLength(0);
    });

    it("collects per-student errors without aborting the batch", async () => {
        CourseInstanceMock.findById.mockResolvedValue(instance);
        CourseMock.findById.mockResolvedValue({ _id: "c1", courseName: "Svenska 1" });
        StudentMock.findById.mockResolvedValueOnce(null).mockResolvedValueOnce({
            _id: "s2",
            name: "Berta",
            teacherId: "t2",
        });

        const result = await addStudentsToInstance({
            instanceId: "inst1",
            studentIds: ["s1", "s2"],
        });

        expect(result.errors).toEqual(["Student s1 not found"]);
        expect(result.enrollments).toHaveLength(1);
        expect(result.enrollments[0].studentId).toBe("s2");
        expect(result.enrollments[0].courseInstanceId).toBe("inst1");
        expect(result.enrollments[0].status).toBe("enrolled");
        expect(result.enrollments[0].teacherId).toBe("t2");
    });
});
