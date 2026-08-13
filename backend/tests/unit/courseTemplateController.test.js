import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/models/CourseTemplate.js", () => {
    const CourseTemplateMock = vi.fn(function (doc = {}) {
        Object.assign(this, doc);
        this.save = vi.fn().mockResolvedValue(this);
    });

    Object.assign(CourseTemplateMock, {
        find: vi.fn(),
        findById: vi.fn(),
        findByIdAndDelete: vi.fn(),
        create: vi.fn(),
    });

    return {
        __esModule: true,
        default: CourseTemplateMock,
    };
});
vi.mock("../../src/models/Course.js", () => ({
    __esModule: true,
    default: {
        find: vi.fn(),
        findById: vi.fn(),
    },
}));
vi.mock("../../src/models/courseModuleSchema.js", async (importOriginal) => {
    const actual = await importOriginal();
    return {
        __esModule: true,
        ...actual,
    };
});

import {
    getCourseTemplates,
    getCourseTemplateById,
    createCourseTemplate,
    updateCourseTemplate,
    deleteCourseTemplate,
    duplicateTemplateIntoCourseInstance,
} from "../../src/controllers/courseTemplateController.js";
import CourseTemplate from "../../src/models/CourseTemplate.js";
import Course from "../../src/models/Course.js";
import mongoose from "mongoose";

const VALID_USER_ID = new mongoose.Types.ObjectId().toString();

const createRes = () => {
    const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn().mockReturnThis(),
    };
    return res;
};

const defaultModules = () =>
    Array.from({ length: 5 }, (_, i) => ({
        moduleNumber: i + 1,
        title: `Modul ${i + 1}`,
        isPartialExam: i === 2,
        isCaseStudy: i === 4,
        sections: [
            { title: "Sektion 1", description: "" },
            { title: "Sektion 2", description: "" },
        ],
    }));

beforeEach(() => {
    vi.resetAllMocks();
    CourseTemplate.find.mockReturnValue({
        populate: vi.fn().mockReturnThis(),
        sort: vi.fn().mockReturnThis(),
        lean: vi.fn().mockResolvedValue([]),
    });
    CourseTemplate.findById.mockReturnValue({
        populate: vi.fn().mockReturnThis(),
        lean: vi.fn().mockResolvedValue(null),
    });
    Course.findById.mockResolvedValue(null);
});

describe("getCourseTemplates", () => {
    it("returns templates for an admin", async () => {
        const req = { query: {}, user: { userId: "u1", role: "admin" } };
        const res = createRes();

        await getCourseTemplates(req, res);

        expect(res.json).toHaveBeenCalledWith({ success: true, templates: [] });
        expect(CourseTemplate.find).toHaveBeenCalledWith({ isActive: true });
    });

    it("filters by courseId", async () => {
        const req = {
            query: { courseId: "course1" },
            user: { userId: "u1", role: "admin" },
        };
        const res = createRes();

        await getCourseTemplates(req, res);

        expect(CourseTemplate.find).toHaveBeenCalledWith({
            courseId: "course1",
            isActive: true,
        });
    });

    it("scopes teachers to their own templates", async () => {
        const req = { query: {}, user: { userId: "teacher1", role: "teacher" } };
        const res = createRes();

        await getCourseTemplates(req, res);

        expect(CourseTemplate.find).toHaveBeenCalledWith({
            isActive: true,
            $or: [{ createdBy: "teacher1" }, { createdBy: { $exists: false } }],
        });
    });

    it("returns 500 on error", async () => {
        CourseTemplate.find.mockReturnValue({
            populate: vi.fn().mockReturnThis(),
            sort: vi.fn().mockReturnThis(),
            lean: vi.fn().mockRejectedValue(new Error("db error")),
        });
        const req = { query: {}, user: { userId: "u1", role: "admin" } };
        const res = createRes();

        await getCourseTemplates(req, res);

        expect(res.status).toHaveBeenCalledWith(500);
        expect(res.json).toHaveBeenCalledWith({ error: "Internal server error" });
    });
});

describe("getCourseTemplateById", () => {
    it("returns a template when found", async () => {
        const template = { _id: "t1", templateName: "Demo" };
        CourseTemplate.findById.mockReturnValue({
            populate: vi.fn().mockReturnThis(),
            lean: vi.fn().mockResolvedValue(template),
        });
        const req = { params: { templateId: "t1" } };
        const res = createRes();

        await getCourseTemplateById(req, res);

        expect(res.json).toHaveBeenCalledWith({ success: true, template });
    });

    it("returns 404 when missing", async () => {
        const req = { params: { templateId: "t1" } };
        const res = createRes();

        await getCourseTemplateById(req, res);

        expect(res.status).toHaveBeenCalledWith(404);
        expect(res.json).toHaveBeenCalledWith({ error: "Course template not found" });
    });
});

