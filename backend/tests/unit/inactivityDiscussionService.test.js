import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import User from "../../src/models/User.js";
import Teacher from "../../src/models/Teacher.js";
import Student from "../../src/models/Student.js";
import StudentEnrollment from "../../src/models/StudentEnrollment.js";
import Course from "../../src/models/Course.js";
import CourseInstance from "../../src/models/CourseInstance.js";
import Notification from "../../src/models/Notification.js";
import Conversation from "../../src/models/Conversation.js";
import Message from "../../src/models/Message.js";
import { connectTestDatabase, disconnectTestDatabase } from "../helpers/mongoTest.js";
import {
    resolveResponsibleTeacher,
    ensureInactivityDiscussionThread,
    notifyInactivityAction,
    safeInactivitySideEffect,
    computeLiveInactivitySignal,
    summarizeInactivitySignal,
} from "../../src/services/inactivityDiscussionService.js";

describe("inactivityDiscussionService", () => {
    beforeAll(async () => {
        await connectTestDatabase();
    });

    afterAll(async () => {
        await disconnectTestDatabase();
    });

    let teacherUser;
    let teacher;
    let adminUser;
    let student;
    let course;
    let instance;

    beforeEach(async () => {
        await Promise.all([
            User.deleteMany({}),
            Teacher.deleteMany({}),
            Student.deleteMany({}),
            StudentEnrollment.deleteMany({}),
            Course.deleteMany({}),
            CourseInstance.deleteMany({}),
            Notification.deleteMany({}),
            Conversation.deleteMany({}),
            Message.deleteMany({}),
        ]);

        teacherUser = await User.create({
            email: "enhet-larare@mindful.se",
            password: "hashed-placeholder",
            roles: ["teacher"],
        });
        teacher = await Teacher.create({
            userId: teacherUser._id,
            subject: "Matematik",
        });
        adminUser = await User.create({
            email: "enhet-admin@mindful.se",
            password: "hashed-placeholder",
            roles: ["admin"],
        });
        student = await Student.create({
            name: "Test Elev",
            personalNumber: "19980101-0001",
            email: "enhet@elev.se",
        });
        course = await Course.create({
            courseName: "Matematik 1",
            courseCode: "MAT101",
        });
        instance = await CourseInstance.create({
            mainCourseId: course._id,
            startDate: new Date("2026-01-01"),
            endDate: new Date("2026-12-31"),
            courseName: course.courseName,
            courseCode: course.courseCode,
        });
        await StudentEnrollment.create({
            studentId: student._id,
            courseInstanceId: instance._id,
            mainCourseId: course._id,
            startDate: new Date("2026-02-01"),
            endDate: new Date("2026-08-01"),
            status: "active",
            teacherId: teacher._id,
        });
    });

    describe("resolveResponsibleTeacher", () => {
        it("resolves the responsible teacher from the first enrollment with a teacher", async () => {
            const result = await resolveResponsibleTeacher(student._id.toString());
            expect(result).not.toBeNull();
            expect(result.teacherId.toString()).toBe(teacher._id.toString());
            expect(result.userId.toString()).toBe(teacherUser._id.toString());
        });

        it("returns null when the student has no teacher on any enrollment", async () => {
            await StudentEnrollment.updateMany(
                { studentId: student._id },
                { $unset: { teacherId: 1 } }
            );
            expect(await resolveResponsibleTeacher(student._id.toString())).toBeNull();
        });
    });

    describe("ensureInactivityDiscussionThread", () => {
        it("creates a conversation with an opening message", async () => {
            const conversation = await ensureInactivityDiscussionThread({
                studentId: student._id.toString(),
                adminUserId: adminUser._id.toString(),
                teacherUserId: teacherUser._id.toString(),
                studentName: student.name,
                actionLabel: "Varningsmail skickat",
                signalSummary: "Test Elev — Senast inloggning: 6 dagar sedan.",
            });

            expect(conversation).toBeTruthy();
            expect(conversation.studentId.toString()).toBe(student._id.toString());
            expect(conversation.subject).toContain(student.name);

            const message = await Message.findOne({ conversationId: conversation._id }).lean();
            expect(message).toBeTruthy();
            expect(message.senderId.toString()).toBe(adminUser._id.toString());
            expect(message.body).toContain("Varningsmail skickat");
            expect(message.body).toContain("Senast inloggning: 6 dagar sedan");
        });

        it("reuses an existing thread with the same participants", async () => {
            const first = await ensureInactivityDiscussionThread({
                studentId: student._id.toString(),
                adminUserId: adminUser._id.toString(),
                teacherUserId: teacherUser._id.toString(),
                actionLabel: "Första",
            });
            const second = await ensureInactivityDiscussionThread({
                studentId: student._id.toString(),
                adminUserId: adminUser._id.toString(),
                teacherUserId: teacherUser._id.toString(),
                actionLabel: "Andra",
            });

            expect(second._id.toString()).toBe(first._id.toString());
            expect(await Conversation.countDocuments({ studentId: student._id })).toBe(1);
            expect(await Message.countDocuments()).toBe(1);
        });

        it("returns null when participants are missing", async () => {
            expect(
                await ensureInactivityDiscussionThread({
                    studentId: student._id.toString(),
                    adminUserId: adminUser._id.toString(),
                    teacherUserId: null,
                    actionLabel: "x",
                })
            ).toBeNull();
            expect(await Conversation.countDocuments({})).toBe(0);
        });
    });

    describe("notifyInactivityAction", () => {
        it("creates a notification for the responsible teacher", async () => {
            await notifyInactivityAction({
                studentId: student._id.toString(),
                studentName: student.name,
                teacherId: teacher._id,
                teacherUserId: teacherUser._id.toString(),
                adminUserId: adminUser._id.toString(),
                action: "warning_email",
            });

            const notification = await Notification.findOne({
                type: "inactivity_action",
                teacher: teacher._id,
            }).lean();
            expect(notification).toBeTruthy();
            expect(notification.meta.studentId.toString()).toBe(student._id.toString());
            expect(notification.meta.teacherId.toString()).toBe(teacherUser._id.toString());
            expect(notification.createdByAdmin.toString()).toBe(adminUser._id.toString());
            expect(notification.message).toContain(student.name);
        });

        it("updates the existing notification instead of duplicating on re-send", async () => {
            await notifyInactivityAction({
                studentId: student._id.toString(),
                studentName: student.name,
                teacherId: teacher._id,
                teacherUserId: teacherUser._id.toString(),
                adminUserId: adminUser._id.toString(),
                action: "warning_email",
                signalSummary: "första",
            });
            const created = await Notification.findOne({
                type: "inactivity_action",
                teacher: teacher._id,
            }).lean();
            created.resolvedByUsers = [adminUser._id];
            created.resolved = true;
            await Notification.updateOne({ _id: created._id }, { $set: { resolvedByUsers: created.resolvedByUsers, resolved: true } });

            await notifyInactivityAction({
                studentId: student._id.toString(),
                studentName: student.name,
                teacherId: teacher._id,
                teacherUserId: teacherUser._id.toString(),
                adminUserId: adminUser._id.toString(),
                action: "warning_email",
                signalSummary: "andra",
            });

            expect(await Notification.countDocuments({ type: "inactivity_action" })).toBe(1);
            const updated = await Notification.findById(created._id).lean();
            expect(updated.message).toContain("andra");
            expect(updated.message).not.toContain("första");
            expect(updated.resolved).toBe(false);
            expect(updated.resolvedByUsers).toEqual([]);
        });

        it("is a no-op without a teacher", async () => {
            await notifyInactivityAction({
                studentId: student._id.toString(),
                studentName: student.name,
                teacherId: null,
                teacherUserId: null,
                adminUserId: adminUser._id.toString(),
                action: "warning_email",
            });
            expect(
                await Notification.countDocuments({ type: "inactivity_action" })
            ).toBe(0);
        });
    });

    describe("safeInactivitySideEffect", () => {
        it("returns the result of a successful callback", async () => {
            expect(await safeInactivitySideEffect(async () => "ok", "test")).toBe("ok");
        });

        it("swallows errors and returns null", async () => {
            expect(
                await safeInactivitySideEffect(async () => {
                    throw new Error("boom");
                }, "test")
            ).toBeNull();
        });
    });

    describe("computeLiveInactivitySignal", () => {
        it("computes the live signal from a stale login", async () => {
            await User.create({
                email: student.email,
                password: "hashed-placeholder",
                roles: ["student"],
                lastLoginAt: new Date("2026-06-01T08:00:00.000Z"),
            });

            const signal = await computeLiveInactivitySignal({
                studentId: student._id.toString(),
                email: student.email,
                today: new Date("2026-06-15T12:00:00.000Z"),
            });

            expect(signal).not.toBeNull();
            expect(signal.daysSinceLastLogin).toBe(14);
            expect(signal.evaluated).toBe(true);
        });

        it("returns null when the student has no current enrollment", async () => {
            await StudentEnrollment.deleteMany({ studentId: student._id });

            const signal = await computeLiveInactivitySignal({
                studentId: student._id.toString(),
                email: student.email,
            });
            expect(signal).toBeNull();
        });
    });

    describe("summarizeInactivitySignal", () => {
        it("includes login, submission and level in Swedish", () => {
            const summary = summarizeInactivitySignal(
                {
                    daysSinceLastLogin: 6,
                    daysSinceLastSubmission: 4,
                    openSubmissions: 1,
                    level: "warning",
                },
                "Test Elev"
            );

            expect(summary).toContain("Test Elev");
            expect(summary).toContain("Senast inloggning: 6 dagar sedan");
            expect(summary).toContain("Senast inlämning: 4 dagar sedan");
            expect(summary).toContain("Öppna inlämningar: 1");
            expect(summary).toContain("Varningsnivå");
        });

        it("uses 'aldrig' for missing activity and flags withdraw level", () => {
            const summary = summarizeInactivitySignal({
                daysSinceLastLogin: null,
                daysSinceLastSubmission: null,
                openSubmissions: 0,
                level: "withdraw",
                daysUntilWithdraw: 0,
            });

            expect(summary).toContain("Senast inloggning: aldrig");
            expect(summary).toContain("Ska avslutas");
        });
    });
});
