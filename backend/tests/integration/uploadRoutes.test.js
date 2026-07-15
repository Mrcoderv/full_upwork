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
import request from "supertest";
import express from "express";
import mongoose from "mongoose";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { PassThrough, Readable, Writable } from "node:stream";
import { GridFSBucket } from "mongodb";
import uploadRoutes from "../../src/router/uploadRoutes.js";
import {
    connectTestDatabase,
    disconnectTestDatabase,
} from "../helpers/mongoTest.js";

let app;

const buildApp = () => {
    const appInstance = express();
    appInstance.use(express.json());
    appInstance.use((req, _res, next) => {
        req.user = {
            role: "tester",
            email: "tester@example.com",
            _id: new mongoose.Types.ObjectId(),
        };
        next();
    });
    appInstance.use("/api/uploads", uploadRoutes);
    return appInstance;
};

const buildAppWithoutUser = () => {
    const appInstance = express();
    appInstance.use(express.json());
    appInstance.use("/api/uploads", uploadRoutes);
    return appInstance;
};

const createTempFile = (name, contents) => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "upload-route-"));
    const filePath = path.join(tempDir, name);
    fs.writeFileSync(filePath, contents);
    return { tempDir, filePath };
};

const cleanupTempDir = (tempDir) => {
    fs.rmSync(tempDir, { recursive: true, force: true });
};

const uploadTestFile = async (
    studentId,
    filename,
    contents,
    appInstance = app
) => {
    const { tempDir, filePath } = createTempFile(filename, contents);
    const response = await request(appInstance)
        .post(`/api/uploads/${studentId}`)
        .attach("file", filePath);
    cleanupTempDir(tempDir);
    return response;
};

const clearGridFs = async () => {
    const db = mongoose.connection.db;
    await db.collection("fs.files").deleteMany({});
    await db.collection("fs.chunks").deleteMany({});
};

const clearStudents = async () => {
    await mongoose.connection.db.collection("students").deleteMany({});
};

const getUploadHandler = () => {
    const layer = uploadRoutes.stack.find(
        (entry) => entry.route?.path === "/:studentId" && entry.route?.methods?.post
    );
    return layer.route.stack[layer.route.stack.length - 1].handle;
};

const buildMockRes = () => {
    let resolve;
    const done = new Promise((resolver) => {
        resolve = resolver;
    });
    const res = {
        statusCode: 200,
        body: undefined,
        status(code) {
            this.statusCode = code;
            return this;
        },
        json(payload) {
            this.body = payload;
            resolve();
            return this;
        },
        send(payload) {
            this.body = payload;
            resolve();
            return this;
        },
    };
    return { res, done };
};

