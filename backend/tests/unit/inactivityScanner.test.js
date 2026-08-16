import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import mongoose from "mongoose";

vi.mock("../../src/services/emailService.js", () => ({
    __esModule: true,
    sendInactivityWarningEmail: vi.fn(),
}));

import { sendInactivityWarningEmail } from "../../src/services/emailService.js";
import {
    runInactivityScan,
    getLastScanSummary,
} from "../../src/services/inactivityScanner.js";
import { connectTestDatabase, disconnectTestDatabase } from "../helpers/mongoTest.js";
import User from "../../src/models/User.js";
import Teacher from "../../src/models/Teacher.js";
import Student from "../../src/models/Student.js";
import StudentEnrollment from "../../src/models/StudentEnrollment.js";
import Course from "../../src/models/Course.js";
import CourseInstance from "../../src/models/CourseInstance.js";
import Notification from "../../src/models/Notification.js";
import ExamAttendance from "../../src/models/ExamAttendance.js";
import Provning from "../../src/models/Provning.js";
import Conversation from "../../src/models/Conversation.js";
import Message from "../../src/models/Message.js";

describe("inactivityScanner", () => {
    beforeAll(async () => {
        await connectTestDatabase();
    });

    afterAll(async () => {
        await disconnectTestDatabase();
    });

    let teacherUser;
    let teacher;
    let instance;
    let today;

    const daysAgo = (days) => {
        const d = new Date(today);
        d.setDate(d.getDate() - days);
        return d;
    };

    beforeEach(async () => {
        today = new Date();
        vi.clearAllMocks();
        sendInactivityWarningEmail.mockResolvedValue({ sent: true, result: {} });

        await Promise.all([
            User.deleteMany({}),
            Teacher.deleteMany({}),
            Student.deleteMany({}),
            StudentEnrollment.deleteMany({}),
            Course.deleteMany({}),
            CourseInstance.deleteMany({}),
            Notification.deleteMany({}),
            ExamAttendance.deleteMany({}),
            Provning.deleteMany({}),
            Conversation.deleteMany({}),
            Message.deleteMany({}),
        ]);

        teacherUser = await User.create({
            email: "auto-larare@mindful.se",
            password: "hashed-placeholder",
            roles: ["teacher"],
        });
        teacher = await Teacher.create({ userId: teacherUser._id, subject: "Matematik" });
        const course = await Course.create({
            courseName: "Matematik 1",
            courseCode: "MAT101",
        });
        instance = await CourseInstance.create({
            mainCourseId: course._id,
            startDate: daysAgo(60),
            endDate: new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000),
            courseName: course.courseName,
            courseCode: course.courseCode,
        });
    });

    const enrollStudent = async ({ email = "auto@elev.se", lastLoginDaysAgo = 20, startDaysAgo = 30, withEmail = true } = {}) => {
        const user = await User.create({
            email,
            password: "hashed-placeholder",
            roles: ["student"],
            lastLoginAt: daysAgo(lastLoginDaysAgo),
        });
        const student = await Student.create({
            name: "Auto Elev",
            personalNumber: `19980101-${Math.floor(Math.random() * 9000 + 1000)}`,
            email,
        });
        if (!withEmail) {
            await Student.updateOne({ _id: student._id }, { $unset: { email: "" } });
        }
        await StudentEnrollment.create({
            studentId: student._id,
            courseInstanceId: instance._id,
            mainCourseId: instance.mainCourseId,
            startDate: daysAgo(startDaysAgo),
            endDate: new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000),
            status: "active",
            teacherId: teacher._id,
        });
        return { user, student };
    };

    it("auto-sends a warning email to students past the warning threshold", async () => {
        const { student } = await enrollStudent({ lastLoginDaysAgo: 20 });

        const summary = await runInactivityScan({ today });

        expect(summary.warned).toBe(1);
        expect(sendInactivityWarningEmail).toHaveBeenCalledTimes(1);
        const call = sendInactivityWarningEmail.mock.calls[0][0];
        expect(call.email).toBe("auto@elev.se");
        expect(call.studentName).toBe("Auto Elev");
        expect(call.withdrawalDate).toBeInstanceOf(Date);

        // Audit trail recorded with the system actor.
        const reloaded = await Student.findById(student._id).lean();
        const entry = reloaded.changeHistory.find((e) =>
            e.changes.includes("inactivity_warning_email")
        );
        expect(entry).toBeTruthy();
        expect(entry.changedByRole).toBe("system");
        expect(entry.changes).toContain("auto");
        expect(entry.newValues.withdrawalDate).toBeInstanceOf(Date);

        // Responsible teacher was notified.
        const notification = await Notification.findOne({ type: "inactivity_action" }).lean();
        expect(notification).toBeTruthy();
        expect(String(notification.teacher)).toBe(String(teacher._id));
    });

    it("is idempotent — a re-run never sends a duplicate email", async () => {
        await enrollStudent({ lastLoginDaysAgo: 20 });

        const first = await runInactivityScan({ today });
        expect(first.warned).toBe(1);

        const second = await runInactivityScan({ today });
        expect(second.warned).toBe(0);
        expect(second.alreadyWarned).toBe(1);
        expect(sendInactivityWarningEmail).toHaveBeenCalledTimes(1);
    });

    it("does not warn students still within the activity window", async () => {
        await enrollStudent({ lastLoginDaysAgo: 3 });

        const summary = await runInactivityScan({ today });

        expect(summary.inactiveForWarning).toBe(0);
        expect(summary.warned).toBe(0);
        expect(sendInactivityWarningEmail).not.toHaveBeenCalled();
    });

    it("skips flagged students without an email address", async () => {
        await enrollStudent({ lastLoginDaysAgo: 20, withEmail: false });

        const summary = await runInactivityScan({ today });

        expect(summary.noEmail).toBe(1);
        expect(summary.warned).toBe(0);
        expect(sendInactivityWarningEmail).not.toHaveBeenCalled();
    });

    it("does not auto-send when automation is disabled but still counts flags", async () => {
        await enrollStudent({ lastLoginDaysAgo: 20 });

        const summary = await runInactivityScan({ today, autoSend: false });

        expect(summary.inactiveForWarning).toBe(1);
        expect(summary.warned).toBe(0);
        expect(sendInactivityWarningEmail).not.toHaveBeenCalled();
    });

    it("continues past per-student send failures and reports them", async () => {
        await enrollStudent({ lastLoginDaysAgo: 20 });
        sendInactivityWarningEmail.mockResolvedValue({ sent: false, reason: "send_failed" });

        const summary = await runInactivityScan({ today });

        expect(summary.failed).toBe(1);
        expect(summary.warned).toBe(0);
        expect(summary.failures[0].reason).toBe("send_failed");
    });

    it("exposes the last scan summary for the status endpoint", async () => {
        await enrollStudent({ lastLoginDaysAgo: 20 });

        const summary = await runInactivityScan({ today });

        expect(getLastScanSummary()).toMatchObject({
            evaluated: summary.evaluated,
            warned: 1,
        });
        expect(getLastScanSummary().lastScanAt).toBeInstanceOf(Date);
    });

    it("auto-withdraws once the warned withdrawal date has passed without activity", async () => {
        const { student } = await enrollStudent({ lastLoginDaysAgo: 20 });

        // Simulate a warning sent 10 days ago (deadline already past).
        await Student.updateOne(
            { _id: student._id },
            {
                $push: {
                    changeHistory: {
                        timestamp: daysAgo(10),
                        changedBy: null,
                        changedByRole: "system",
                        changes: ["inactivity_warning_email", "auto"],
                        newValues: { withdrawalDate: daysAgo(5) },
                    },
                },
            }
        );

        const summary = await runInactivityScan({ today });

        expect(summary.autoWithdrawn).toBe(1);
        expect(summary.withdrawPending).toBe(0);

        const reloaded = await Student.findById(student._id).lean();
        expect(reloaded.dropout).toBe(true);
        const markers = reloaded.changeHistory
            .filter((e) => e.changes?.includes("inactivity_auto_withdraw"))
            .map((e) => e.changedByRole);
        expect(markers).toContain("system");

        const enrollments = await StudentEnrollment.find({ studentId: student._id }).lean();
        expect(enrollments.length).toBeGreaterThan(0);
        expect(enrollments.every((e) => e.status === "dropped")).toBe(true);
    });

    it("does not auto-withdraw before the warned withdrawal date", async () => {
        const { student } = await enrollStudent({ lastLoginDaysAgo: 20 });

        await Student.updateOne(
            { _id: student._id },
            {
                $push: {
                    changeHistory: {
                        timestamp: today,
                        changedBy: null,
                        changedByRole: "system",
                        changes: ["inactivity_warning_email", "auto"],
                        newValues: { withdrawalDate: new Date(today.getTime() + 2 * 24 * 60 * 60 * 1000) },
                    },
                },
            }
        );

        const summary = await runInactivityScan({ today });

        expect(summary.autoWithdrawn).toBe(0);
        expect(summary.withdrawPending).toBe(1);
        expect((await Student.findById(student._id).lean()).dropout).toBeFalsy();
    });

    it("does not auto-withdraw students who resumed activity", async () => {
        const { student } = await enrollStudent({ lastLoginDaysAgo: 20 });

        await Student.updateOne(
            { _id: student._id },
            {
                $push: {
                    changeHistory: {
                        timestamp: daysAgo(10),
                        changedBy: null,
                        changedByRole: "system",
                        changes: ["inactivity_warning_email", "auto"],
                        newValues: { withdrawalDate: daysAgo(5) },
                    },
                },
            }
        );

        // Student logged in again 2 days ago — mustWithdraw flips off.
        await User.updateOne(
            { email: "auto@elev.se" },
            { lastLoginAt: daysAgo(2) }
        );

        const summary = await runInactivityScan({ today });

        expect(summary.autoWithdrawn).toBe(0);
        expect(summary.withdrawPending).toBe(0);
        expect((await Student.findById(student._id).lean()).dropout).toBeFalsy();
    });
});
