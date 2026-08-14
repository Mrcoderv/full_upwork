import { describe, it, expect, vi } from "vitest";
import {
    computeInactivitySignal,
    ACTIVE_ENROLLMENT_STATUSES,
    INACTIVITY_WITHDRAW_DAYS,
    INACTIVITY_WARNING_DAYS,
} from "../../src/utils/inactivityStatus.js";

const today = new Date("2026-06-15T12:00:00");
const dateOffset = (days) => {
    const d = new Date(today);
    d.setDate(d.getDate() + days);
    return d;
};

const currentEnrollment = (opts = {}) => ({
    status: "active",
    startDate: dateOffset(-30),
    endDate: dateOffset(30),
    ...opts,
});

describe("inactivityStatus config", () => {
    it("exports the active enrollment statuses", () => {
        expect(ACTIVE_ENROLLMENT_STATUSES).toEqual(["enrolled", "active", "reviderad"]);
    });

    it("exports positive day thresholds", () => {
        expect(INACTIVITY_WITHDRAW_DAYS).toBeGreaterThanOrEqual(1);
        expect(INACTIVITY_WARNING_DAYS).toBeGreaterThanOrEqual(1);
    });

    it("reads thresholds from env when set", async () => {
        vi.resetModules();
        process.env.INACTIVITY_WITHDRAW_DAYS = "2";
        process.env.INACTIVITY_WARNING_DAYS = "3";
        const fresh = await import("../../src/utils/inactivityStatus.js");
        expect(fresh.INACTIVITY_WITHDRAW_DAYS).toBe(2);
        expect(fresh.INACTIVITY_WARNING_DAYS).toBe(3);
        delete process.env.INACTIVITY_WITHDRAW_DAYS;
        delete process.env.INACTIVITY_WARNING_DAYS;
    });
});

describe("computeInactivitySignal — evaluation", () => {
    it("does not evaluate a student without enrollments", () => {
        const signal = computeInactivitySignal({ lastLoginAt: dateOffset(-10), today });
        expect(signal.evaluated).toBe(false);
        expect(signal.relevantCount).toBe(0);
        expect(signal.mustWithdraw).toBe(false);
        expect(signal.inactiveForWarning).toBe(false);
        expect(signal.level).toBe("ok");
        expect(signal.windowStart).toBeNull();
        expect(signal.windowEnd).toBeNull();
    });

    it("does not evaluate terminal enrollments (completed/dropped)", () => {
        const signal = computeInactivitySignal({
            lastLoginAt: dateOffset(-10),
            enrollments: [
                currentEnrollment({ status: "completed" }),
                currentEnrollment({ status: "dropped" }),
            ],
            today,
        });
        expect(signal.evaluated).toBe(false);
        expect(signal.relevantCount).toBe(0);
    });

    it("does not evaluate enrollments that have already ended", () => {
        const signal = computeInactivitySignal({
            lastLoginAt: dateOffset(-10),
            enrollments: [currentEnrollment({ endDate: dateOffset(-1) })],
            today,
        });
        expect(signal.evaluated).toBe(false);
        expect(signal.relevantCount).toBe(0);
    });

    it("does not evaluate enrollments that have not started yet", () => {
        const signal = computeInactivitySignal({
            lastLoginAt: dateOffset(-10),
            enrollments: [currentEnrollment({ startDate: dateOffset(2) })],
            today,
        });
        expect(signal.evaluated).toBe(false);
        expect(signal.windowStart).not.toBeNull();
    });

    it("computes the enrollment window envelope and relevant count", () => {
        const signal = computeInactivitySignal({
            lastLoginAt: today,
            enrollments: [
                currentEnrollment({ startDate: dateOffset(-20), endDate: dateOffset(20) }),
                currentEnrollment({ startDate: dateOffset(-40), endDate: dateOffset(40) }),
                currentEnrollment({ status: "completed" }),
            ],
            today,
        });
        expect(signal.evaluated).toBe(true);
        expect(signal.relevantCount).toBe(2);
        expect(signal.windowStart.toISOString()).toBe(dateOffset(-40).toISOString());
        expect(signal.windowEnd.toISOString()).toBe(dateOffset(40).toISOString());
    });
});

