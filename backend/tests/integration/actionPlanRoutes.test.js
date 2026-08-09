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
import express from "express";
import request from "supertest";
import mongoose from "mongoose";
import actionPlanRoutes from "../../src/router/actionPlanRoutes.js";
import ActionPlan from "../../src/models/ActionPlan.js";
import Notification from "../../src/models/Notification.js";
import FormQuestions from "../../src/models/ActionPlanQuestions.js";
import Student from "../../src/models/Student.js";
import {
    connectTestDatabase,
    disconnectTestDatabase,
} from "../helpers/mongoTest.js";

const buildApp = () => {
    const app = express();
    app.use(express.json());
    app.use((req, res, next) => {
        const role = req.get("x-test-user-role");
        const userId = req.get("x-test-user-id");
        if (role) {
            req.user = {
                role,
                _id: userId
                    ? new mongoose.Types.ObjectId(userId)
                    : new mongoose.Types.ObjectId(),
            };
        }
        next();
    });
    app.use("/api", actionPlanRoutes);
    return app;
};

describe("Action Plan Routes", () => {
    let app;

    beforeAll(async () => {
        await connectTestDatabase();
    }, 60000);

    afterAll(async () => {
        await disconnectTestDatabase();
    }, 60000);

    beforeEach(async () => {
        app = buildApp();
        await FormQuestions.deleteMany({});
        await ActionPlan.deleteMany({});
        await Notification.deleteMany({});
        await Student.deleteMany({});
    });

    afterEach(async () => {
        await FormQuestions.deleteMany({});
        await ActionPlan.deleteMany({});
        await Notification.deleteMany({});
        await Student.deleteMany({});
        vi.restoreAllMocks();
    });

    it("saves form questions and replaces existing config", async () => {
        const payload = {
            type: "ACTION_PLAN",
            questions: [
                {
                    key: "teacherName",
                    label: "Teacher",
                    type: "text",
                    required: true,
                },
            ],
        };

        const response = await request(app)
            .post("/api/form-questions")
            .set("x-test-user-role", "systemadmin")
            .send(payload)
            .expect(201);

        expect(response.body).toEqual({
            message: "Form questions saved successfully",
        });

        const savedConfigs = await FormQuestions.find({
            type: "ACTION_PLAN",
        });
        expect(savedConfigs).toHaveLength(1);
        expect(savedConfigs[0].questions).toHaveLength(1);
    });

    it("returns 500 when saving form questions fails", async () => {
        const response = await request(app)
            .post("/api/form-questions")
            .set("x-test-user-role", "systemadmin")
            .send({ type: "INVALID", questions: [] })
            .expect(500);

        expect(response.body).toEqual({ error: "Internal Server Error" });
    });

    it("returns default form questions when none exist", async () => {
        const response = await request(app)
            .get("/api/form-questions/ACTION_PLAN")
            .set("x-test-user-role", "teacher")
            .expect(200);

        expect(response.body.type).toBe("ACTION_PLAN");
        expect(response.body.questions.length).toBeGreaterThan(0);
        expect(response.body.questions[0].key).toBe("teacherName");

        const savedConfig = await FormQuestions.findOne({
            type: "ACTION_PLAN",
        });
        expect(savedConfig).not.toBeNull();
    });

    it("returns existing form questions when present", async () => {
        await FormQuestions.create({
            type: "ACTION_PLAN",
            questions: [
                {
                    key: "custom",
                    label: "Custom",
                    type: "text",
                    required: false,
                },
            ],
        });

        const response = await request(app)
            .get("/api/form-questions/ACTION_PLAN")
            .set("x-test-user-role", "teacher")
            .expect(200);

        expect(response.body.questions).toHaveLength(1);
        expect(response.body.questions[0].key).toBe("custom");
    });

    it("returns 500 when fetching form questions fails", async () => {
        vi.spyOn(FormQuestions, "findOne").mockRejectedValueOnce(
            new Error("Database failure")
        );

        const response = await request(app)
            .get("/api/form-questions/ACTION_PLAN")
            .set("x-test-user-role", "teacher")
            .expect(500);

        expect(response.body).toEqual({
            message: "Något gick fel",
            error: "Database failure",
        });
    });

    it("rejects updates when user is not systemadmin", async () => {
        const response = await request(app)
            .put("/api/form-questions/ACTION_PLAN")
            .set("x-test-user-role", "teacher")
            .send({ questions: [] })
            .expect(403);

        expect(response.body).toEqual({ message: "Ej behörig" });
    });

    it("updates form questions when systemadmin", async () => {
        const adminId = new mongoose.Types.ObjectId();
        const payload = {
            questions: [
                {
                    key: "reason",
                    label: "Reason",
                    type: "textarea",
                    required: true,
                },
            ],
        };

        const response = await request(app)
            .put("/api/form-questions/ACTION_PLAN")
            .set("x-test-user-role", "systemadmin")
            .set("x-test-user-id", adminId.toString())
            .send(payload)
            .expect(200);

        expect(response.body.type).toBe("ACTION_PLAN");
        expect(response.body.questions).toHaveLength(1);
        expect(response.body.createdBy).toBe(adminId.toString());
    });

    it("returns 500 when updating form questions fails", async () => {
        vi.spyOn(FormQuestions, "findOneAndUpdate").mockRejectedValueOnce(
            new Error("Update failed")
        );

        const response = await request(app)
            .put("/api/form-questions/ACTION_PLAN")
            .set("x-test-user-role", "systemadmin")
            .set("x-test-user-id", new mongoose.Types.ObjectId().toString())
            .send({ questions: [] })
            .expect(500);

        expect(response.body).toEqual({
            message: "Något gick fel",
            error: "Update failed",
        });
    });

    it("saves an action plan and resolves notification", async () => {
        const studentId = new mongoose.Types.ObjectId();
        const courseId = new mongoose.Types.ObjectId();
        const updateSpy = vi
            .spyOn(Notification, "updateOne")
            .mockResolvedValue({ acknowledged: true, modifiedCount: 0 });

        const response = await request(app)
            .post("/api/save-actionplan")
            .set("x-test-user-role", "teacher")
            .send({
                studentId,
                educationId: "EDU-1",
                courseId,
                teacherName: "Teacher",
            })
            .expect(200);

        expect(response.text).toBe("Handlingsplan sparad!");

        const savedPlan = await ActionPlan.findOne({ studentId });
        expect(savedPlan).not.toBeNull();
        expect(savedPlan.educationId).toBe("EDU-1");

        expect(updateSpy).toHaveBeenCalledWith(
            {
                studentId: studentId.toString(),
                courseId: courseId.toString(),
                type: "action_plan_required",
                resolved: false,
            },
            { $set: { resolved: true } }
        );
    });

    it("updates action plan settings", async () => {
        const updateSpy = vi
            .spyOn(ActionPlan, "updateOne")
            .mockResolvedValueOnce({ acknowledged: true, modifiedCount: 1 });
        const response = await request(app)
            .post("/api/update-actionplan")
            .set("x-test-user-role", "teacher")
            .send({
                teacherName: "Teacher",
                date: "2024-05-01",
                reason: "Reason",
                schoolEfforts: ["Effort"],
                studentEfforts: ["Effort"],
                studyTime: "2h",
                meetings: ["Meeting"],
                notified: ["Yes"],
            })
            .expect(200);

        expect(response.text).toBe("Inställningar uppdaterade!");
        expect(updateSpy).toHaveBeenCalledWith(
            { type: "settings" },
            {
                teacherName: "Teacher",
                date: "2024-05-01",
                reason: "Reason",
                schoolEfforts: ["Effort"],
                studentEfforts: ["Effort"],
                studyTime: "2h",
                meetings: ["Meeting"],
                notified: ["Yes"],
            },
            { upsert: true }
        );
    });

    it("returns 500 when updating action plan settings fails", async () => {
        vi.spyOn(ActionPlan, "updateOne").mockRejectedValueOnce(
            new Error("Update failed")
        );

        const response = await request(app)
            .post("/api/update-actionplan")
            .set("x-test-user-role", "teacher")
            .send({
                teacherName: "Teacher",
                date: "2024-05-01",
                reason: "Reason",
                schoolEfforts: ["Effort"],
                studentEfforts: ["Effort"],
                studyTime: "2h",
                meetings: ["Meeting"],
                notified: ["Yes"],
            })
            .expect(500);

        expect(response.text).toBe(
            "Serverfel vid uppdatering av inställningar."
        );
    });

    it("returns 404 when no action plan exists for a student", async () => {
        const studentId = new mongoose.Types.ObjectId();
        const response = await request(app)
            .get(`/api/actionplan/${studentId}`)
            .set("x-test-user-role", "teacher")
            .expect(404);

        expect(response.body).toEqual({ message: "Ingen handlingsplan hittad" });
    });

    it("returns 404 for pdf download when no action plan exists", async () => {
        const studentId = new mongoose.Types.ObjectId();
        const response = await request(app)
            .get(`/api/actionplan/${studentId}/pdf`)
            .set("x-test-user-role", "teacher")
            .expect(404);

        expect(response.body).toEqual({ message: "Ingen handlingsplan hittad" });
    });

    it("returns the latest saved action plan for a student", async () => {
        const studentId = new mongoose.Types.ObjectId();
        await request(app)
            .post("/api/save-actionplan")
            .set("x-test-user-role", "teacher")
            .send({
                studentId,
                educationId: "EDU-1",
                courseId: new mongoose.Types.ObjectId(),
                teacherName: "Teacher",
                reason: "Behöver stöd",
                schoolEfforts: ["Extra handledning"],
            })
            .expect(200);

        const response = await request(app)
            .get(`/api/actionplan/${studentId}`)
            .set("x-test-user-role", "teacher")
            .expect(200);

        expect(response.body.studentId).toBe(studentId.toString());
        expect(response.body.educationId).toBe("EDU-1");
        expect(response.body.reason).toBe("Behöver stöd");
        expect(response.body.schoolEfforts).toEqual(["Extra handledning"]);
    });

    it("returns 500 when fetching the action plan fails", async () => {
        vi.spyOn(ActionPlan, "findOne").mockReturnValueOnce({
            sort: vi.fn(() => Promise.reject(new Error("Database failure"))),
        });

        const studentId = new mongoose.Types.ObjectId();
        const response = await request(app)
            .get(`/api/actionplan/${studentId}`)
            .set("x-test-user-role", "teacher")
            .expect(500);

        expect(response.body).toEqual({
            message: "Något gick fel",
            error: "Database failure",
        });
    });

    it("downloads the saved action plan as a pdf", async () => {
        const student = await Student.create({
            name: "Anna Andersson",
            personalNumber: "20000101-1234",
            email: "anna@test.se",
        });

        await request(app)
            .post("/api/save-actionplan")
            .set("x-test-user-role", "teacher")
            .send({
                studentId: student._id,
                educationId: "EDU-1",
                teacherName: "Lärare",
                reason: "Behöver stöd",
                schoolEfforts: ["Extra handledning", "Tydliggöra mål"],
            })
            .expect(200);

        const response = await request(app)
            .get(`/api/actionplan/${student._id}/pdf`)
            .set("x-test-user-role", "teacher")
            .expect(200);

        expect(response.headers["content-type"]).toContain("application/pdf");
        expect(response.headers["content-disposition"]).toContain("attachment");
        expect(Buffer.isBuffer(response.body)).toBe(true);
        expect(response.body.subarray(0, 8).toString("latin1")).toBe("%PDF-1.4");

        const content = response.body.toString("latin1");
        expect(content).toContain("Anna Andersson");
        expect(content).toContain("Handlingsplan");
        expect(content).toContain("Extra handledning");
    });
});