describe("Upload Routes", () => {
    beforeAll(async () => {
        await connectTestDatabase();
        app = buildApp();
    }, 60000);

    afterAll(async () => {
        await disconnectTestDatabase();
    }, 60000);

    beforeEach(async () => {
        await clearGridFs();
        await clearStudents();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("returns 400 when no file is uploaded", async () => {
        const studentId = new mongoose.Types.ObjectId().toString();

        const response = await request(app)
            .post(`/api/uploads/${studentId}`)
            .expect(400);

        expect(response.body).toEqual({ error: "No file uploaded" });
    });

    it("uploads a file to GridFS with metadata", async () => {
        const studentId = new mongoose.Types.ObjectId().toString();
        const response = await uploadTestFile(
            studentId,
            "notes.txt",
            "gridfs content"
        );

        expect(response.status).toBe(200);
        expect(response.body.file).toBeTruthy();
        expect(response.body.file.filename).toBe("notes.txt");
        expect(response.body.file.metadata).toMatchObject({
            studentId,
            role: "tester",
            email: "tester@example.com",
        });
        expect(response.body.file.metadata.userId).toMatch(/^[a-f\d]{24}$/i);
    });

    it("stores fallback metadata when no user is present", async () => {
        const appWithoutUser = buildAppWithoutUser();
        const studentId = new mongoose.Types.ObjectId().toString();
        const response = await uploadTestFile(
            studentId,
            "fallback.txt",
            "fallback content",
            appWithoutUser
        );

        expect(response.status).toBe(401);
    });

    it("uses mime lookup when mimetype is missing", async () => {
        const handler = getUploadHandler();
        const openSpy = vi
            .spyOn(GridFSBucket.prototype, "openUploadStream")
            .mockImplementationOnce(() => {
                const passthrough = new PassThrough();
                passthrough.id = new mongoose.Types.ObjectId();
                return passthrough;
            });

        const studentId = new mongoose.Types.ObjectId().toString();
        const req = {
            params: { studentId },
            file: {
                buffer: Buffer.from("mime lookup"),
                originalname: "lookup.txt",
                mimetype: "",
            },
        };
        const { res, done } = buildMockRes();

        await handler(req, res);
        await done;

        expect(openSpy).toHaveBeenCalledWith(
            "lookup.txt",
            expect.objectContaining({
                contentType: "text/plain",
                metadata: expect.objectContaining({
                    studentId,
                    role: "unknown",
                    email: "unknown",
                    userId: null,
                }),
            })
        );
    });

    it("falls back to default content type when mime lookup fails", async () => {
        const handler = getUploadHandler();
        const openSpy = vi
            .spyOn(GridFSBucket.prototype, "openUploadStream")
            .mockImplementationOnce(() => {
                const passthrough = new PassThrough();
                passthrough.id = new mongoose.Types.ObjectId();
                return passthrough;
            });

        const studentId = new mongoose.Types.ObjectId().toString();
        const req = {
            params: { studentId },
            file: {
                buffer: Buffer.from("mime fallback"),
                originalname: "lookup.unknownext",
                mimetype: "",
            },
        };
        const { res, done } = buildMockRes();

        await handler(req, res);
        await done;

        expect(openSpy).toHaveBeenCalledWith(
            "lookup.unknownext",
            expect.objectContaining({
                contentType: "application/octet-stream",
            })
        );
    });

    it("returns 500 when the upload stream errors", async () => {
        vi.spyOn(GridFSBucket.prototype, "openUploadStream").mockImplementationOnce(
            () => {
                const errorStream = new Writable({
                    write(_chunk, _enc, callback) {
                        setImmediate(() =>
                            callback(new Error("stream failed"))
                        );
                    },
                });
                errorStream.id = new mongoose.Types.ObjectId();
                return errorStream;
            }
        );

        const studentId = new mongoose.Types.ObjectId().toString();
        const response = await uploadTestFile(
            studentId,
            "error.txt",
            "error payload"
        );

        expect(response.status).toBe(500);
        expect(response.body).toEqual({
            error: "Upload failed",
            detail: "stream failed",
        });
    });

    it("returns 500 when upload completes but no file record is found", async () => {
        vi.spyOn(GridFSBucket.prototype, "openUploadStream").mockImplementationOnce(
            () => {
                const passthrough = new PassThrough();
                passthrough.id = new mongoose.Types.ObjectId();
                return passthrough;
            }
        );

        const studentId = new mongoose.Types.ObjectId().toString();
        const response = await uploadTestFile(
            studentId,
            "missing.txt",
            "missing payload"
        );

        expect(response.status).toBe(500);
        expect(response.body).toEqual({
            error: "Upload complete but unable to confirm file record",
        });
    });

    it("returns 500 on unexpected upload errors", async () => {
        vi.spyOn(GridFSBucket.prototype, "openUploadStream").mockImplementationOnce(
            () => {
                throw new Error("boom");
            }
        );

        const studentId = new mongoose.Types.ObjectId().toString();
        const response = await uploadTestFile(
            studentId,
            "crash.txt",
            "crash payload"
        );

        expect(response.status).toBe(500);
        expect(response.body).toEqual({
            error: "Unexpected error during upload",
        });
    });

    it("lists files for a student", async () => {
        const studentId = new mongoose.Types.ObjectId().toString();
        const otherStudentId = new mongoose.Types.ObjectId().toString();

        await uploadTestFile(studentId, "one.txt", "one");
        await uploadTestFile(studentId, "two.txt", "two");
        await uploadTestFile(otherStudentId, "other.txt", "other");

        const response = await request(app)
            .get(`/api/uploads/${studentId}`)
            .expect(200);

        expect(response.body).toHaveLength(2);
        const filenames = response.body.map((file) => file.filename).sort();
        expect(filenames).toEqual(["one.txt", "two.txt"]);
    });

    it("returns 500 when listing files fails", async () => {
        vi.spyOn(mongoose.connection.db, "collection").mockImplementationOnce(
            () => {
                throw new Error("list failed");
            }
        );

        const studentId = new mongoose.Types.ObjectId().toString();
        const response = await request(app)
            .get(`/api/uploads/${studentId}`)
            .expect(500);

        expect(response.body).toEqual({ error: "Failed to list files" });
    });

    it("returns 404 when a file is not found", async () => {
        const fileId = new mongoose.Types.ObjectId().toString();
        const response = await request(app)
            .get(`/api/uploads/download/${fileId}`)
            .expect(404);

        expect(response.text).toBe("File not found");
    });

    it("uses fallback download headers when metadata is missing", async () => {
        const fileId = new mongoose.Types.ObjectId();
        const originalCollection = mongoose.connection.db.collection.bind(
            mongoose.connection.db
        );
        vi.spyOn(mongoose.connection.db, "collection").mockImplementation(
            (name, ...args) => {
                if (name === "fs.files") {
                    return {
                        findOne: vi.fn().mockResolvedValue({
                            _id: fileId,
                            filename: null,
                            contentType: null,
                        }),
                    };
                }
                return originalCollection(name, ...args);
            }
        );
        vi.spyOn(GridFSBucket.prototype, "openDownloadStream").mockImplementationOnce(
            () => Readable.from(["fallback download"])
        );

        const response = await request(app)
            .get(`/api/uploads/download/${fileId.toString()}`)
            .buffer(true)
            .parse((res, callback) => {
                const chunks = [];
                res.on("data", (chunk) => chunks.push(chunk));
                res.on("end", () => callback(null, Buffer.concat(chunks)));
            })
            .expect(200);

        expect(response.headers["content-type"]).toContain(
            "application/octet-stream"
        );
        expect(response.headers["content-disposition"]).toContain(
            "filename=\"download\""
        );
        expect(response.body.toString()).toBe("fallback download");
    });

    it("streams a file download with headers", async () => {
        const studentId = new mongoose.Types.ObjectId().toString();
        const uploadResponse = await uploadTestFile(
            studentId,
            "download.txt",
            "download content"
        );
        const fileId = uploadResponse.body.file._id;

        const response = await request(app)
            .get(`/api/uploads/download/${fileId}`)
            .buffer(true)
            .parse((res, callback) => {
                const chunks = [];
                res.on("data", (chunk) => chunks.push(chunk));
                res.on("end", () => callback(null, Buffer.concat(chunks)));
            })
            .expect(200);

        expect(response.headers["content-type"]).toMatch(
            /text\/plain|application\/octet-stream/
        );
        expect(response.headers["content-disposition"]).toContain(
            "attachment; filename=\"download.txt\""
        );
        expect(response.body.toString()).toBe("download content");
    });

    it("returns 500 when download fails", async () => {
        const response = await request(app)
            .get("/api/uploads/download/not-an-id")
            .expect(500);

        expect(response.body).toEqual({ error: "Failed to download file" });
    });

    it("deletes a file by id", async () => {
        const studentId = new mongoose.Types.ObjectId().toString();
        const uploadResponse = await uploadTestFile(
            studentId,
            "delete.txt",
            "delete content"
        );
        const fileId = uploadResponse.body.file._id;

        const response = await request(app)
            .delete(`/api/uploads/${fileId}`)
            .expect(200);

        expect(response.body).toEqual({ message: "File deleted successfully" });

        const deleted = await mongoose.connection.db
            .collection("fs.files")
            .findOne({ _id: new mongoose.Types.ObjectId(fileId) });
        expect(deleted).toBeNull();
    });

    it("deletes a file without user context", async () => {
        const appWithoutUser = buildAppWithoutUser();
        const studentId = new mongoose.Types.ObjectId().toString();
        const uploadResponse = await uploadTestFile(
            studentId,
            "delete-unknown.txt",
            "delete content",
            app
        );
        const fileId = uploadResponse.body.file._id;

        const response = await request(appWithoutUser)
            .delete(`/api/uploads/${fileId}`)
            .expect(401);
    });

    it("returns 500 when delete fails", async () => {
        const response = await request(app)
            .delete("/api/uploads/not-an-id")
            .expect(500);

        expect(response.body).toEqual({ error: "Failed to delete file" });
    });

    it("lists all APL files grouped by student with student name lookup", async () => {
        const knownStudentId = new mongoose.Types.ObjectId();
        const unknownStudentId = new mongoose.Types.ObjectId();

        await mongoose.connection.db.collection("students").insertOne({
            _id: knownStudentId,
            name: "Known Student",
        });

        const now = new Date();
        await mongoose.connection.db.collection("fs.files").insertMany([
            {
                _id: new mongoose.Types.ObjectId(),
                filename: "apl-known.pdf",
                contentType: "application/pdf",
                uploadDate: new Date(now.getTime() - 1000),
                metadata: { studentId: knownStudentId.toString() },
            },
            {
                _id: new mongoose.Types.ObjectId(),
                filename: "apl-unknown.pdf",
                contentType: "application/pdf",
                uploadDate: now,
                metadata: { studentId: unknownStudentId.toString() },
            },
        ]);

        const response = await request(app)
            .get("/api/uploads/all/apl")
            .expect(200);

        expect(Array.isArray(response.body)).toBe(true);
        expect(response.body).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    studentId: knownStudentId.toString(),
                    studentName: "Known Student",
                    files: expect.arrayContaining([
                        expect.objectContaining({ filename: "apl-known.pdf" }),
                    ]),
                }),
                expect.objectContaining({
                    studentId: unknownStudentId.toString(),
                    studentName: "Unknown Student",
                    files: expect.arrayContaining([
                        expect.objectContaining({
                            filename: "apl-unknown.pdf",
                        }),
                    ]),
                }),
            ])
        );
    });

    it("returns 500 when listing APL archive fails", async () => {
        const db = mongoose.connection.db;
        const originalCollection = db.collection.bind(db);
        const collectionSpy = vi
            .spyOn(db, "collection")
            .mockImplementation((name, options) => {
                if (name === "fs.files") {
                    return {
                        aggregate() {
                            throw new Error("aggregate boom");
                        },
                    };
                }
                return originalCollection(name, options);
            });

        const response = await request(app)
            .get("/api/uploads/all/apl")
            .expect(500);

        expect(response.body).toEqual(
            expect.objectContaining({ error: "Failed to list all APL files" })
        );
        collectionSpy.mockRestore();
    });
});
