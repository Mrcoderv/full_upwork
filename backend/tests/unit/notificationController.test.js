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
import Notification from "../../src/models/Notification.js";
import Student from "../../src/models/Student.js";
import User from "../../src/models/User.js";
import Course from "../../src/models/Course.js";
import {
    checkPendingGradesAndNotify,
    createNotification,
    resolveNotification,
    createGlobalNotification,
    resolveGlobalNotification,
    evaluateActionPlanStatusAndNotify,
    evaluateGradingStatusAndNotify,
    sendDropoutNotification,
    sendStudyplanChangedNotification,
} from "../../src/controllers/notificationController.js";
import {
    connectTestDatabase,
    disconnectTestDatabase,
} from "../helpers/mongoTest.js";

describe("notificationController", () => {
    beforeAll(async () => {
        await connectTestDatabase();
    }, 60000);

    afterAll(async () => {
        await disconnectTestDatabase();
    }, 60000);

    beforeEach(async () => {
        await Notification.deleteMany({});
        await Student.deleteMany({});
        await User.deleteMany({});
        await Course.deleteMany({});
    });

    afterEach(async () => {
        vi.restoreAllMocks();
        await Notification.deleteMany({});
        await Student.deleteMany({});
        await User.deleteMany({});
        await Course.deleteMany({});
    });

    describe("checkPendingGradesAndNotify", () => {
        it("creates a pending grades notification when ungraded students exist", async () => {
            vi.spyOn(Student, "countDocuments").mockResolvedValueOnce(2);

            await checkPendingGradesAndNotify();

            const notification = await Notification.findOne({
                type: "grades_pending",
                resolved: false,
            }).lean();
            expect(notification).not.toBeNull();
        });

        it("does not create a duplicate notification when one already exists", async () => {
            await Notification.create({
                type: "grades_pending",
                message: "Du har elever att betygsätta",
                resolved: false,
            });

            vi.spyOn(Student, "countDocuments").mockResolvedValueOnce(1);

            await checkPendingGradesAndNotify();

            const notifications = await Notification.find({
                type: "grades_pending",
            }).lean();
            expect(notifications).toHaveLength(1);
            expect(notifications[0].resolved).toBe(false);
        });

        it("resolves the notification when no ungraded students remain", async () => {
            const notification = await Notification.create({
                type: "grades_pending",
                message: "Du har elever att betygsätta",
                resolved: false,
            });

            vi.spyOn(Student, "countDocuments").mockResolvedValueOnce(0);

            await checkPendingGradesAndNotify();

            const updated = await Notification.findById(notification._id).lean();
            expect(updated?.resolved).toBe(true);
        });

        it("does nothing when no ungraded students and no notification exists", async () => {
            vi.spyOn(Student, "countDocuments").mockResolvedValueOnce(0);

            await checkPendingGradesAndNotify();

            const count = await Notification.countDocuments({});
            expect(count).toBe(0);
        });
    });

    describe("createNotification", () => {
        it("creates a new notification when none exists", async () => {
            const studentId = new mongoose.Types.ObjectId();
            const courseId = new mongoose.Types.ObjectId();

            const created = await createNotification({
                studentId,
                courseId,
                type: "missing_grade",
                message: "Missing grade",
            });

            expect(created).toBeDefined();
            expect(created?.type).toBe("missing_grade");
            expect(created?.resolved).toBe(false);

            const count = await Notification.countDocuments({});
            expect(count).toBe(1);
        });

        it("returns undefined when a matching notification exists", async () => {
            const studentId = new mongoose.Types.ObjectId();
            const courseId = new mongoose.Types.ObjectId();

            await Notification.collection.insertOne({
                studentId,
                courseId,
                type: "missing_grade",
                message: "Missing grade",
                resolved: false,
            });

            const created = await createNotification({
                studentId,
                courseId,
                type: "missing_grade",
                message: "Missing grade",
            });

            expect(created).toBeUndefined();
            const count = await Notification.countDocuments({});
            expect(count).toBe(1);
        });
    });

    describe("resolveNotification", () => {
        it("marks matching notifications as resolved", async () => {
            const studentId = new mongoose.Types.ObjectId();
            const courseId = new mongoose.Types.ObjectId();

            await Notification.collection.insertMany([
                {
                    studentId,
                    courseId,
                    type: "missing_grade",
                    resolved: false,
                },
                {
                    studentId,
                    courseId,
                    type: "other",
                    resolved: false,
                },
            ]);

            await resolveNotification({
                studentId,
                courseId,
                type: "missing_grade",
            });

            const resolved = await Notification.findOne({
                type: "missing_grade",
            }).lean();
            const untouched = await Notification.findOne({
                type: "other",
            }).lean();

            expect(resolved?.resolved).toBe(true);
            expect(untouched?.resolved).toBe(false);
        });
    });

    describe("createGlobalNotification", () => {
        it("creates a global notification when none exists", async () => {
            const created = await createGlobalNotification(
                "global_notice",
                "Hello world"
            );

            expect(created).toBeDefined();
            expect(created?.type).toBe("global_notice");

            const count = await Notification.countDocuments({
                type: "global_notice",
            });
            expect(count).toBe(1);
        });

        it("does not create a global notification when one exists", async () => {
            await Notification.create({
                type: "global_notice",
                message: "Hello world",
                resolved: false,
            });

            const created = await createGlobalNotification(
                "global_notice",
                "Hello world"
            );

            expect(created).toBeUndefined();
            const count = await Notification.countDocuments({
                type: "global_notice",
            });
            expect(count).toBe(1);
        });
    });

    describe("resolveGlobalNotification", () => {
        it("resolves all notifications of a given type", async () => {
            await Notification.create([
                { type: "global_notice", resolved: false },
                { type: "global_notice", resolved: true },
                { type: "other", resolved: false },
            ]);

            await resolveGlobalNotification("global_notice");

            const resolved = await Notification.find({
                type: "global_notice",
            }).lean();
            const other = await Notification.findOne({ type: "other" }).lean();

            expect(resolved.every((note) => note.resolved)).toBe(true);
            expect(other?.resolved).toBe(false);
        });
    });

    describe("evaluateActionPlanStatusAndNotify", () => {
        it("creates a global notification when action plan notifications exist", async () => {
            await Notification.create({
                type: "action_plan_required",
                resolved: false,
            });

            await evaluateActionPlanStatusAndNotify();

            const global = await Notification.findOne({
                type: "global_action_plan_required",
                resolved: false,
            }).lean();
            expect(global).not.toBeNull();
        });

        it("resolves the global notification when none exist", async () => {
            const global = await Notification.create({
                type: "global_action_plan_required",
                resolved: false,
            });

            await evaluateActionPlanStatusAndNotify();

            const updated = await Notification.findById(global._id).lean();
            expect(updated?.resolved).toBe(true);
        });

        it("logs errors when evaluation fails", async () => {
            const errorSpy = vi
                .spyOn(console, "error")
                .mockImplementation(() => {});
            vi.spyOn(Notification, "exists").mockRejectedValueOnce(
                new Error("Boom")
            );

            await evaluateActionPlanStatusAndNotify();

            expect(errorSpy).toHaveBeenCalled();
        });
    });

    describe("evaluateGradingStatusAndNotify", () => {
        it("creates a grades pending notification when ungraded students exist", async () => {
            vi.spyOn(Student, "find").mockReturnValue({
                lean: () =>
                    Promise.resolve([
                        {
                            education: [
                                {
                                    removedAt: null,
                                    grade: null,
                                    locked: false,
                                },
                            ],
                        },
                    ]),
            });

            await evaluateGradingStatusAndNotify();

            const global = await Notification.findOne({
                type: "grades_pending",
                resolved: false,
            }).lean();
            expect(global).not.toBeNull();
        });

        it("resolves the grades pending notification when all students are graded", async () => {
            const existing = await Notification.create({
                type: "grades_pending",
                resolved: false,
            });

            vi.spyOn(Student, "find").mockReturnValue({
                lean: () =>
                    Promise.resolve([
                        {
                            education: [
                                {
                                    removedAt: null,
                                    grade: "A",
                                    locked: true,
                                },
                            ],
                        },
                        {
                            name: "No Education",
                        },
                    ]),
            });

            await evaluateGradingStatusAndNotify();

            const updated = await Notification.findById(existing._id).lean();
            expect(updated?.resolved).toBe(true);
        });

        it("logs errors when evaluation fails", async () => {
            const errorSpy = vi
                .spyOn(console, "error")
                .mockImplementation(() => {});
            vi.spyOn(Student, "find").mockReturnValue({
                lean: () => Promise.reject(new Error("Fail")),
            });

            await evaluateGradingStatusAndNotify();

            expect(errorSpy).toHaveBeenCalled();
        });
    });

    describe("sendDropoutNotification", () => {
        it("creates a dropout notification with a resolved teacher id", async () => {
            const teacher = await User.create({
                name: "Teacher One",
                email: "teacher@example.com",
                password: "secret",
                role: "teacher",
            });
            const studentId = new mongoose.Types.ObjectId();
            const educationId = new mongoose.Types.ObjectId();
            const courseId = new mongoose.Types.ObjectId();

            const notification = await sendDropoutNotification({
                student: {
                    _id: studentId,
                    name: "Student One",
                    teacher: "Teacher One",
                },
                education: {
                    _id: educationId,
                    name: "Course A",
                    refId: courseId,
                },
            });

            expect(notification).toBeDefined();
            expect(notification.meta.teacherId?.toString()).toBe(
                teacher._id.toString()
            );
            expect(notification.meta.studentId.toString()).toBe(
                studentId.toString()
            );
            expect(notification.meta.courseId.toString()).toBe(
                courseId.toString()
            );
            expect(notification.message).toContain("Student One");
            expect(notification.message).toContain("Course A");
        });

        it("returns the existing notification when a duplicate is found", async () => {
            const studentId = new mongoose.Types.ObjectId();
            const educationId = new mongoose.Types.ObjectId();

            const existingId = new mongoose.Types.ObjectId();
            await Notification.collection.insertOne({
                _id: existingId,
                type: "dropout",
                message: "Existing",
                meta: {
                    studentId,
                    educationId,
                },
            });

            const notification = await sendDropoutNotification({
                student: { _id: studentId, name: "Student One", teacher: "" },
                education: { _id: educationId, name: "Course A" },
            });

            expect(notification._id.toString()).toBe(existingId.toString());
            const count = await Notification.countDocuments({
                type: "dropout",
            });
            expect(count).toBe(1);
        });

        it("uses a null teacher id when no matching user is found", async () => {
            const studentId = new mongoose.Types.ObjectId();
            const educationId = new mongoose.Types.ObjectId();

            const notification = await sendDropoutNotification({
                student: {
                    _id: studentId,
                    name: "Student Three",
                    teacher: "Missing Teacher",
                },
                education: { _id: educationId, name: "Course B" },
            });

            expect(notification.meta.teacherId).toBeNull();
        });

        it("handles missing teacher and education name", async () => {
            const studentId = new mongoose.Types.ObjectId();
            const educationId = new mongoose.Types.ObjectId();

            const notification = await sendDropoutNotification({
                student: {
                    _id: studentId,
                    name: "Student Two",
                    teacher: "   ",
                },
                education: { _id: educationId },
            });

            expect(notification.meta.teacherId).toBeNull();
            expect(notification.meta.courseId).toBeNull();
            expect(notification.message).toContain("okänd utbildning");
        });
    });

    describe("sendStudyplanChangedNotification", () => {
        it("logs and returns when skipNotification is set", async () => {
            const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
            const enrollmentId = new mongoose.Types.ObjectId();

            await sendStudyplanChangedNotification({
                doc: { _id: enrollmentId, skipNotification: true },
                changeType: "created",
            });

            expect(logSpy).toHaveBeenCalledWith(
                `Skipping notification for StudentEnrollment ${enrollmentId}`
            );

            const count = await Notification.countDocuments({
                type: "studyplan_changed",
            });
            expect(count).toBe(0);
        });

        it("creates a notification when a studyplan is created", async () => {
            const student = await Student.create({
                name: "Student One",
                personalNumber: "190001019999",
                email: "student.one@example.com",
            });

            const course = await Course.create({
                courseName: "Matematik",
                courseCode: "MATH101",
            });

            const enrollmentDoc = {
                _id: new mongoose.Types.ObjectId(),
                studentId: student._id,
                courseInstanceId: new mongoose.Types.ObjectId(),
                mainCourseId: course._id,
                teacherId: new mongoose.Types.ObjectId(),
            };

            await sendStudyplanChangedNotification({
                doc: enrollmentDoc,
                changeType: "created",
            });

            const notification = await Notification.findOne({
                type: "studyplan_changed",
            }).lean();

            expect(notification).not.toBeNull();
            expect(notification?.message).toBe(
                `Ny studieplan skapad för ${student.name} i kursen Matematik.`
            );
            expect(notification?.resolved).toBe(false);
            expect(notification?.teacher?.toString()).toBe(
                enrollmentDoc.teacherId.toString()
            );
            expect(notification?.meta?.studentId?.toString()).toBe(
                student._id.toString()
            );
        });

        it("creates a notification when a studyplan is deleted", async () => {
            const student = await Student.create({
                name: "Student Two",
                personalNumber: "190001029999",
                email: "student.two@example.com",
            });

            const course = await Course.create({
                courseName: "Svenska",
                courseCode: "SVE101",
            });

            const enrollmentDoc = {
                _id: new mongoose.Types.ObjectId(),
                studentId: student._id,
                courseInstanceId: new mongoose.Types.ObjectId(),
                mainCourseId: course._id,
                teacherId: new mongoose.Types.ObjectId(),
            };

            await sendStudyplanChangedNotification({
                doc: enrollmentDoc,
                changeType: "deleted",
            });

            const notification = await Notification.findOne({
                type: "studyplan_changed",
            }).lean();

            expect(notification).not.toBeNull();
            expect(notification?.message).toBe(
                `Studieplan borttagen för ${student.name} i kursen Svenska.`
            );
            expect(notification?.resolved).toBe(false);
        });
    });
});
