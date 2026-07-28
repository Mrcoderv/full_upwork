import {
    describe,
    it,
    expect,
    beforeAll,
    afterAll,
    beforeEach,
    afterEach,
} from "vitest";
import request from "supertest";
import mongoose from "mongoose";
import express from "express";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import jwt from "jsonwebtoken";
import cookieParser from "cookie-parser";
import Document from "../../src/models/Document.js";
import documentRoutes from "../../src/router/documentRoutes.js";
import { AUTH_COOKIE_NAME } from "../../src/config/cookies.js";
import {
    connectTestDatabase,
    disconnectTestDatabase,
} from "../helpers/mongoTest.js";

let app;
const userId = new mongoose.Types.ObjectId().toString();
const uploadsDir = path.join(process.cwd(), "public", "uploads");
const createdFiles = new Set();
let authHeader;
let authCookie;

describe("Document Routes", () => {
    beforeAll(async () => {
        await connectTestDatabase();
        fs.mkdirSync(uploadsDir, { recursive: true });
        app = express();
        app.use(express.json());
        app.use(cookieParser());
        app.use("/api", documentRoutes);
        const token = jwt.sign(
            { userId, role: "admin", roles: ["admin"], name: "Tester" },
            process.env.JWT_SECRET || "test-secret"
        );
        authHeader = `Bearer ${token}`;
        authCookie = `${AUTH_COOKIE_NAME}=${token}`;
    }, 60000);

    afterAll(async () => {
        await disconnectTestDatabase();
    }, 60000);

    beforeEach(async () => {
        await Document.deleteMany({});
    });

    afterEach(() => {
        for (const filePath of createdFiles) {
            if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
            }
        }
        createdFiles.clear();
    });

    it("uploads a document and stores metadata", async () => {
        const studentId = new mongoose.Types.ObjectId();
        const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "doc-upload-"));
        const tempFile = path.join(tempDir, "report.txt");
        fs.writeFileSync(tempFile, "sample document");

        const response = await request(app)
            .post("/api/documents/upload")
            .set("Authorization", authHeader)
            .set("Cookie", authCookie)
            .field("studentId", studentId.toString())
            .field("type", "REPORT")
            .attach("file", tempFile)
            .expect(201);

        expect(response.body).toMatchObject({
            student: studentId.toString(),
            originalName: "report.txt",
            type: "REPORT",
        });
        expect(response.body.filename).toBeTruthy();

        const savedPath = path.join(uploadsDir, response.body.filename);
        createdFiles.add(savedPath);
        expect(fs.existsSync(savedPath)).toBe(true);
        fs.unlinkSync(tempFile);
        fs.rmdirSync(tempDir);
    });

    it("returns 500 when no file is provided", async () => {
        const response = await request(app)
            .post("/api/documents/upload")
            .set("Authorization", authHeader)
            .set("Cookie", authCookie)
            .field("studentId", new mongoose.Types.ObjectId().toString())
            .expect(400);

        expect(response.body).toMatchObject({
            message: "File is missing in the request",
        });
    });

    it("defaults document type when not provided", async () => {
        const studentId = new mongoose.Types.ObjectId();
        const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "doc-upload-"));
        const tempFile = path.join(tempDir, "general.txt");
        fs.writeFileSync(tempFile, "default type document");

        const response = await request(app)
            .post("/api/documents/upload")
            .set("Authorization", authHeader)
            .set("Cookie", authCookie)
            .field("studentId", studentId.toString())
            .attach("file", tempFile)
            .expect(201);

        expect(response.body).toMatchObject({
            student: studentId.toString(),
            originalName: "general.txt",
            type: "GENERAL",
        });

        const savedPath = path.join(uploadsDir, response.body.filename);
        createdFiles.add(savedPath);
        fs.unlinkSync(tempFile);
        fs.rmdirSync(tempDir);
    });

    it("returns documents for a student", async () => {
        const studentId = new mongoose.Types.ObjectId();
        const otherStudentId = new mongoose.Types.ObjectId();

        await Document.create([
            {
                student: studentId,
                filename: "file-one.pdf",
                originalName: "file-one.pdf",
                type: "GENERAL",
            },
            {
                student: studentId,
                filename: "file-two.pdf",
                originalName: "file-two.pdf",
                type: "REPORT",
            },
            {
                student: otherStudentId,
                filename: "file-three.pdf",
                originalName: "file-three.pdf",
                type: "GENERAL",
            },
        ]);

        const response = await request(app)
            .get(`/api/documents/${studentId.toString()}`)
            .set("Authorization", authHeader)
            .set("Cookie", authCookie)
            .expect(200);

        expect(response.body).toHaveLength(2);
        const filenames = response.body.map((doc) => doc.filename).sort();
        expect(filenames).toEqual(["file-one.pdf", "file-two.pdf"]);
    });

    it("supports filtering documents by type and enrollmentId", async () => {
        const studentId = new mongoose.Types.ObjectId();
        const enrollmentId = new mongoose.Types.ObjectId();

        await Document.create([
            {
                student: studentId,
                filename: "general.pdf",
                originalName: "general.pdf",
                type: "GENERAL",
                enrollmentId,
            },
            {
                student: studentId,
                filename: "report.pdf",
                originalName: "report.pdf",
                type: "REPORT",
                enrollmentId,
            },
            {
                student: studentId,
                filename: "report-other-enrollment.pdf",
                originalName: "report-other-enrollment.pdf",
                type: "REPORT",
                enrollmentId: new mongoose.Types.ObjectId(),
            },
        ]);

        const response = await request(app)
            .get(`/api/documents/${studentId.toString()}`)
            .set("Authorization", authHeader)
            .set("Cookie", authCookie)
            .query({ type: "REPORT", enrollmentId: enrollmentId.toString() })
            .expect(200);

        expect(response.body).toHaveLength(1);
        expect(response.body[0].filename).toBe("report.pdf");
    });

    it("deletes a document by id", async () => {
        const doc = await Document.create({
            student: new mongoose.Types.ObjectId(),
            filename: "to-delete.pdf",
            originalName: "to-delete.pdf",
            type: "GENERAL",
        });

        const response = await request(app)
            .delete(`/api/documents/${doc._id.toString()}`)
            .set("Authorization", authHeader)
            .set("Cookie", authCookie)
            .expect(200);

        expect(response.body).toEqual({ message: "Raderad" });
        const deleted = await Document.findById(doc._id);
        expect(deleted).toBeNull();
    });
});
