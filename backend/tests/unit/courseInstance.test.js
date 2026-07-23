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
import CourseInstance from "../../src/models/CourseInstance.js";
import { calculateSlutprovDate } from "../../src/utils/slutprovDateCalculator.js";
import {
    connectTestDatabase,
    disconnectTestDatabase,
} from "../helpers/mongoTest.js";

vi.mock("../../src/utils/slutprovDateCalculator.js", () => ({
    calculateSlutprovDate: vi.fn(),
}));

const buildInstance = (overrides = {}) =>
    new CourseInstance({
        mainCourseId: new mongoose.Types.ObjectId(),
        startDate: new Date("2024-01-01T00:00:00.000Z"),
        endDate: new Date("2024-02-01T00:00:00.000Z"),
        courseName: "Course A",
        courseCode: "C100",
        ...overrides,
    });

describe("CourseInstance model", () => {
    beforeAll(async () => {
        await connectTestDatabase();
    }, 60000);

    afterAll(async () => {
        await disconnectTestDatabase();
    }, 60000);

    beforeEach(async () => {
        await CourseInstance.deleteMany({});
    });

    afterEach(async () => {
        await CourseInstance.deleteMany({});
        calculateSlutprovDate.mockReset();
        vi.restoreAllMocks();
    });

    it("rejects endDate on or before startDate", async () => {
        const instance = buildInstance({
            startDate: new Date("2024-01-10T00:00:00.000Z"),
            endDate: new Date("2024-01-10T00:00:00.000Z"),
        });

        const error = await instance.validate().catch((err) => err);

        expect(error).toBeInstanceOf(mongoose.Error.ValidationError);
        expect(error.errors.endDate.message).toBe(
            "End date must be after start date"
        );
    });

    it("auto-calculates slutprovDate when responsibleTeacher is set", async () => {
        const calculatedDate = new Date("2024-02-10T00:00:00.000Z");
        calculateSlutprovDate.mockResolvedValue(calculatedDate);

        const instance = buildInstance({
            responsibleTeacher: new mongoose.Types.ObjectId(),
        });

        await instance.save();

        expect(calculateSlutprovDate).toHaveBeenCalledTimes(1);
        expect(instance.slutprovDate.toISOString()).toBe(
            calculatedDate.toISOString()
        );
    });

    it("continues saving when slutprovDate calculation fails", async () => {
        calculateSlutprovDate.mockRejectedValue(new Error("Boom"));

        const instance = buildInstance({
            responsibleTeacher: new mongoose.Types.ObjectId(),
        });

        await instance.save();

        expect(instance.slutprovDate).toBeUndefined();
    });

    it("checks date range overlap and duration", () => {
        const instance = buildInstance({
            startDate: new Date("2024-01-01T00:00:00.000Z"),
            endDate: new Date("2024-01-10T00:00:00.000Z"),
        });

        expect(
            instance.overlapsWith(
                new Date("2024-01-05T00:00:00.000Z"),
                new Date("2024-01-20T00:00:00.000Z")
            )
        ).toBe(true);
        expect(
            instance.overlapsWith(
                new Date("2024-01-10T00:00:00.000Z"),
                new Date("2024-01-15T00:00:00.000Z")
            )
        ).toBe(false);

        const durationInstance = buildInstance({
            startDate: new Date("2024-01-01T00:00:00.000Z"),
            endDate: new Date("2024-01-02T12:00:00.000Z"),
        });

        expect(durationInstance.getDuration()).toBe(2);
    });
});