describe("createCourseTemplate", () => {
    it("returns 400 when template name is missing", async () => {
        const req = { body: {}, user: { userId: "u1" } };
        const res = createRes();

        await createCourseTemplate(req, res);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith({ error: "Template name is required" });
    });

    it("returns 404 when the linked course is missing", async () => {
        const req = { body: { templateName: "Demo", courseId: "nope" }, user: { userId: "u1" } };
        const res = createRes();

        await createCourseTemplate(req, res);

        expect(res.status).toHaveBeenCalledWith(404);
        expect(res.json).toHaveBeenCalledWith({ error: "Course not found" });
    });

    it("creates a template with default 5-module structure", async () => {
        Course.findById.mockResolvedValue({ _id: "course1" });
        const created = {
            _id: "t1",
            templateName: "Demo",
            modules: defaultModules(),
        };
        CourseTemplate.create.mockResolvedValue(created);
        const req = { body: { templateName: "Demo", courseId: "course1" }, user: { userId: VALID_USER_ID } };
        const res = createRes();

        await createCourseTemplate(req, res);

        expect(CourseTemplate.create).toHaveBeenCalledTimes(1);
        const createArgs = CourseTemplate.create.mock.calls[0][0];
        expect(createArgs.templateName).toBe("Demo");
        expect(createArgs.createdBy).toBe(VALID_USER_ID);
        expect(createArgs.modules).toHaveLength(5);        expect(createArgs.modules[2].isPartialExam).toBe(true);
        expect(createArgs.modules[4].isCaseStudy).toBe(true);
        expect(createArgs.modules[0].sections).toHaveLength(2);

        expect(res.status).toHaveBeenCalledWith(201);
        expect(res.json).toHaveBeenCalledWith({ success: true, template: created });
    });

    it("uses provided modules when supplied", async () => {
        const modules = [
            {
                moduleNumber: 1,
                title: "Intro",
                isPartialExam: false,
                isCaseStudy: false,
                sections: [{ title: "A", description: "desc" }],
            },
        ];
        CourseTemplate.create.mockResolvedValue({ _id: "t2", templateName: "Custom", modules });
        const req = { body: { templateName: "Custom", modules }, user: { userId: "u1" } };
        const res = createRes();

        await createCourseTemplate(req, res);

        const createArgs = CourseTemplate.create.mock.calls[0][0];
        expect(createArgs.modules).toHaveLength(1);
        expect(createArgs.modules[0].title).toBe("Intro");
    });

    it("returns 500 on error", async () => {
        CourseTemplate.create.mockRejectedValue(new Error("db error"));
        const req = { body: { templateName: "Demo" }, user: { userId: "u1" } };
        const res = createRes();

        await createCourseTemplate(req, res);

        expect(res.status).toHaveBeenCalledWith(500);
    });
});

describe("updateCourseTemplate", () => {
    const templateInstance = (overrides = {}) => {
        const t = {
            _id: "t1",
            templateName: "Old",
            courseId: undefined,
            modules: defaultModules(),
            isActive: true,
            save: vi.fn().mockResolvedValue(this),
            ...overrides,
        };
        t.save = vi.fn().mockResolvedValue(t);
        return t;
    };

    it("returns 404 when template missing", async () => {
        CourseTemplate.findById.mockResolvedValue(null);
        const req = { params: { templateId: "t1" }, body: {} };
        const res = createRes();

        await updateCourseTemplate(req, res);

        expect(res.status).toHaveBeenCalledWith(404);
        expect(res.json).toHaveBeenCalledWith({ error: "Course template not found" });
    });

    it("updates name and modules", async () => {
        const instance = templateInstance();
        CourseTemplate.findById.mockResolvedValue(instance);
        const req = {
            params: { templateId: "t1" },
            body: { templateName: "New", modules: [{ moduleNumber: 1, title: "M1" }] },
        };
        const res = createRes();

        await updateCourseTemplate(req, res);

        expect(instance.templateName).toBe("New");
        expect(instance.modules).toHaveLength(1);
        expect(instance.save).toHaveBeenCalled();
        expect(res.json).toHaveBeenCalledWith({ success: true, template: instance });
    });

    it("validates the linked course when provided", async () => {
        const instance = templateInstance();
        CourseTemplate.findById.mockResolvedValue(instance);
        Course.findById.mockResolvedValue(null);
        const req = {
            params: { templateId: "t1" },
            body: { courseId: "nope" },
        };
        const res = createRes();

        await updateCourseTemplate(req, res);

        expect(res.status).toHaveBeenCalledWith(404);
    });
});

describe("deleteCourseTemplate", () => {
    it("deletes the template", async () => {
        CourseTemplate.findByIdAndDelete.mockResolvedValue({ _id: "t1" });
        const req = { params: { templateId: "t1" } };
        const res = createRes();

        await deleteCourseTemplate(req, res);

        expect(CourseTemplate.findByIdAndDelete).toHaveBeenCalledWith("t1");
        expect(res.json).toHaveBeenCalledWith({
            success: true,
            message: "Course template deleted",
        });
    });

    it("returns 404 when template missing", async () => {
        CourseTemplate.findByIdAndDelete.mockResolvedValue(null);
        const req = { params: { templateId: "t1" } };
        const res = createRes();

        await deleteCourseTemplate(req, res);

        expect(res.status).toHaveBeenCalledWith(404);
        expect(res.json).toHaveBeenCalledWith({ error: "Course template not found" });
    });
});

describe("duplicateTemplateIntoCourseInstance", () => {
    it("returns empty array when no templateId", async () => {
        const result = await duplicateTemplateIntoCourseInstance(undefined);
        expect(result).toEqual([]);
        expect(CourseTemplate.findById).not.toHaveBeenCalled();
    });

    it("returns empty array when template missing", async () => {
        CourseTemplate.findById.mockResolvedValue(null);
        const result = await duplicateTemplateIntoCourseInstance("t1");
        expect(result).toEqual([]);
    });

    it("clones modules from the template", async () => {
        CourseTemplate.findById.mockResolvedValue({
            modules: [
                {
                    moduleNumber: 3,
                    title: "Delprov",
                    isPartialExam: true,
                    isCaseStudy: false,
                    sections: [{ title: "S1", description: "d1" }],
                },
            ],
        });

        const result = await duplicateTemplateIntoCourseInstance("t1");

        expect(result).toEqual([
            {
                moduleNumber: 3,
                title: "Delprov",
                isPartialExam: true,
                isCaseStudy: false,
                sections: [{ title: "S1", description: "d1", instructions: "" }],
            },
        ]);
    });
});
