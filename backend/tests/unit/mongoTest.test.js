import mongoose from "mongoose";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
    connectTestDatabase,
    disconnectTestDatabase,
    getTestMongoUri,
} from "../helpers/mongoTest.js";

// Mock MongoMemoryServer
vi.mock("mongodb-memory-server", () => {
    return {
        MongoMemoryServer: {
            create: vi.fn().mockResolvedValue({
                getUri: vi.fn().mockReturnValue("mongodb://127.0.0.1:27017/mindful_test_mem"),
                stop: vi.fn().mockResolvedValue(true),
            })
        }
    }
});

describe("mongoTest helpers", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    afterEach(() => {
        vi.restoreAllMocks();
        mongoose.connection.readyState = 0;
    });

    it("connectTestDatabase calls mongoose.connect and returns the memory uri", async () => {
        const connectSpy = vi
            .spyOn(mongoose, "connect")
            .mockResolvedValueOnce();

        const uri = await connectTestDatabase();

        expect(connectSpy).toHaveBeenCalledOnce();
        expect(uri).toBe("mongodb://127.0.0.1:27017/mindful_test_mem");
        expect(getTestMongoUri()).toBe(uri);
    });

    it("disconnectTestDatabase drops and disconnects when connected", async () => {
        // Connect first so mongoServer is set
        mongoose.connection.readyState = 0;
        vi.spyOn(mongoose, "connect").mockResolvedValueOnce();
        await connectTestDatabase();
        
        mongoose.connection.readyState = 1;
        const dropSpy = vi
            .spyOn(mongoose.connection, "dropDatabase")
            .mockResolvedValueOnce();
        const disconnectSpy = vi
            .spyOn(mongoose, "disconnect")
            .mockResolvedValueOnce();

        await disconnectTestDatabase();

        expect(dropSpy).toHaveBeenCalledOnce();
        expect(disconnectSpy).toHaveBeenCalledOnce();
        expect(getTestMongoUri()).toBe("");
    });

    it("disconnectTestDatabase no-ops when already disconnected and no mongoServer", async () => {
        mongoose.connection.readyState = 0;
        const dropSpy = vi.spyOn(mongoose.connection, "dropDatabase");
        const disconnectSpy = vi.spyOn(mongoose, "disconnect");

        await disconnectTestDatabase();

        expect(dropSpy).not.toHaveBeenCalled();
        expect(disconnectSpy).not.toHaveBeenCalled();
    });
});
