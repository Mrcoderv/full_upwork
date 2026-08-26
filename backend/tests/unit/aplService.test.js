import { describe, it, expect, beforeEach, vi } from "vitest";

// ── Mock dependencies before importing the module under test ──────────────
const { AplRecordMock } = vi.hoisted(() => {
    const Mock = vi.fn(function (doc) {
        Object.assign(this, doc);
        this._id = (doc && doc._id) || "mock-apl-id";
        this.save = vi.fn().mockResolvedValue(this);
    });
    Mock.find = vi.fn().mockReturnValue({
        populate: vi.fn().mockResolvedValue([]),
        sort: vi.fn().mockReturnThis(),
        lean: vi.fn().mockResolvedValue([]),
    });
    Mock.findOne = vi.fn().mockResolvedValue(null);
    Mock.create = vi.fn().mockImplementation((doc) => Promise.resolve(new Mock(doc)));
    return { AplRecordMock: Mock };
});

vi.mock("../../src/models/AplRecord.js", () => ({
    default: AplRecordMock,
}));
vi.mock("../../src/models/Student.js", () => ({
    default: {
        find: vi.fn().mockReturnValue({ populate: vi.fn().mockReturnThis(), lean: vi.fn().mockResolvedValue([]) }),
        findById: vi.fn().mockResolvedValue(null),
    },
}));
vi.mock("../../src/models/Notification.js", () => ({
    default: { create: vi.fn().mockResolvedValue({}) },
}));
vi.mock("../../src/controllers/notificationTypes.js", () => ({
    default: { APL_WARNING: "apl_warning", APL_COMPLETE: "apl_complete" },
}));
vi.mock("../../src/services/emailService.js", () => ({
    sendEmail: vi.fn().mockResolvedValue({}),
    getEmailSignature: vi.fn().mockResolvedValue("Test School"),
}));
vi.mock("../../src/utils/aplAutoStatus.js", () => ({
    computeAplPeriod: vi.fn().mockReturnValue({ aplStartDate: null, aplEndDate: null }),
    computeAplEffectiveStatus: vi.fn().mockImplementation((status) => ({
        aplStatus: status,
        aplStatusStored: status,
        aplAutoRed: false,
        aplWeeksRemaining: null,
    })),
    APL_AUTO_RED_WEEKS: 3,
}));

import {
    APL_STATUSES,
    updateAplStatus,
    autoTransitionStatuses,
} from "../../src/services/aplService.js";
import AplRecord from "../../src/models/AplRecord.js";
import Student from "../../src/models/Student.js";

