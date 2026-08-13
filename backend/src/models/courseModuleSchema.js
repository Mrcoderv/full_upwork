import mongoose from "mongoose";

// A section inside a module (each module contains exactly 2 sections by default).
// `instructions` holds the actual lesson/study content the student reads.
export const sectionSchema = new mongoose.Schema(
    {
        title: { type: String, default: "" },
        description: { type: String, default: "" },
        instructions: { type: String, default: "" },
    },
    { _id: false }
);

// A module inside a course template / course card
// 5 modules by default; module 3 = partial exams, module 5 = case study
export const courseModuleSchema = new mongoose.Schema(
    {
        moduleNumber: { type: Number, required: true },
        title: { type: String, default: "" },
        isPartialExam: { type: Boolean, default: false },
        isCaseStudy: { type: Boolean, default: false },
        sections: { type: [sectionSchema], default: [] },
        // Optional assignment the student submits for this module. Modules
        // without an assignment contribute nothing to the course progress.
        assignment: {
            title: { type: String, default: "" },
            description: { type: String, default: "" },
        },
    },
    { _id: false }
);

/**
 * Build the default 5-module structure with 2 sections each.
 * Module 3 is flagged as "partial exams" and module 5 as "case study".
 */
export const buildDefaultModules = () => {
    const modules = [];
    for (let i = 1; i <= 5; i++) {
        modules.push({
            moduleNumber: i,
            title: `Modul ${i}`,
            isPartialExam: i === 3,
            isCaseStudy: i === 5,
            sections: [
                { title: "Sektion 1", description: "", instructions: "" },
                { title: "Sektion 2", description: "", instructions: "" },
            ],
            assignment: { title: "", description: "" },
        });
    }
    return modules;
};

// Deep-clone module documents (for duplicating a template into course cards)
export const cloneModules = (modules) =>
    modules?.map((m) => ({
        moduleNumber: m.moduleNumber,
        title: m.title ?? "",
        isPartialExam: !!m.isPartialExam,
        isCaseStudy: !!m.isCaseStudy,
        sections: (m.sections || []).map((s) => ({
            title: s.title ?? "",
            description: s.description ?? "",
            instructions: s.instructions ?? "",
        })),
        assignment:
            m.assignment?.title || m.assignment?.description
                ? {
                      title: m.assignment.title ?? "",
                      description: m.assignment.description ?? "",
                  }
                : undefined,
    })) ?? [];
