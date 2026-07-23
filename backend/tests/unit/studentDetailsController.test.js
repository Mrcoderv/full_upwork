import {
    describe,
    it,
    expect,
    beforeAll,
    afterAll,
    beforeEach,
    afterEach,
    vi,
} from "vitest";
import mongoose from "mongoose";
import Student from "../../src/models/Student.js";
import Course from "../../src/models/Course.js";
import CoursePackage from "../../src/models/CoursePackage.js";
import Program from "../../src/models/Program.js";
import StudentEnrollment from "../../src/models/StudentEnrollment.js";
import CourseInstance from "../../src/models/CourseInstance.js";
import {
    getStudentDetails,
    updateStudentInfo,
    addComment,
    editComment,
    deleteComment,
    markCommentSeen,
    getChangeHistory,
} from "../../src/controllers/studentDetailsController.js";
import {
    connectTestDatabase,
    disconnectTestDatabase,
} from "../helpers/mongoTest.js";

vi.mock("../../src/utils/logger.js", () => ({
    default: {
        error: vi.fn(),
        warn: vi.fn(),
        info: vi.fn(),
        debug: vi.fn(),
    },
}));

import logger from "../../src/utils/logger.js";

const buildRes = () => {
    const res = {
        statusCode: 200,
        body: undefined,
        status(code) {
            this.statusCode = code;
            return this;
        },
        json(payload) {
            this.body = payload;
            return this;
        },
    };
    return res;
};

const buildReq = ({ params = {}, body = {}, user = {} } = {}) => ({
    params,
    body,
    user,
});

const createStudent = async (overrides = {}) => {
    const id = new mongoose.Types.ObjectId().toString();
    return Student.create({
        name: overrides.name || "Student",
        personalNumber: overrides.personalNumber || "19900101-1234",
        email: overrides.email || `student_${id}@example.com`,
        phone: overrides.phone,
        exam: overrides.exam,
        commentHistory: overrides.commentHistory ?? [],
        changeHistory: overrides.changeHistory,
        aplStatus: overrides.aplStatus,
        aplStatusHistory: overrides.aplStatusHistory,
        dropout: overrides.dropout,
        startDate: overrides.startDate,
        endDate: overrides.endDate,
        finalExamDate: overrides.finalExamDate,
        examMunicipality: overrides.examMunicipality,
        examLocation: overrides.examLocation,
        examTime: overrides.examTime,
        municipality: overrides.municipality,
    });
};