describe("APL Status Transitions", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe("APL_STATUSES constant", () => {
        it("defines all 6 statuses", () => {
            expect(APL_STATUSES).toEqual(["GRAY", "BLUE", "YELLOW", "PURPLE", "RED", "GREEN"]);
            expect(APL_STATUSES.length).toBe(6);
        });
    });

    describe("updateAplStatus", () => {
        it("rejects invalid status", async () => {
            await expect(
                updateAplStatus({ studentId: "id", status: "INVALID", userId: "uid" })
            ).rejects.toThrow("Invalid APL status");
        });

        it("creates AplRecord when none exists", async () => {
            const mockStudent = {
                _id: "student-1",
                aplStatus: "GRAY",
                education: [],
                aplStatusHistory: [],
                save: vi.fn(),
            };
            Student.findById.mockResolvedValue(mockStudent);
            AplRecord.findOne.mockResolvedValue(null);

            const result = await updateAplStatus({
                studentId: "student-1",
                status: "BLUE",
                reason: "Test",
                userId: "user-1",
            });

            expect(result.previousStatus).toBe("GRAY");
            expect(result.student.aplStatus).toBe("BLUE");
            expect(mockStudent.save).toHaveBeenCalled();
        });

        it("transitions GRAY → BLUE", async () => {
            const mockStudent = {
                _id: "s1", aplStatus: "GRAY", education: [], aplStatusHistory: [], save: vi.fn(),
            };
            const mockRecord = {
                _id: "r1", status: "GRAY", statusHistory: [], save: vi.fn(),
            };
            Student.findById.mockResolvedValue(mockStudent);
            AplRecord.findOne.mockResolvedValue(mockRecord);

            const result = await updateAplStatus({
                studentId: "s1", status: "BLUE", userId: "u1",
            });

            expect(result.previousStatus).toBe("GRAY");
            expect(result.student.aplStatus).toBe("BLUE");
            expect(mockRecord.status).toBe("BLUE");
            expect(mockRecord.save).toHaveBeenCalled();
        });

        it("transitions BLUE → YELLOW", async () => {
            const mockStudent = {
                _id: "s2", aplStatus: "BLUE", education: [], aplStatusHistory: [], save: vi.fn(),
            };
            const mockRecord = {
                _id: "r2", status: "BLUE", statusHistory: [], save: vi.fn(),
            };
            Student.findById.mockResolvedValue(mockStudent);
            AplRecord.findOne.mockResolvedValue(mockRecord);

            const result = await updateAplStatus({
                studentId: "s2", status: "YELLOW", userId: "u1",
            });

            expect(result.previousStatus).toBe("BLUE");
            expect(result.student.aplStatus).toBe("YELLOW");
        });

        it("transitions YELLOW → PURPLE", async () => {
            const mockStudent = {
                _id: "s3", aplStatus: "YELLOW", education: [], aplStatusHistory: [], save: vi.fn(),
            };
            const mockRecord = {
                _id: "r3", status: "YELLOW", statusHistory: [], save: vi.fn(),
            };
            Student.findById.mockResolvedValue(mockStudent);
            AplRecord.findOne.mockResolvedValue(mockRecord);

            const result = await updateAplStatus({
                studentId: "s3", status: "PURPLE", userId: "u1",
            });

            expect(result.previousStatus).toBe("YELLOW");
            expect(result.student.aplStatus).toBe("PURPLE");
        });

        it("transitions PURPLE → RED", async () => {
            const mockStudent = {
                _id: "s4", aplStatus: "PURPLE", education: [], aplStatusHistory: [], save: vi.fn(),
            };
            const mockRecord = {
                _id: "r4", status: "PURPLE", statusHistory: [], save: vi.fn(),
            };
            Student.findById.mockResolvedValue(mockStudent);
            AplRecord.findOne.mockResolvedValue(mockRecord);

            const result = await updateAplStatus({
                studentId: "s4", status: "RED", userId: "u1",
            });

            expect(result.previousStatus).toBe("PURPLE");
            expect(result.student.aplStatus).toBe("RED");
        });

        it("transitions RED → GREEN and marks completed", async () => {
            const mockStudent = {
                _id: "s5", aplStatus: "RED", education: [], aplStatusHistory: [], save: vi.fn(),
            };
            const mockRecord = {
                _id: "r5", status: "RED", statusHistory: [], save: vi.fn(),
            };
            Student.findById.mockResolvedValue(mockStudent);
            AplRecord.findOne.mockResolvedValue(mockRecord);

            const result = await updateAplStatus({
                studentId: "s5", status: "GREEN", userId: "u1",
            });

            expect(result.previousStatus).toBe("RED");
            expect(result.student.aplStatus).toBe("GREEN");
            expect(mockRecord.completedAt).toBeInstanceOf(Date);
            expect(mockRecord.completedBy).toBe("u1");
        });

        it("throws 404 for missing student", async () => {
            Student.findById.mockResolvedValue(null);

            await expect(
                updateAplStatus({ studentId: "nonexistent", status: "BLUE", userId: "u1" })
            ).rejects.toThrow("Student not found");
        });
    });

    describe("autoTransitionStatuses", () => {
        it("returns empty when no records to process", async () => {
            AplRecord.find.mockReturnValue({
                populate: vi.fn().mockResolvedValue([]),
            });

            const result = await autoTransitionStatuses();
            expect(result).toEqual([]);
        });
    });
});
