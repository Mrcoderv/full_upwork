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
import mongoose from "mongoose";
import jwt from "jsonwebtoken";
import app from "../../index.js";
import Student from "../../src/models/Student.js";
import Course from "../../src/models/Course.js";
import Teacher from "../../src/models/Teacher.js";
import Notification from "../../src/models/Notification.js";
import ActionPlan from "../../src/models/ActionPlan.js";
import FormQuestions from "../../src/models/ActionPlanQuestions.js";
import GradeCatalog from "../../src/models/GradeCatalog.js";
import * as scriveClient from "../../src/services/scriveClient.js";
import {
    connectTestDatabase,
    disconnectTestDatabase,
} from "../helpers/mongoTest.js";

const signToken = (payload = {}) => {
    const fullPayload = {
        userId: new mongoose.Types.ObjectId().toString(),
        role: "teacher",
        name: "Test Lärare",
        email: "larare@test.se",
        ...payload,
    };
    return jwt.sign(fullPayload, process.env.JWT_SECRET || "test-secret");
};

describe("Sub-Phase 7: F-grade -> Notification -> Questionnaire -> Submit -> PDF -> Document & Scrive", () => {
    beforeAll(async () => {
        await connectTestDatabase();
    }, 60000);

    afterAll(async () => {
        await disconnectTestDatabase();
    }, 60000);

    beforeEach(async () => {
        await Student.deleteMany({});
        await Course.deleteMany({});
        await Teacher.deleteMany({});
        await Notification.deleteMany({});
        await ActionPlan.deleteMany({});
        await FormQuestions.deleteMany({});
        await GradeCatalog.deleteMany({});
    });

    afterEach(async () => {
        vi.restoreAllMocks();
        await Student.deleteMany({});
        await Course.deleteMany({});
        await Teacher.deleteMany({});
        await Notification.deleteMany({});
        await ActionPlan.deleteMany({});
        await FormQuestions.deleteMany({});
        await GradeCatalog.deleteMany({});
    });

    it("executes the complete F-grade -> Action Plan notification -> Questionnaire -> Submit -> PDF flow", async () => {
        // 1. Setup teacher and student with course
        const teacherUserId = new mongoose.Types.ObjectId();
        const teacherToken = signToken({
            userId: teacherUserId.toString(),
            role: "teacher",
            name: "Sven Svensson",
            email: "sven@skola.se",
        });

        const teacher = await Teacher.create({
            userId: teacherUserId,
            name: "Sven Svensson",
            email: "sven@skola.se",
            subject: "Svenska",
        });

        const course = await Course.create({
            courseCode: "SVASVE01",
            courseName: "Svenska som andraspråk 1",
            points: 100,
        });

        const student = await Student.create({
            name: "Karin Karlsson",
            personalNumber: "20010101-9988",
            email: "karin@elev.se",
            teacherId: teacher._id,
            education: [
                {
                    type: "Course",
                    refId: course._id,
                    name: "Svenska som andraspråk 1",
                    grade: "",
                    locked: false,
                },
            ],
        });

        // 2. Teacher attempts to set F grade without motivation -> rejected 400
        const badGradeRes = await request(app)
            .post("/api/teacher/save-grade")
            .set("Authorization", `Bearer ${teacherToken}`)
            .send({
                studentId: student._id.toString(),
                courseId: course._id.toString(),
                grade: "F",
                reason: "",
            })
            .expect(400);

        expect(badGradeRes.body).toEqual({
            error: "Motivering krävs vid betyg F",
        });

        // 3. Teacher gives F grade with valid motivation -> 200 OK
        const gradeRes = await request(app)
            .post("/api/teacher/save-grade")
            .set("Authorization", `Bearer ${teacherToken}`)
            .send({
                studentId: student._id.toString(),
                courseId: course._id.toString(),
                grade: "F",
                reason: "Ej uppnått målen i läsförståelse och skriftlig produktion",
            })
            .expect(200);

        expect(gradeRes.text).toContain("Betyg sparat");

        // 4. Verify action_plan_required notification was created for teacher and student
        const actionPlanNote = await Notification.findOne({
            studentId: student._id,
            type: "action_plan_required",
            resolved: false,
        });

        expect(actionPlanNote).not.toBeNull();
        expect(actionPlanNote.resolved).toBe(false);
        expect(actionPlanNote.message).toContain("Karin Karlsson");
        expect(actionPlanNote.teacher.toString()).toBe(teacher._id.toString());
        expect(actionPlanNote.meta.url).toBe(
            `/student/${student._id}?showActionPlan=true`
        );

        // Verify global action plan notification exists
        const globalNote = await Notification.findOne({
            type: "global_action_plan_required",
            resolved: false,
        });
        expect(globalNote).not.toBeNull();

        // 5. System Administrator configures questionnaire structure
        const adminToken = signToken({
            userId: new mongoose.Types.ObjectId().toString(),
            role: "systemadmin",
            name: "Admin",
        });

        const customQuestions = [
            {
                key: "teacherName",
                label: "Ansvarig lärare",
                type: "text",
                required: true,
            },
            {
                key: "date",
                label: "Datum",
                type: "date",
                required: true,
            },
            {
                key: "reason",
                label: "Orsak till handlingsplan",
                type: "textarea",
                required: true,
            },
            {
                key: "schoolEfforts",
                label: "Skolans insatser",
                type: "select",
                options: [
                    "Extra handledning och stöd",
                    "Anpassat studiematerial",
                ],
                required: true,
            },
            {
                key: "studentEfforts",
                label: "Elevens insatser",
                type: "select",
                options: ["Ökad närvaro", "Regelbundna inlämningar"],
                required: true,
            },
            {
                key: "studyTime",
                label: "Avsatt tid",
                type: "text",
                required: true,
            },
            {
                key: "specialPedagogSupport",
                label: "Specialpedagogiskt stöd",
                type: "radio",
                options: ["Ja", "Nej"],
                required: true,
            },
        ];

        await request(app)
            .put("/api/form-questions/ACTION_PLAN")
            .set("Authorization", `Bearer ${adminToken}`)
            .send({ questions: customQuestions })
            .expect(200);

        // 6. Teacher loads the questionnaire
        const formConfigRes = await request(app)
            .get("/api/form-questions/ACTION_PLAN")
            .set("Authorization", `Bearer ${teacherToken}`)
            .expect(200);

        expect(formConfigRes.body.type).toBe("ACTION_PLAN");
        expect(formConfigRes.body.questions).toHaveLength(7);
        expect(
            formConfigRes.body.questions.find((q) => q.key === "specialPedagogSupport")
        ).toBeDefined();

        // 7. Teacher fills out and submits the questionnaire
        const planPayload = {
            studentId: student._id.toString(),
            educationId: course._id.toString(),
            courseId: course._id.toString(),
            teacherName: "Sven Svensson",
            date: "2026-08-18",
            reason: "Ej uppnått godkänt betyg i delmoment läsförståelse.",
            schoolEfforts: ["Extra handledning och stöd"],
            studentEfforts: ["Regelbundna inlämningar", "Ökad närvaro"],
            studyTime: "2 timmar per vecka",
            meetings: ["Möte med studiehandledare 2026-08-20"],
            notified: ["Eleven meddelad muntligt och skriftligt"],
            specialPedagogSupport: "Ja",
        };

        const submitRes = await request(app)
            .post("/api/save-actionplan")
            .set("Authorization", `Bearer ${teacherToken}`)
            .send(planPayload)
            .expect(200);

        expect(submitRes.text).toBe("Handlingsplan sparad!");

        // 8. Verify the ActionPlan record was created and stored with PDF in MongoDB
        const storedPlan = await ActionPlan.findOne({ studentId: student._id });
        expect(storedPlan).not.toBeNull();
        expect(storedPlan.teacherName).toBe("Sven Svensson");
        expect(storedPlan.reason).toContain("Ej uppnått godkänt betyg");
        expect(storedPlan.pdf).toBeDefined();
        expect(Buffer.isBuffer(storedPlan.pdf)).toBe(true);
        expect(storedPlan.pdf.length).toBeGreaterThan(100);

        // 9. Verify the action_plan_required notification is now resolved
        const resolvedNote = await Notification.findOne({
            studentId: student._id,
            type: "action_plan_required",
        });
        expect(resolvedNote.resolved).toBe(true);

        // 10. Download generated PDF via GET /api/actionplan/:studentId/pdf
        const pdfRes = await request(app)
            .get(`/api/actionplan/${student._id}/pdf`)
            .set("Authorization", `Bearer ${teacherToken}`)
            .expect(200);

        expect(pdfRes.headers["content-type"]).toContain("application/pdf");
        expect(pdfRes.headers["content-disposition"]).toContain(
            `attachment; filename="handlingsplan-${storedPlan._id}.pdf"`
        );
        expect(Buffer.isBuffer(pdfRes.body)).toBe(true);

        const pdfContent = pdfRes.body.toString("latin1");
        expect(pdfContent.startsWith("%PDF-1.4")).toBe(true);
        expect(pdfContent).toContain("Karin Karlsson");
        expect(pdfContent).toContain("Handlingsplan");
        expect(pdfContent).toContain("Sven Svensson");
        expect(pdfContent).toContain("Extra handledning och stöd");
        expect(pdfContent).toContain("Specialpedagogiskt");

        // 11. Test downloading document directly via /api/actionplan/document/:id/pdf
        const docPdfRes = await request(app)
            .get(`/api/actionplan/document/${storedPlan._id}/pdf`)
            .set("Authorization", `Bearer ${teacherToken}`)
            .expect(200);

        expect(docPdfRes.headers["content-type"]).toContain("application/pdf");
        expect(docPdfRes.body.length).toBe(pdfRes.body.length);

        // 12. Test listing action plans for student
        const listRes = await request(app)
            .get(`/api/actionplans/${student._id}`)
            .set("Authorization", `Bearer ${teacherToken}`)
            .expect(200);

        expect(Array.isArray(listRes.body)).toBe(true);
        expect(listRes.body).toHaveLength(1);
        expect(listRes.body[0]._id.toString()).toBe(storedPlan._id.toString());
        expect(listRes.body[0].pdf).toBeUndefined(); // binary bytes excluded from list
    });

    it("handles Scrive grade-catalog signing lifecycle: upload -> send -> track status -> store signed document on closed", async () => {
        const adminToken = signToken({
            userId: new mongoose.Types.ObjectId().toString(),
            role: "admin",
            name: "Admin User",
        });

        // 1. Upload a GradeCatalog PDF
        const uploadRes = await request(app)
            .post("/api/grade-catalogs")
            .set("Authorization", `Bearer ${adminToken}`)
            .attach("file", Buffer.from("%PDF-1.4 dummy content"), "katalog_SVASVE01.pdf")
            .field("courseName", "Svenska som andraspråk 1")
            .field("teacherEmail", "teacher@skola.se")
            .field("teacherName", "Lärare Anna")
            .expect(201);

        expect(uploadRes.body.title).toBe("katalog_SVASVE01");
        expect(uploadRes.body.status).toBe("uploaded");

        const catalogId = uploadRes.body._id;

        // 2. Mock Scrive client calls
        vi.spyOn(scriveClient, "isScriveConfigured").mockReturnValue(true);
        vi.spyOn(scriveClient, "createDocument").mockResolvedValue({ id: "scrive-doc-123" });
        vi.spyOn(scriveClient, "updateDocument").mockResolvedValue({ id: "scrive-doc-123" });
        vi.spyOn(scriveClient, "startSigning").mockResolvedValue({
            id: "scrive-doc-123",
            status: "pending",
        });

        // 3. Send for signing
        const sendRes = await request(app)
            .post(`/api/grade-catalogs/${catalogId}/send`)
            .set("Authorization", `Bearer ${adminToken}`)
            .send({ teacherEmail: "teacher@skola.se" })
            .expect(200);

        expect(sendRes.body.status).toBe("pending");
        expect(sendRes.body.scriveDocumentId).toBe("scrive-doc-123");

        // Verify SIGNING_REQUIRED notification was created
        const signingNote = await Notification.findOne({
            type: "signing_required",
            resolved: false,
        });
        expect(signingNote).not.toBeNull();
        expect(signingNote.message).toContain("har skickats för signering");

        // 4. Poll / Refresh status before completion
        vi.spyOn(scriveClient, "getDocument").mockResolvedValue({
            id: "scrive-doc-123",
            status: "pending",
        });

        const refreshRes = await request(app)
            .post(`/api/grade-catalogs/${catalogId}/refresh`)
            .set("Authorization", `Bearer ${adminToken}`)
            .expect(200);

        expect(refreshRes.body.status).toBe("pending");

        // 5. Scrive status turns 'closed' (document signed) -> downloads and stores signed PDF
        const signedPdfBuffer = Buffer.from("%PDF-1.4 SIGNED-DOCUMENT-BYTES-FROM-SCRIVE");
        vi.spyOn(scriveClient, "getDocument").mockResolvedValue({
            id: "scrive-doc-123",
            status: "closed",
        });
        vi.spyOn(scriveClient, "getSignedDocumentFile").mockResolvedValue(signedPdfBuffer);

        const closedRefreshRes = await request(app)
            .post(`/api/grade-catalogs/${catalogId}/refresh`)
            .set("Authorization", `Bearer ${adminToken}`)
            .expect(200);

        expect(closedRefreshRes.body.status).toBe("closed");
        expect(closedRefreshRes.body.locked).toBe(true);

        // Verify stored catalog in database now contains the signed PDF and locked state
        const catalogInDb = await GradeCatalog.findById(catalogId);
        expect(catalogInDb.status).toBe("closed");
        expect(catalogInDb.locked).toBe(true);
        expect(catalogInDb.signedAt).toBeDefined();
        expect(catalogInDb.pdf.toString()).toBe(signedPdfBuffer.toString());

        // 6. Test callback webhook from Scrive also stores signed PDF
        const catalog2 = await GradeCatalog.create({
            title: "Katalog 2",
            filename: "katalog2.pdf",
            pdf: Buffer.from("%PDF-1.4 initial"),
            scriveDocumentId: "scrive-doc-456",
            status: "pending",
        });

        const signedPdf2 = Buffer.from("%PDF-1.4 SIGNED-CALLBACK-PDF");
        vi.spyOn(scriveClient, "getSignedDocumentFile").mockResolvedValue(signedPdf2);

        const callbackRes = await request(app)
            .post("/api/grade-catalogs/scrive-callback")
            .send({
                document_id: "scrive-doc-456",
                document_json: { status: "closed" },
            })
            .expect(200);

        expect(callbackRes.body.ok).toBe(true);

        const catalog2Db = await GradeCatalog.findById(catalog2._id);
        expect(catalog2Db.status).toBe("closed");
        expect(catalog2Db.locked).toBe(true);
        expect(catalog2Db.pdf.toString()).toBe(signedPdf2.toString());
    });
});
