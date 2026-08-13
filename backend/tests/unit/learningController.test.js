import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/models/Student.js", () => ({
    __esModule: true,
    default: { findOne: vi.fn() },
}));
vi.mock("../../src/models/Teacher.js", () => ({
    __esModule: true,
    default: { findOne: vi.fn() },
}));
vi.mock("../../src/models/CourseInstance.js", () => ({
    __esModule: true,
    default: { find: vi.fn(), findById: vi.fn() },
}));
vi.mock("../../src/models/StudentEnrollment.js", () => ({
    __esModule: true,
    default: { find: vi.fn(), findOne: vi.fn() },
}));
vi.mock("../../src/models/AssignmentSubmission.js", () => ({
    __esModule: true,
    default: { find: vi.fn(), findById: vi.fn(), findOneAndUpdate: vi.fn() },
}));

import Student from "../../src/models/Student.js";
import Teacher from "../../src/models/Teacher.js";
import CourseInstance from "../../src/models/CourseInstance.js";
import StudentEnrollment from "../../src/models/StudentEnrollment.js";
import AssignmentSubmission from "../../src/models/AssignmentSubmission.js";
import {
    getInstanceModules,
    getInstanceSubmissions,
    getPendingSubmissions,
    setSubmissionFeedback,
    submitAssignment,
} from "../../src/controllers/learningController.js";

const STUDENT_ID = "111111111111111111111111";
const ENROLLMENT_ID = "222222222222222222222222";
const INSTANCE_ID = "333333333333333333333333";
const SUBMISSION_ID = "444444444444444444444444";
const TEACHER_ID = "555555555555555555555555";
const USER_ID = "666666666666666666666666";

// Makes a mongoose-style chainable query resolve to `data` when awaited.
const chainable = (data) => {
    const chain = {
        populate: () => chain,
        select: () => chain,
        sort: () => chain,
        lean: () => chain,
        then: (resolve) => resolve(data),
    };
    return chain;
};

const makeRes = () => {
    const res = { json: vi.fn(), status: vi.fn(() => res) };
    return res;
};

const reqFor = (overrides = {}) => ({
    params: {},
    query: {},
    body: {},
    user: { userId: USER_ID, email: "student@mindful.se", roles: ["student"], role: "student" },
    ...overrides,
});

