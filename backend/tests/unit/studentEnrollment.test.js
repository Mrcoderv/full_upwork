import {
    describe,
    it,
    expect,
    beforeAll,
    afterAll,
    beforeEach,
    afterEach,
} from "vitest";
import mongoose from "mongoose";
import StudentEnrollment from "../../src/models/StudentEnrollment.js";
import {
    connectTestDatabase,
    disconnectTestDatabase,
} from "../helpers/mongoTest.js";

const buildEnrollment = (overrides = {}) =>
    new StudentEnrollment({
        studentId: new mongoose.Types.ObjectId(),
        courseInstanceId: new mongoose.Types.ObjectId(),
        startDate: new Date("2024-01-01T00:00:00.000Z"),
        endDate: new Date("2024-02-01T00:00:00.000Z"),
        ...overrides,
    });

describe("StudentEnrollment model", () => {
    beforeAll(async () => {
        await connectTestDatabase();
    }, 60000);

    afterAll(async () => {
        await disconnectTestDatabase();
    }, 60000);

    beforeEach(async () => {
        await StudentEnrollment.deleteMany({});
    });

    afterEach(async () => {
        await StudentEnrollment.deleteMany({});
    });

    it("appends status history and clears temp fields on save", async () => {
        const updaterId = new mongoose.Types.ObjectId();
        const enrollment = buildEnrollment({ status: "active" });
        enrollment.updatedBy = updaterId;
        enrollment.statusChangeReason = "Initial enrollment";
        enrollment.statusChangeNotes = "Created via test";

        await enrollment.save();

        expect(enrollment.statusHistory).toHaveLength(1);
        expect(enrollment.statusHistory[0].status).toBe("active");
        expect(enrollment.statusHistory[0].changedBy.toString()).toBe(
            updaterId.toString()
        );
        expect(enrollment.statusHistory[0].reason).toBe("Initial enrollment");
        expect(enrollment.statusHistory[0].notes).toBe("Created via test");
        expect(enrollment.updatedBy).toBeUndefined();
        expect(enrollment.statusChangeReason).toBeUndefined();
        expect(enrollment.statusChangeNotes).toBeUndefined();
    });

    it("sets completion metadata when status changes to completed", async () => {
        const updaterId = new mongoose.Types.ObjectId();
        const enrollment = buildEnrollment();

        await enrollment.changeStatus(
            "completed",
            "Completed course",
            "All requirements met",
            updaterId
        );

        expect(enrollment.status).toBe("completed");
        expect(enrollment.completedAt).toBeInstanceOf(Date);
        expect(enrollment.statusHistory).toHaveLength(1);
        expect(enrollment.statusHistory[0].status).toBe("completed");
        expect(enrollment.statusHistory[0].changedBy.toString()).toBe(
            updaterId.toString()
        );
        expect(enrollment.statusHistory[0].reason).toBe("Completed course");
        expect(enrollment.statusHistory[0].notes).toBe("All requirements met");
    });

    it("auto-issues a stable certificate number on completion", async () => {
        const enrollment = buildEnrollment();

        await enrollment.changeStatus("completed");

        expect(enrollment.completionCertificate).toMatch(
            new RegExp(`^CERT-\\d{4}-${String(enrollment._id).slice(-8).toUpperCase()}$`)
        );
    });

    it("keeps the existing certificate number on re-completion", async () => {
        const enrollment = buildEnrollment();

        await enrollment.changeStatus("completed");
        const firstNumber = enrollment.completionCertificate;

        await enrollment.changeStatus("active");
        await enrollment.changeStatus("completed");

        expect(enrollment.completionCertificate).toBe(firstNumber);
    });

    it("does not issue a certificate number for non-completed statuses", async () => {
        const enrollment = buildEnrollment();

        await enrollment.changeStatus("active");

        expect(enrollment.completionCertificate).toBeNull();
    });

    it("sets dropout metadata when status changes to dropped", async () => {
        const updaterId = new mongoose.Types.ObjectId();
        const enrollment = buildEnrollment();

        await enrollment.changeStatus(
            "dropped",
            "Left early",
            "No longer attending",
            updaterId
        );

        expect(enrollment.status).toBe("dropped");
        expect(enrollment.dropoutDate).toBeInstanceOf(Date);
        expect(enrollment.dropoutBy.toString()).toBe(updaterId.toString());
        expect(enrollment.statusHistory).toHaveLength(1);
        expect(enrollment.statusHistory[0].status).toBe("dropped");
    });

    it("does not append status history when status is unchanged", async () => {
        const enrollment = buildEnrollment({ status: "active" });

        await enrollment.save();
        enrollment.notes = "updated notes";
        await enrollment.save();

        expect(enrollment.statusHistory).toHaveLength(1);
    });

    it("does not set completion or dropout fields for other statuses", async () => {
        const enrollment = buildEnrollment();

        await enrollment.changeStatus("active");

        expect(enrollment.completedAt).toBeNull();
        expect(enrollment.dropoutDate).toBeNull();
        expect(enrollment.dropoutBy).toBeUndefined();
    });

    it("calculates duration in days", () => {
        const enrollment = buildEnrollment({
            startDate: new Date("2024-01-01T00:00:00.000Z"),
            endDate: new Date("2024-01-02T12:00:00.000Z"),
        });

        expect(enrollment.getDuration()).toBe(2);
    });

    it("detects if an enrollment is currently active", () => {
        const activeEnrollment = buildEnrollment({
            status: "active",
            startDate: new Date(Date.now() - 24 * 60 * 60 * 1000),
            endDate: new Date(Date.now() + 24 * 60 * 60 * 1000),
        });

        expect(activeEnrollment.isCurrentlyActive()).toBe(true);

        const inactiveEnrollment = buildEnrollment({
            status: "completed",
            startDate: new Date(Date.now() - 24 * 60 * 60 * 1000),
            endDate: new Date(Date.now() + 24 * 60 * 60 * 1000),
        });

        expect(inactiveEnrollment.isCurrentlyActive()).toBe(false);
    });
});
