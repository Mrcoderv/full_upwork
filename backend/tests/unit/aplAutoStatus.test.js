import { describe, it, expect, vi } from "vitest";
import {
    computeAplPeriod,
    computeAplEffectiveStatus,
    APL_AUTO_RED_WEEKS,
} from "../../src/utils/aplAutoStatus.js";

describe("computeAplPeriod", () => {
    it("returns null dates for empty education", () => {
        expect(computeAplPeriod([])).toEqual({
            aplStartDate: null,
            aplEndDate: null,
        });
        expect(computeAplPeriod(undefined)).toEqual({
            aplStartDate: null,
            aplEndDate: null,
        });
    });

    it("computes the envelope over CoursePackage entries only", () => {
        const period = computeAplPeriod([
            {
                type: "CoursePackage",
                startDate: new Date("2025-04-01"),
                endDate: new Date("2025-06-30"),
            },
            {
                type: "CoursePackage",
                startDate: new Date("2025-05-01"),
                endDate: new Date("2025-07-15"),
            },
            {
                type: "Course",
                startDate: new Date("2030-01-01"),
                endDate: new Date("2030-02-01"),
            },
        ]);

        expect(period.aplStartDate.toISOString()).toBe(
            new Date("2025-04-01").toISOString()
        );
        expect(period.aplEndDate.toISOString()).toBe(
            new Date("2025-07-15").toISOString()
        );
    });

    it("ignores entries without valid dates", () => {
        const period = computeAplPeriod([
            { type: "CoursePackage", startDate: null, endDate: "not-a-date" },
            { type: "Course", startDate: new Date("2025-01-01"), endDate: new Date("2025-02-01") },
        ]);
        expect(period.aplStartDate).toBeNull();
        expect(period.aplEndDate).toBeNull();
    });
});

describe("computeAplEffectiveStatus", () => {
    const today = new Date("2026-06-15T12:00:00");

    it("defaults the threshold to 3 weeks", () => {
        expect(APL_AUTO_RED_WEEKS).toBe(3);
    });

    it("keeps the stored status when there is no APL end date", () => {
        const result = computeAplEffectiveStatus("BLUE", null, today);
        expect(result.aplStatus).toBe("BLUE");
        expect(result.aplStatusStored).toBe("BLUE");
        expect(result.aplAutoRed).toBe(false);
        expect(result.aplWeeksRemaining).toBeNull();
    });

    it("keeps the stored status when the end date is far in the future", () => {
        const result = computeAplEffectiveStatus(
            "YELLOW",
            new Date("2026-12-01"),
            today
        );
        expect(result.aplStatus).toBe("YELLOW");
        expect(result.aplAutoRed).toBe(false);
        expect(result.aplWeeksRemaining).toBe(25);
    });

    it("becomes RED when the APL ends within the threshold", () => {
        const result = computeAplEffectiveStatus(
            "GRAY",
            new Date("2026-06-28"),
            today
        );
        expect(result.aplStatus).toBe("RED");
        expect(result.aplStatusStored).toBe("GRAY");
        expect(result.aplAutoRed).toBe(true);
        expect(result.aplWeeksRemaining).toBe(2);
    });

    it("becomes RED exactly at the threshold boundary (3 weeks)", () => {
        const result = computeAplEffectiveStatus(
            "BLUE",
            new Date("2026-07-06"),
            today
        );
        expect(result.aplStatus).toBe("RED");
        expect(result.aplAutoRed).toBe(true);
        expect(result.aplWeeksRemaining).toBe(3);
    });

    it("becomes RED on the final day of the APL period", () => {
        const result = computeAplEffectiveStatus("GRAY", today, today);
        expect(result.aplStatus).toBe("RED");
        expect(result.aplAutoRed).toBe(true);
        expect(result.aplWeeksRemaining).toBe(0);
    });

    it("does NOT become RED after the APL period has ended", () => {
        const result = computeAplEffectiveStatus(
            "GREEN",
            new Date("2026-05-01"),
            today
        );
        expect(result.aplStatus).toBe("GREEN");
        expect(result.aplAutoRed).toBe(false);
        expect(result.aplWeeksRemaining).toBe(-6);
    });

    it("defaults to GRAY when no stored status is provided", () => {
        const result = computeAplEffectiveStatus(undefined, null, today);
        expect(result.aplStatus).toBe("GRAY");
    });

    it("reads the threshold from APL_AUTO_RED_WEEKS env when set", async () => {
        vi.resetModules();
        process.env.APL_AUTO_RED_WEEKS = "1";
        const fresh = await import("../../src/utils/aplAutoStatus.js");
        const result = fresh.computeAplEffectiveStatus(
            "GRAY",
            new Date("2026-07-05"),
            today
        );
        // 20 days away: within 3 weeks default but outside 1-week threshold
        expect(result.aplStatus).toBe("GRAY");
        expect(result.aplAutoRed).toBe(false);
        delete process.env.APL_AUTO_RED_WEEKS;
    });
});