describe("learningController", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.restoreAllMocks();
    });

    const moduleWithAssignment = {
        moduleNumber: 1,
        title: "Modul 1",
        sections: [{ title: "S1", description: "d", instructions: "Läs." }],
        assignment: { title: "Inlämning", description: "Skriv." },
    };
    const moduleWithoutAssignment = {
        moduleNumber: 2,
        title: "Modul 2",
        sections: [{ title: "S1" }],
    };
    const instance = {
        _id: INSTANCE_ID,
        courseName: "Svenska 1",
        courseCode: "SVASVE01",
        responsibleTeacher: TEACHER_ID,
        assistantTeacher: null,
        modules: [moduleWithAssignment, moduleWithoutAssignment],
    };
    const enrollment = {
        _id: ENROLLMENT_ID,
        studentId: STUDENT_ID,
        courseInstanceId: INSTANCE_ID,
        status: "active",
    };
    const teacher = { _id: TEACHER_ID, name: "Eva" };

    describe("getInstanceModules", () => {
        it("returns modules + the student's own submissions for an enrolled student", async () => {
            Student.findOne.mockResolvedValue({ _id: STUDENT_ID, name: "Anna" });
            StudentEnrollment.findOne.mockResolvedValue(enrollment);
            CourseInstance.findById.mockResolvedValue(instance);
            AssignmentSubmission.find.mockReturnValue(
                chainable([
                    {
                        moduleNumber: 1,
                        submittedText: "svar",
                        feedback: { status: "godkänd", comment: "Bra" },
                        toObject: () => ({
                            moduleNumber: 1,
                            submittedText: "svar",
                            feedback: { status: "godkänd", comment: "Bra" },
                        }),
                    },
                ])
            );

            const req = reqFor({ params: { instanceId: INSTANCE_ID } });
            const res = makeRes();
            await getInstanceModules(req, res);

            expect(CourseInstance.findById).toHaveBeenCalledWith(INSTANCE_ID);
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: true,
                    instance: { _id: INSTANCE_ID, courseName: "Svenska 1", courseCode: "SVASVE01" },
                    modules: [moduleWithAssignment, moduleWithoutAssignment],
                    enrollmentId: ENROLLMENT_ID,
                })
            );
            const payload = res.json.mock.calls[0][0];
            expect(payload.submissions[1]).toMatchObject({ submittedText: "svar" });
        });

        it("forbids a student who is not enrolled", async () => {
            Student.findOne.mockResolvedValue({ _id: STUDENT_ID, name: "Anna" });
            StudentEnrollment.findOne.mockResolvedValue(null);
            CourseInstance.findById.mockResolvedValue(instance);

            const req = reqFor({ params: { instanceId: INSTANCE_ID } });
            const res = makeRes();
            await getInstanceModules(req, res);

            expect(res.status).toHaveBeenCalledWith(403);
            expect(res.json).toHaveBeenCalledWith({ error: "Du är inte inskriven på den här kursen" });
        });

        it("allows a teacher who owns the instance", async () => {
            Teacher.findOne.mockResolvedValue(teacher);
            CourseInstance.findById.mockResolvedValue(instance);

            const req = reqFor({
                params: { instanceId: INSTANCE_ID },
                user: { userId: USER_ID, roles: ["teacher"], role: "teacher" },
            });
            const res = makeRes();
            await getInstanceModules(req, res);

            expect(res.status).not.toHaveBeenCalled();
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({ success: true, modules: [moduleWithAssignment, moduleWithoutAssignment] })
            );
        });

        it("forbids a teacher who does not own the instance", async () => {
            Teacher.findOne.mockResolvedValue(teacher);
            CourseInstance.findById.mockResolvedValue({ ...instance, responsibleTeacher: "999999999999999999999999" });

            const req = reqFor({
                params: { instanceId: INSTANCE_ID },
                user: { userId: USER_ID, roles: ["teacher"], role: "teacher" },
            });
            const res = makeRes();
            await getInstanceModules(req, res);

            expect(res.status).toHaveBeenCalledWith(403);
            expect(res.json).toHaveBeenCalledWith({ error: "Du ansvarar inte för den här kursen" });
        });

        it("returns 404 when the instance does not exist", async () => {
            CourseInstance.findById.mockResolvedValue(null);

            const req = reqFor({
                params: { instanceId: INSTANCE_ID },
                user: { userId: USER_ID, roles: ["admin"], role: "admin" },
            });
            const res = makeRes();
            await getInstanceModules(req, res);

            expect(res.status).toHaveBeenCalledWith(404);
            expect(res.json).toHaveBeenCalledWith({ error: "Course instance not found" });
        });
    });

    describe("submitAssignment", () => {
        it("creates a submission for an enrolled student with text", async () => {
            Student.findOne.mockResolvedValue({ _id: STUDENT_ID, name: "Anna" });
            StudentEnrollment.findOne.mockResolvedValue(enrollment);
            CourseInstance.findById.mockResolvedValue(instance);
            const saved = { _id: SUBMISSION_ID, moduleNumber: 1, submittedText: "svar" };
            AssignmentSubmission.findOneAndUpdate.mockResolvedValue(saved);

            const req = reqFor({ params: { instanceId: INSTANCE_ID, moduleNumber: "1" }, body: { submittedText: "svar" } });
            const res = makeRes();
            await submitAssignment(req, res);

            expect(AssignmentSubmission.findOneAndUpdate).toHaveBeenCalledWith(
                { studentId: STUDENT_ID, enrollmentId: ENROLLMENT_ID, moduleNumber: 1 },
                expect.objectContaining({
                    $set: expect.objectContaining({ courseInstanceId: INSTANCE_ID, submittedText: "svar" }),
                }),
                expect.objectContaining({ upsert: true, new: true })
            );
            expect(res.status).toHaveBeenCalledWith(201);
            expect(res.json).toHaveBeenCalledWith({ success: true, submission: saved });
        });

        it("clears previous feedback on resubmission", async () => {
            Student.findOne.mockResolvedValue({ _id: STUDENT_ID, name: "Anna" });
            StudentEnrollment.findOne.mockResolvedValue(enrollment);
            CourseInstance.findById.mockResolvedValue(instance);
            AssignmentSubmission.findOneAndUpdate.mockResolvedValue({ _id: SUBMISSION_ID });

            const req = reqFor({ params: { instanceId: INSTANCE_ID, moduleNumber: "1" }, body: { submittedText: "ny version" } });
            const res = makeRes();
            await submitAssignment(req, res);

            const updateCall = AssignmentSubmission.findOneAndUpdate.mock.calls[0][1];
            expect(updateCall.$set.feedback).toEqual({ comment: "", status: "", by: null, at: null });
        });

        it("rejects empty text and no file", async () => {
            Student.findOne.mockResolvedValue({ _id: STUDENT_ID, name: "Anna" });
            StudentEnrollment.findOne.mockResolvedValue(enrollment);
            CourseInstance.findById.mockResolvedValue(instance);

            const req = reqFor({ params: { instanceId: INSTANCE_ID, moduleNumber: "1" }, body: {} });
            const res = makeRes();
            await submitAssignment(req, res);

            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith({ error: "Ange en text eller ladda upp en fil" });
        });

        it("rejects a module without an assignment", async () => {
            Student.findOne.mockResolvedValue({ _id: STUDENT_ID, name: "Anna" });
            StudentEnrollment.findOne.mockResolvedValue(enrollment);
            CourseInstance.findById.mockResolvedValue(instance);

            const req = reqFor({ params: { instanceId: INSTANCE_ID, moduleNumber: "2" }, body: { submittedText: "svar" } });
            const res = makeRes();
            await submitAssignment(req, res);

            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith({ error: "Den här modulen har ingen inlämningsuppgift" });
        });

        it("forbids non-students", async () => {
            const req = reqFor({ user: { userId: USER_ID, roles: ["teacher"], role: "teacher" }, params: { instanceId: INSTANCE_ID, moduleNumber: "1" } });
            const res = makeRes();
            await submitAssignment(req, res);

            expect(res.status).toHaveBeenCalledWith(403);
            expect(res.json).toHaveBeenCalledWith({ error: "Only students can submit assignments" });
        });
    });

    describe("getInstanceSubmissions", () => {
        it("returns submissions for the owning teacher", async () => {
            Teacher.findOne.mockResolvedValue(teacher);
            CourseInstance.findById.mockResolvedValue(instance);
            const submissions = [{ _id: SUBMISSION_ID, moduleNumber: 1 }];
            AssignmentSubmission.find.mockReturnValue(chainable(submissions));

            const req = reqFor({ user: { userId: USER_ID, roles: ["teacher"], role: "teacher" }, params: { instanceId: INSTANCE_ID } });
            const res = makeRes();
            await getInstanceSubmissions(req, res);

            expect(res.json).toHaveBeenCalledWith({ success: true, submissions });
        });

        it("forbids a teacher who does not own the instance", async () => {
            Teacher.findOne.mockResolvedValue(teacher);
            CourseInstance.findById.mockResolvedValue({ ...instance, responsibleTeacher: "999999999999999999999999" });

            const req = reqFor({ user: { userId: USER_ID, roles: ["teacher"], role: "teacher" }, params: { instanceId: INSTANCE_ID } });
            const res = makeRes();
            await getInstanceSubmissions(req, res);

            expect(res.status).toHaveBeenCalledWith(403);
        });

        it("lets staff see submissions of any instance", async () => {
            CourseInstance.findById.mockResolvedValue(instance);
            const submissions = [{ _id: SUBMISSION_ID, moduleNumber: 1 }];
            AssignmentSubmission.find.mockReturnValue(chainable(submissions));

            const req = reqFor({ user: { userId: USER_ID, roles: ["admin"], role: "admin" }, params: { instanceId: INSTANCE_ID } });
            const res = makeRes();
            await getInstanceSubmissions(req, res);

            expect(Teacher.findOne).not.toHaveBeenCalled();
            expect(res.json).toHaveBeenCalledWith({ success: true, submissions });
        });
    });

    describe("setSubmissionFeedback", () => {
        it("sets godkänd feedback", async () => {
            Teacher.findOne.mockResolvedValue(teacher);
            CourseInstance.findById.mockResolvedValue(instance);
            const submission = {
                _id: SUBMISSION_ID,
                courseInstanceId: INSTANCE_ID,
                feedback: {},
                save: vi.fn().mockResolvedValue(true),
            };
            AssignmentSubmission.findById.mockResolvedValue(submission);

            const req = reqFor({
                user: { userId: USER_ID, roles: ["teacher"], role: "teacher" },
                params: { submissionId: SUBMISSION_ID },
                body: { comment: "Bra jobbat!", status: "godkänd" },
            });
            const res = makeRes();
            await setSubmissionFeedback(req, res);

            expect(submission.feedback).toMatchObject({ comment: "Bra jobbat!", status: "godkänd", by: USER_ID });
            expect(submission.save).toHaveBeenCalled();
            expect(res.json).toHaveBeenCalledWith({ success: true, submission });
        });

        it("rejects an invalid status", async () => {
            const req = reqFor({ params: { submissionId: SUBMISSION_ID }, body: { status: "underkänd" } });
            const res = makeRes();
            await setSubmissionFeedback(req, res);

            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith({ error: "Status måste vara godkänd eller komplettera" });
        });

        it("forbids a teacher who does not own the submission's instance", async () => {
            Teacher.findOne.mockResolvedValue(teacher);
            CourseInstance.findById.mockResolvedValue({ ...instance, responsibleTeacher: "999999999999999999999999" });
            AssignmentSubmission.findById.mockResolvedValue({ _id: SUBMISSION_ID, courseInstanceId: INSTANCE_ID, feedback: {} });

            const req = reqFor({
                user: { userId: USER_ID, roles: ["teacher"], role: "teacher" },
                params: { submissionId: SUBMISSION_ID },
                body: { comment: "Komplettera", status: "komplettera" },
            });
            const res = makeRes();
            await setSubmissionFeedback(req, res);

            expect(res.status).toHaveBeenCalledWith(403);
        });
    });

    describe("getPendingSubmissions", () => {
        it("scopes to the teacher's own instances", async () => {
            Teacher.findOne.mockResolvedValue(teacher);
            const owned = [{ _id: INSTANCE_ID }];
            CourseInstance.find.mockReturnValue(chainable(owned));
            const submissions = [{ _id: SUBMISSION_ID, moduleNumber: 1 }];
            AssignmentSubmission.find.mockReturnValue(chainable(submissions));

            const req = reqFor({ user: { userId: USER_ID, roles: ["teacher"], role: "teacher" } });
            const res = makeRes();
            await getPendingSubmissions(req, res);

            const query = AssignmentSubmission.find.mock.calls[0][0];
            expect(query["feedback.status"]).toBe("");
            expect(query.courseInstanceId).toEqual({ $in: [INSTANCE_ID] });
            expect(res.json).toHaveBeenCalledWith({ success: true, submissions });
        });

        it("returns all pending submissions for staff", async () => {
            const submissions = [{ _id: SUBMISSION_ID }];
            AssignmentSubmission.find.mockReturnValue(chainable(submissions));

            const req = reqFor({ user: { userId: USER_ID, roles: ["admin"], role: "admin" } });
            const res = makeRes();
            await getPendingSubmissions(req, res);

            expect(Teacher.findOne).not.toHaveBeenCalled();
            expect(AssignmentSubmission.find.mock.calls[0][0]).toEqual({ "feedback.status": "" });
            expect(res.json).toHaveBeenCalledWith({ success: true, submissions });
        });
    });
});