describe("studentDetailsController", () => {
    beforeAll(async () => {
        await connectTestDatabase();
    }, 60000);

    afterAll(async () => {
        await disconnectTestDatabase();
    }, 60000);

    beforeEach(async () => {
        await Promise.all([
            Student.deleteMany({}),
            Course.deleteMany({}),
            CoursePackage.deleteMany({}),
            Program.deleteMany({}),
            StudentEnrollment.deleteMany({}),
            CourseInstance.deleteMany({}),
        ]);
    });

    afterEach(() => {
        logger.error.mockClear();
        logger.info.mockClear();
        logger.warn.mockClear();
        vi.restoreAllMocks();
    });

    describe("getStudentDetails", () => {
        it("returns 404 when student is missing", async () => {
            const select = vi.fn().mockResolvedValue(null);
            const populate = vi.fn().mockReturnValue({ select });
            vi.spyOn(Student, "findById").mockReturnValue({ populate });

            const req = buildReq({
                params: { id: new mongoose.Types.ObjectId().toString() },
            });
            const res = buildRes();

            await getStudentDetails(req, res);

            expect(res.statusCode).toBe(404);
            expect(res.body).toEqual({ error: "Student not found" });
        });

        it("populates education references and enrollment stats", async () => {
            const courseId = new mongoose.Types.ObjectId();
            const packageId = new mongoose.Types.ObjectId();
            const programId = new mongoose.Types.ObjectId();

            const studentDoc = {
                toObject: () => ({
                    _id: new mongoose.Types.ObjectId(),
                    education: [
                        { type: "Course", refId: courseId },
                        { type: "CoursePackage", refId: packageId },
                        { type: "Program", refId: programId },
                        { type: "Unknown", refId: new mongoose.Types.ObjectId() },
                        { type: "Course", refId: null },
                    ],
                }),
            };

            const select = vi.fn().mockResolvedValue(studentDoc);
            const populate = vi.fn().mockReturnValue({ select });
            vi.spyOn(Student, "findById").mockReturnValue({ populate });

            const courseQuery = {
                select: vi.fn().mockResolvedValue({
                    _id: courseId,
                    courseName: "Course One",
                    courseCode: "C-1",
                    coursePoints: "10",
                    courseExtent: "100",
                }),
            };
            const packageQuery = {
                select: vi.fn().mockResolvedValue({
                    _id: packageId,
                    coursePackageName: "Package One",
                    coursePackageCode: "P-1",
                }),
            };
            const programQuery = {
                select: vi.fn().mockResolvedValue({
                    _id: programId,
                    programName: "Program One",
                }),
            };
            const courseSpy = vi
                .spyOn(Course, "findById")
                .mockReturnValue(courseQuery);
            const packageSpy = vi
                .spyOn(CoursePackage, "findById")
                .mockReturnValue(packageQuery);
            const programSpy = vi
                .spyOn(Program, "findById")
                .mockReturnValue(programQuery);

            const enrollmentBase = {
                mainCourseId: { _id: courseId, courseName: "Course One" },
                courseInstanceId: { _id: new mongoose.Types.ObjectId() },
                teacherId: { name: "Teacher Name" },
                startDate: new Date("2024-01-01"),
                endDate: new Date("2024-06-01"),
                createdAt: new Date("2023-12-01"),
            };
            const enrollments = [
                {
                    ...enrollmentBase,
                    _id: new mongoose.Types.ObjectId(),
                    status: "enrolled",
                },
                {
                    ...enrollmentBase,
                    _id: new mongoose.Types.ObjectId(),
                    status: "active",
                },
                {
                    ...enrollmentBase,
                    _id: new mongoose.Types.ObjectId(),
                    status: "completed",
                },
                {
                    ...enrollmentBase,
                    _id: new mongoose.Types.ObjectId(),
                    status: "dropped",
                },
            ];

            const sort = vi.fn().mockResolvedValue(enrollments);
            const populateTeacher = vi.fn().mockReturnValue({ sort });
            const populateMain = vi.fn().mockReturnValue({
                populate: populateTeacher,
            });
            const populateCourseInstance = vi.fn().mockReturnValue({
                populate: populateMain,
            });
            vi.spyOn(StudentEnrollment, "find").mockReturnValue({
                populate: populateCourseInstance,
            });

            const req = buildReq({
                params: { id: new mongoose.Types.ObjectId().toString() },
            });
            const res = buildRes();

            await getStudentDetails(req, res);

            expect(res.statusCode).toBe(200);
            expect(res.body.education).toHaveLength(5);
            expect(res.body.education).toEqual(
                expect.arrayContaining([
                    expect.objectContaining({
                        type: "Course",
                        name: "Course One",
                        addedBy: "Teacher Name",
                        isEnrollment: true,
                    }),
                    expect.objectContaining({
                        type: "CoursePackage",
                        refId: expect.objectContaining({
                            coursePackageName: "Package One",
                        }),
                    }),
                ])
            );
            expect(res.body.enrollmentStats).toEqual({
                totalEnrollments: 4,
                activeEnrollments: 2,
                completedEnrollments: 1,
                droppedEnrollments: 1,
            });

            expect(courseSpy).toHaveBeenCalledWith(courseId);
            expect(packageSpy).toHaveBeenCalledWith(packageId);
            expect(programSpy).toHaveBeenCalledWith(programId);
        });

        it("falls back to empty education and system addedBy", async () => {
            const studentDoc = {
                toObject: () => ({
                    _id: new mongoose.Types.ObjectId(),
                    education: "not-an-array",
                }),
            };

            const select = vi.fn().mockResolvedValue(studentDoc);
            const populate = vi.fn().mockReturnValue({ select });
            vi.spyOn(Student, "findById").mockReturnValue({ populate });

            const enrollments = [
                {
                    _id: new mongoose.Types.ObjectId(),
                    status: "enrolled",
                    mainCourseId: null,
                    courseInstanceId: null,
                    startDate: new Date("2024-01-01"),
                    endDate: new Date("2024-06-01"),
                    createdAt: new Date("2023-12-01"),
                },
            ];

            const sort = vi.fn().mockResolvedValue(enrollments);
            const populateTeacher = vi.fn().mockReturnValue({ sort });
            const populateMain = vi.fn().mockReturnValue({
                populate: populateTeacher,
            });
            const populateCourseInstance = vi.fn().mockReturnValue({
                populate: populateMain,
            });
            vi.spyOn(StudentEnrollment, "find").mockReturnValue({
                populate: populateCourseInstance,
            });

            const req = buildReq({
                params: { id: new mongoose.Types.ObjectId().toString() },
            });
            const res = buildRes();

            await getStudentDetails(req, res);

            expect(res.statusCode).toBe(200);
            expect(res.body.education).toHaveLength(1);
            expect(res.body.education[0]).toMatchObject({
                addedBy: "System",
                courseInstanceId: undefined,
                name: undefined,
            });
        });

        it("handles education populate errors gracefully", async () => {
            const courseId = new mongoose.Types.ObjectId();
            const studentDoc = {
                toObject: () => ({
                    _id: new mongoose.Types.ObjectId(),
                    education: [{ type: "Course", refId: courseId }],
                }),
            };

            const select = vi.fn().mockResolvedValue(studentDoc);
            const populate = vi.fn().mockReturnValue({ select });
            vi.spyOn(Student, "findById").mockReturnValue({ populate });
            vi.spyOn(Course, "findById").mockRejectedValueOnce(
                new Error("populate error")
            );

            const sort = vi.fn().mockResolvedValue([]);
            const populateTeacher = vi.fn().mockReturnValue({ sort });
            const populateMain = vi.fn().mockReturnValue({
                populate: populateTeacher,
            });
            const populateCourseInstance = vi.fn().mockReturnValue({
                populate: populateMain,
            });
            vi.spyOn(StudentEnrollment, "find").mockReturnValue({
                populate: populateCourseInstance,
            });

            const req = buildReq({
                params: { id: new mongoose.Types.ObjectId().toString() },
            });
            const res = buildRes();

            await getStudentDetails(req, res);

            expect(res.statusCode).toBe(200);
            expect(res.body.education).toEqual([]);
            expect(logger.error).toHaveBeenCalled();
        });

        it("returns 500 when fetching details fails", async () => {
            vi.spyOn(Student, "findById").mockImplementationOnce(() => {
                throw new Error("find error");
            });

            const req = buildReq({
                params: { id: new mongoose.Types.ObjectId().toString() },
            });
            const res = buildRes();

            await getStudentDetails(req, res);

            expect(res.statusCode).toBe(500);
            expect(res.body).toEqual({ error: "Failed to fetch student details" });
        });
    });

    describe("updateStudentInfo", () => {
        it("rejects updates from non-admin users", async () => {
            const req = buildReq({
                params: { id: new mongoose.Types.ObjectId().toString() },
                body: { name: "New" },
                user: { role: "teacher" },
            });
            const res = buildRes();

            await updateStudentInfo(req, res);

            expect(res.statusCode).toBe(403);
            expect(res.body).toEqual({
                error: "Insufficient permissions to edit student information",
            });
        });

        it("returns 404 when student is missing", async () => {
            const req = buildReq({
                params: { id: new mongoose.Types.ObjectId().toString() },
                body: { name: "New" },
                user: { role: "admin" },
            });
            const res = buildRes();

            await updateStudentInfo(req, res);

            expect(res.statusCode).toBe(404);
            expect(res.body).toEqual({ error: "Student not found" });
        });

        it("updates allowed fields, apl status, and change history", async () => {
            const student = await createStudent({
                name: "Old",
                dropout: false,
                aplStatus: "GRAY",
                changeHistory: null,
            });

            const req = buildReq({
                params: { id: student._id.toString() },
                body: {
                    name: "New",
                    dropout: true,
                    phone: "123",
                    aplStatus: "GREEN",
                },
                user: {
                    role: "admin",
                    userId: new mongoose.Types.ObjectId().toString(),
                    name: "Admin User",
                },
            });
            const res = buildRes();

            await updateStudentInfo(req, res);

            expect(res.statusCode).toBe(200);
            expect(res.body.success).toBe(true);
            expect(res.body.student.name).toBe("New");
            expect(res.body.student.dropout).toBe(true);
            expect(res.body.student.phone).toBe("123");
            expect(res.body.student.aplStatus).toBe("GREEN");
            expect(res.body.student.aplStatusHistory).toHaveLength(1);
            expect(res.body.student.aplStatusHistory[0]).toMatchObject({
                status: "GREEN",
                changedBy: "Admin User",
            });
            expect(res.body.changeLog.changes).toEqual(
                expect.arrayContaining(["name", "dropout", "phone"])
            );
            expect(res.body.student.changeHistory).toHaveLength(1);
        });

        it("skips apl history when status is unchanged", async () => {
            const student = await createStudent({
                aplStatus: "GREEN",
                aplStatusHistory: [{ status: "GREEN", changedAt: new Date() }],
                changeHistory: [],
            });

            const req = buildReq({
                params: { id: student._id.toString() },
                body: { name: "Same", aplStatus: "GREEN" },
                user: {
                    role: "admin",
                    userId: new mongoose.Types.ObjectId().toString(),
                },
            });
            const res = buildRes();

            await updateStudentInfo(req, res);

            expect(res.statusCode).toBe(200);
            expect(res.body.student.aplStatusHistory).toHaveLength(1);
            expect(res.body.student.changeHistory).toHaveLength(1);
        });

        it("uses userId when name is not provided", async () => {
            const student = await createStudent({
                aplStatus: "GRAY",
                aplStatusHistory: [],
                changeHistory: [],
            });
            const userId = new mongoose.Types.ObjectId().toString();

            const req = buildReq({
                params: { id: student._id.toString() },
                body: { aplStatus: "RED" },
                user: { role: "admin", userId },
            });
            const res = buildRes();

            await updateStudentInfo(req, res);

            expect(res.statusCode).toBe(200);
            expect(res.body.student.aplStatusHistory).toHaveLength(1);
            expect(res.body.student.aplStatusHistory[0].changedBy).toBe(userId);
        });

        it("initializes apl history and uses system fallback when user identity is missing", async () => {
            const student = {
                _id: new mongoose.Types.ObjectId(),
                aplStatus: "GRAY",
                aplStatusHistory: null,
                changeHistory: [],
                save: vi.fn().mockResolvedValue(),
            };
            vi.spyOn(Student, "findById").mockResolvedValueOnce(student);

            const req = buildReq({
                params: { id: student._id.toString() },
                body: { aplStatus: "RED" },
                user: { role: "admin" },
            });
            const res = buildRes();

            await updateStudentInfo(req, res);

            expect(res.statusCode).toBe(200);
            expect(student.aplStatus).toBe("RED");
            expect(student.aplStatusHistory).toHaveLength(1);
            expect(student.aplStatusHistory[0]).toMatchObject({
                status: "RED",
                changedBy: "system",
            });
        });

        it("returns 500 when update fails", async () => {
            vi.spyOn(Student, "findById").mockRejectedValueOnce(
                new Error("update error")
            );

            const req = buildReq({
                params: { id: new mongoose.Types.ObjectId().toString() },
                body: { name: "New" },
                user: { role: "admin", userId: "admin-id" },
            });
            const res = buildRes();

            await updateStudentInfo(req, res);

            expect(res.statusCode).toBe(500);
            expect(res.body).toEqual({
                error: "Failed to update student information",
            });
        });
    });

    describe("addComment", () => {
        it("rejects comments from unauthorized roles", async () => {
            const req = buildReq({
                params: { id: new mongoose.Types.ObjectId().toString() },
                body: { comment: "Note" },
                user: { role: "student" },
            });
            const res = buildRes();

            await addComment(req, res);

            expect(res.statusCode).toBe(403);
            expect(res.body).toEqual({
                error: "Insufficient permissions to add comments",
            });
        });

        it("returns 404 when student is missing", async () => {
            const req = buildReq({
                params: { id: new mongoose.Types.ObjectId().toString() },
                body: { comment: "Note" },
                user: {
                    role: "teacher",
                    userId: new mongoose.Types.ObjectId().toString(),
                    name: "Teacher",
                },
            });
            const res = buildRes();

            await addComment(req, res);

            expect(res.statusCode).toBe(404);
            expect(res.body).toEqual({ error: "Student not found" });
        });

        it("adds a comment for authorized users", async () => {
            const student = await createStudent();
            const userId = new mongoose.Types.ObjectId().toString();

            const req = buildReq({
                params: { id: student._id.toString() },
                body: { comment: "New comment" },
                user: {
                    role: "teacher",
                    userId,
                    name: "Teacher",
                },
            });
            const res = buildRes();

            await addComment(req, res);

            expect(res.statusCode).toBe(200);
            expect(res.body.success).toBe(true);
            expect(res.body.comment.comment).toBe("New comment");
            expect(res.body.comment.author).toBe("Teacher");
            expect(res.body.comment.authorId.toString()).toBe(userId);
            expect(res.body.comment.seenBy[0].toString()).toBe(userId);
            expect(res.body.commentHistory).toHaveLength(1);
        });

        it("returns 500 when add comment fails", async () => {
            vi.spyOn(Student, "findById").mockRejectedValueOnce(
                new Error("comment error")
            );

            const req = buildReq({
                params: { id: new mongoose.Types.ObjectId().toString() },
                body: { comment: "Note" },
                user: {
                    role: "teacher",
                    userId: new mongoose.Types.ObjectId().toString(),
                },
            });
            const res = buildRes();

            await addComment(req, res);

            expect(res.statusCode).toBe(500);
            expect(res.body).toEqual({ error: "Failed to add comment" });
        });
    });

    describe("editComment", () => {
        it("returns 404 when student is missing", async () => {
            const req = buildReq({
                params: {
                    id: new mongoose.Types.ObjectId().toString(),
                    commentId: new mongoose.Types.ObjectId().toString(),
                },
                body: { comment: "Update" },
                user: { userId: "user", role: "teacher" },
            });
            const res = buildRes();

            await editComment(req, res);

            expect(res.statusCode).toBe(404);
            expect(res.body).toEqual({ error: "Student not found" });
        });

        it("returns 404 when comment is missing", async () => {
            const student = await createStudent({ commentHistory: [] });

            const req = buildReq({
                params: {
                    id: student._id.toString(),
                    commentId: new mongoose.Types.ObjectId().toString(),
                },
                body: { comment: "Update" },
                user: { userId: "user", role: "teacher" },
            });
            const res = buildRes();

            await editComment(req, res);

            expect(res.statusCode).toBe(404);
            expect(res.body).toEqual({ error: "Comment not found" });
        });

        it("rejects edits from non-authors", async () => {
            const commentId = new mongoose.Types.ObjectId();
            const student = await createStudent({
                commentHistory: [
                    {
                        _id: commentId,
                        comment: "Original",
                        authorId: new mongoose.Types.ObjectId(),
                        authorRole: "teacher",
                        isDeleted: false,
                    },
                ],
            });

            const req = buildReq({
                params: {
                    id: student._id.toString(),
                    commentId: commentId.toString(),
                },
                body: { comment: "Update" },
                user: { userId: new mongoose.Types.ObjectId().toString(), role: "teacher" },
            });
            const res = buildRes();

            await editComment(req, res);

            expect(res.statusCode).toBe(403);
            expect(res.body).toEqual({
                error: "You can only edit your own comments",
            });
        });

        it("allows authors to edit comments", async () => {
            const authorId = new mongoose.Types.ObjectId();
            const commentId = new mongoose.Types.ObjectId();
            const student = await createStudent({
                commentHistory: [
                    {
                        _id: commentId,
                        comment: "Original",
                        authorId,
                        authorRole: "teacher",
                        isDeleted: false,
                    },
                ],
            });

            const req = buildReq({
                params: {
                    id: student._id.toString(),
                    commentId: commentId.toString(),
                },
                body: { comment: "Updated" },
                user: { userId: authorId.toString(), role: "teacher" },
            });
            const res = buildRes();

            await editComment(req, res);

            expect(res.statusCode).toBe(200);
            expect(res.body.success).toBe(true);
            expect(res.body.comment.comment).toBe("Updated");
            expect(res.body.comment.previousVersion).toBe("Original");
        });

        it("allows admins to edit others' comments", async () => {
            const commentId = new mongoose.Types.ObjectId();
            const student = await createStudent({
                commentHistory: [
                    {
                        _id: commentId,
                        comment: "Original",
                        authorId: new mongoose.Types.ObjectId(),
                        authorRole: "teacher",
                        isDeleted: false,
                    },
                ],
            });

            const req = buildReq({
                params: {
                    id: student._id.toString(),
                    commentId: commentId.toString(),
                },
                body: { comment: "Admin Update" },
                user: {
                    userId: new mongoose.Types.ObjectId().toString(),
                    role: "admin",
                },
            });
            const res = buildRes();

            await editComment(req, res);

            expect(res.statusCode).toBe(200);
            expect(res.body.comment.comment).toBe("Admin Update");
        });

        it("returns 500 when edit fails", async () => {
            vi.spyOn(Student, "findById").mockRejectedValueOnce(
                new Error("edit error")
            );

            const req = buildReq({
                params: {
                    id: new mongoose.Types.ObjectId().toString(),
                    commentId: new mongoose.Types.ObjectId().toString(),
                },
                body: { comment: "Update" },
                user: { userId: "user", role: "teacher" },
            });
            const res = buildRes();

            await editComment(req, res);

            expect(res.statusCode).toBe(500);
            expect(res.body).toEqual({ error: "Failed to edit comment" });
        });
    });

    describe("deleteComment", () => {
        it("returns 404 when student is missing", async () => {
            const req = buildReq({
                params: {
                    id: new mongoose.Types.ObjectId().toString(),
                    commentId: new mongoose.Types.ObjectId().toString(),
                },
                user: { userId: "user", role: "teacher" },
            });
            const res = buildRes();

            await deleteComment(req, res);

            expect(res.statusCode).toBe(404);
            expect(res.body).toEqual({ error: "Student not found" });
        });

        it("returns 404 when comment is missing", async () => {
            const student = await createStudent({ commentHistory: [] });

            const req = buildReq({
                params: {
                    id: student._id.toString(),
                    commentId: new mongoose.Types.ObjectId().toString(),
                },
                user: { userId: "user", role: "teacher" },
            });
            const res = buildRes();

            await deleteComment(req, res);

            expect(res.statusCode).toBe(404);
            expect(res.body).toEqual({ error: "Comment not found" });
        });

        it("rejects deletes from non-authors", async () => {
            const commentId = new mongoose.Types.ObjectId();
            const student = await createStudent({
                commentHistory: [
                    {
                        _id: commentId,
                        comment: "Original",
                        authorId: new mongoose.Types.ObjectId(),
                        authorRole: "teacher",
                        isDeleted: false,
                    },
                ],
            });

            const req = buildReq({
                params: {
                    id: student._id.toString(),
                    commentId: commentId.toString(),
                },
                user: { userId: new mongoose.Types.ObjectId().toString(), role: "teacher" },
            });
            const res = buildRes();

            await deleteComment(req, res);

            expect(res.statusCode).toBe(403);
            expect(res.body).toEqual({
                error: "You can only delete your own comments",
            });
        });

        it("soft deletes comments for authors", async () => {
            const authorId = new mongoose.Types.ObjectId();
            const commentId = new mongoose.Types.ObjectId();
            const student = await createStudent({
                commentHistory: [
                    {
                        _id: commentId,
                        comment: "Original",
                        authorId,
                        authorRole: "teacher",
                        isDeleted: false,
                    },
                ],
            });

            const req = buildReq({
                params: {
                    id: student._id.toString(),
                    commentId: commentId.toString(),
                },
                user: { userId: authorId.toString(), role: "teacher" },
            });
            const res = buildRes();

            await deleteComment(req, res);

            expect(res.statusCode).toBe(200);
            expect(res.body.success).toBe(true);
            expect(res.body.deletedComment.deletedContent).toBe("Original");
        });

        it("returns 500 when delete fails", async () => {
            vi.spyOn(Student, "findById").mockRejectedValueOnce(
                new Error("delete error")
            );

            const req = buildReq({
                params: {
                    id: new mongoose.Types.ObjectId().toString(),
                    commentId: new mongoose.Types.ObjectId().toString(),
                },
                user: { userId: "user", role: "teacher" },
            });
            const res = buildRes();

            await deleteComment(req, res);

            expect(res.statusCode).toBe(500);
            expect(res.body).toEqual({ error: "Failed to delete comment" });
        });
    });

    describe("markCommentSeen", () => {
        it("returns 404 when student is missing", async () => {
            const req = buildReq({
                params: {
                    id: new mongoose.Types.ObjectId().toString(),
                    commentId: new mongoose.Types.ObjectId().toString(),
                },
                user: { userId: new mongoose.Types.ObjectId().toString() },
            });
            const res = buildRes();

            await markCommentSeen(req, res);

            expect(res.statusCode).toBe(404);
            expect(res.body).toEqual({ error: "Student not found" });
        });

        it("returns 404 when comment is missing", async () => {
            const student = await createStudent({ commentHistory: [] });

            const req = buildReq({
                params: {
                    id: student._id.toString(),
                    commentId: new mongoose.Types.ObjectId().toString(),
                },
                user: { userId: new mongoose.Types.ObjectId().toString() },
            });
            const res = buildRes();

            await markCommentSeen(req, res);

            expect(res.statusCode).toBe(404);
            expect(res.body).toEqual({ error: "Comment not found" });
        });

        it("marks a comment as seen", async () => {
            const commentId = new mongoose.Types.ObjectId();
            const student = await createStudent({
                commentHistory: [
                    {
                        _id: commentId,
                        comment: "Original",
                        authorId: new mongoose.Types.ObjectId(),
                        authorRole: "teacher",
                        seenBy: [],
                        isDeleted: false,
                    },
                ],
            });
            const userId = new mongoose.Types.ObjectId().toString();

            const req = buildReq({
                params: {
                    id: student._id.toString(),
                    commentId: commentId.toString(),
                },
                user: { userId },
            });
            const res = buildRes();

            await markCommentSeen(req, res);

            expect(res.statusCode).toBe(200);
            expect(res.body).toEqual({
                success: true,
                message: "Comment marked as seen",
            });

            const updated = await Student.findById(student._id);
            expect(updated.commentHistory[0].seenBy[0].toString()).toBe(userId);
        });

        it("does not duplicate seen entries", async () => {
            const userId = new mongoose.Types.ObjectId();
            const commentId = new mongoose.Types.ObjectId();
            const student = await createStudent({
                commentHistory: [
                    {
                        _id: commentId,
                        comment: "Original",
                        authorId: new mongoose.Types.ObjectId(),
                        authorRole: "teacher",
                        seenBy: [userId],
                        isDeleted: false,
                    },
                ],
            });

            const req = buildReq({
                params: {
                    id: student._id.toString(),
                    commentId: commentId.toString(),
                },
                user: { userId: userId.toString() },
            });
            const res = buildRes();

            await markCommentSeen(req, res);

            const refreshed = await Student.findById(student._id);
            expect(refreshed.commentHistory[0].seenBy).toHaveLength(1);
        });

        it("returns 500 when mark seen fails", async () => {
            vi.spyOn(Student, "findById").mockRejectedValueOnce(
                new Error("seen error")
            );

            const req = buildReq({
                params: {
                    id: new mongoose.Types.ObjectId().toString(),
                    commentId: new mongoose.Types.ObjectId().toString(),
                },
                user: { userId: "user" },
            });
            const res = buildRes();

            await markCommentSeen(req, res);

            expect(res.statusCode).toBe(500);
            expect(res.body).toEqual({ error: "Failed to mark comment as seen" });
        });
    });

    describe("getChangeHistory", () => {
        it("rejects non-admin users", async () => {
            const req = buildReq({
                params: { id: new mongoose.Types.ObjectId().toString() },
                user: { role: "teacher" },
            });
            const res = buildRes();

            await getChangeHistory(req, res);

            expect(res.statusCode).toBe(403);
            expect(res.body).toEqual({
                error: "Insufficient permissions to view change history",
            });
        });

        it("returns 404 when student is missing", async () => {
            const req = buildReq({
                params: { id: new mongoose.Types.ObjectId().toString() },
                user: { role: "admin" },
            });
            const res = buildRes();

            await getChangeHistory(req, res);

            expect(res.statusCode).toBe(404);
            expect(res.body).toEqual({ error: "Student not found" });
        });

        it("returns empty history when not set", async () => {
            const student = await createStudent();
            await Student.updateOne(
                { _id: student._id },
                { $unset: { changeHistory: "" } }
            );

            const req = buildReq({
                params: { id: student._id.toString() },
                user: { role: "admin" },
            });
            const res = buildRes();

            await getChangeHistory(req, res);

            expect(res.statusCode).toBe(200);
            expect(res.body).toEqual({ success: true, changeHistory: [] });
        });

        it("uses empty history when changeHistory is null", async () => {
            const select = vi.fn().mockResolvedValue({ changeHistory: null });
            vi.spyOn(Student, "findById").mockReturnValue({ select });

            const req = buildReq({
                params: { id: new mongoose.Types.ObjectId().toString() },
                user: { role: "admin" },
            });
            const res = buildRes();

            await getChangeHistory(req, res);

            expect(res.statusCode).toBe(200);
            expect(res.body).toEqual({ success: true, changeHistory: [] });
        });

        it("returns stored change history", async () => {
            const student = await createStudent({
                changeHistory: [
                    {
                        timestamp: new Date(),
                        changedBy: new mongoose.Types.ObjectId(),
                        changedByRole: "admin",
                        changes: ["name"],
                        previousValues: {},
                        newValues: {},
                    },
                ],
            });

            const req = buildReq({
                params: { id: student._id.toString() },
                user: { role: "admin" },
            });
            const res = buildRes();

            await getChangeHistory(req, res);

            expect(res.statusCode).toBe(200);
            expect(res.body.changeHistory).toHaveLength(1);
        });

        it("returns 500 when history fetch fails", async () => {
            vi.spyOn(Student, "findById").mockRejectedValueOnce(
                new Error("history error")
            );

            const req = buildReq({
                params: { id: new mongoose.Types.ObjectId().toString() },
                user: { role: "admin" },
            });
            const res = buildRes();

            await getChangeHistory(req, res);

            expect(res.statusCode).toBe(500);
            expect(res.body).toEqual({ error: "Failed to fetch change history" });
        });
    });
});