describe("computeInactivitySignal — withdraw flag (login-based)", () => {
    it("does not flag a student who logged in today", () => {
        const signal = computeInactivitySignal({
            lastLoginAt: today,
            enrollments: [currentEnrollment()],
            today,
        });
        expect(signal.mustWithdraw).toBe(false);
        expect(signal.daysSinceLastLogin).toBe(0);
        expect(signal.daysUntilWithdraw).toBe(INACTIVITY_WITHDRAW_DAYS);
        expect(signal.level).toBe("ok");
    });

    it("flags at the exact withdraw boundary", () => {
        const signal = computeInactivitySignal({
            lastLoginAt: dateOffset(-INACTIVITY_WITHDRAW_DAYS),
            enrollments: [currentEnrollment()],
            today,
        });
        expect(signal.mustWithdraw).toBe(true);
        expect(signal.daysSinceLastLogin).toBe(INACTIVITY_WITHDRAW_DAYS);
        expect(signal.daysUntilWithdraw).toBe(0);
        expect(signal.level).toBe("withdraw");
    });

    it("does not flag one day before the withdraw boundary", () => {
        const signal = computeInactivitySignal({
            lastLoginAt: dateOffset(-(INACTIVITY_WITHDRAW_DAYS - 1)),
            enrollments: [currentEnrollment()],
            today,
        });
        expect(signal.mustWithdraw).toBe(false);
        expect(signal.daysUntilWithdraw).toBe(1);
        expect(signal.level).toBe("ok");
    });

    it("uses the enrollment window start as a proxy for never-logged-in students", () => {
        const signal = computeInactivitySignal({
            lastLoginAt: null,
            enrollments: [
                currentEnrollment({ startDate: dateOffset(-(INACTIVITY_WITHDRAW_DAYS + 2)) }),
            ],
            today,
        });
        expect(signal.daysSinceLastLogin).toBeNull();
        expect(signal.mustWithdraw).toBe(true);
        expect(signal.level).toBe("withdraw");
    });
});

describe("computeInactivitySignal — warning flag (activity-based)", () => {
    it("flags a student inactive beyond the warning threshold as both flags", () => {
        const signal = computeInactivitySignal({
            lastLoginAt: dateOffset(-INACTIVITY_WARNING_DAYS),
            enrollments: [currentEnrollment()],
            today,
        });
        expect(signal.inactiveForWarning).toBe(true);
        expect(signal.mustWithdraw).toBe(true);
        expect(signal.level).toBe("withdraw");
    });

    it("does not warn when a submission counts as recent activity", () => {
        const signal = computeInactivitySignal({
            lastLoginAt: dateOffset(-10),
            lastSubmissionAt: today,
            enrollments: [currentEnrollment()],
            today,
        });
        expect(signal.daysSinceLastSubmission).toBe(0);
        expect(signal.inactiveForWarning).toBe(false);
    });

    it("falls back to the window start when the student never logged in or submitted", () => {
        const signal = computeInactivitySignal({
            lastLoginAt: null,
            lastSubmissionAt: null,
            enrollments: [
                currentEnrollment({ startDate: dateOffset(-(INACTIVITY_WARNING_DAYS + 5)) }),
            ],
            today,
        });
        expect(signal.inactiveForWarning).toBe(true);
    });

    it("uses the most recent of login and submission as the activity basis", () => {
        const signal = computeInactivitySignal({
            lastLoginAt: dateOffset(-40),
            lastSubmissionAt: dateOffset(-3),
            enrollments: [currentEnrollment()],
            today,
        });
        expect(signal.daysSinceLastSubmission).toBe(3);
        expect(signal.inactiveForWarning).toBe(false);
    });
});

describe("computeInactivitySignal — schedule adherence", () => {
    it("reports open submissions", () => {
        const signal = computeInactivitySignal({
            lastLoginAt: today,
            openSubmissions: 3,
            enrollments: [currentEnrollment()],
            today,
        });
        expect(signal.openSubmissions).toBe(3);
    });

    it("defaults open submissions to 0", () => {
        const signal = computeInactivitySignal({
            lastLoginAt: today,
            enrollments: [currentEnrollment()],
            today,
        });
        expect(signal.openSubmissions).toBe(0);
    });

    it("exposes days since the last submission", () => {
        const signal = computeInactivitySignal({
            lastLoginAt: today,
            lastSubmissionAt: dateOffset(-6),
            enrollments: [currentEnrollment()],
            today,
        });
        expect(signal.daysSinceLastSubmission).toBe(6);
        expect(signal.daysSinceLastLogin).toBe(0);
    });
});
