import { describe, it, expect } from "vitest";
import {
    buildDefaultModules,
    cloneModules,
} from "../../src/models/courseModuleSchema.js";

describe("courseModuleSchema helpers", () => {
    it("builds 5 modules with 2 sections each", () => {
        const modules = buildDefaultModules();

        expect(modules).toHaveLength(5);
        for (const module of modules) {
            expect(module.sections).toHaveLength(2);
        }
    });

    it("seeds empty instructions and assignment on every default module/section", () => {
        const modules = buildDefaultModules();

        for (const module of modules) {
            for (const section of module.sections) {
                expect(section).toHaveProperty("instructions", "");
            }
            expect(module).toHaveProperty("assignment");
            expect(module.assignment.title).toBe("");
            expect(module.assignment.description).toBe("");
        }
    });

    it("flags module 3 as partial exams and module 5 as case study", () => {
        const modules = buildDefaultModules();

        expect(modules[2].isPartialExam).toBe(true);
        expect(modules[2].isCaseStudy).toBe(false);
        expect(modules[4].isCaseStudy).toBe(true);
        expect(modules[4].isPartialExam).toBe(false);
        expect(modules[0].isPartialExam).toBe(false);
        expect(modules[0].isCaseStudy).toBe(false);
    });

    it("numbers modules 1 through 5", () => {
        const modules = buildDefaultModules();
        expect(modules.map((m) => m.moduleNumber)).toEqual([1, 2, 3, 4, 5]);
    });

    it("returns [] when cloning nothing", () => {
        expect(cloneModules()).toEqual([]);
        expect(cloneModules(null)).toEqual([]);
        expect(cloneModules([])).toEqual([]);
    });

    it("deep-clones modules and fills missing flags", () => {
        const original = [
            {
                moduleNumber: 3,
                title: "Delprov",
                isPartialExam: true,
                sections: [{ title: "S1", description: "d1" }],
            },
        ];
        const cloned = cloneModules(original);

        expect(cloned).toEqual([
            {
                moduleNumber: 3,
                title: "Delprov",
                isPartialExam: true,
                isCaseStudy: false,
                sections: [{ title: "S1", description: "d1", instructions: "" }],
            },
        ]);
        expect(cloned[0]).not.toBe(original[0]);
        expect(cloned[0].sections[0]).not.toBe(original[0].sections[0]);
    });

    it("clones section instructions and module assignment", () => {
        const original = [
            {
                moduleNumber: 1,
                title: "Modul 1",
                sections: [
                    { title: "S1", description: "d1", instructions: "Läs texten." },
                    { title: "S2", description: "d2" },
                ],
                assignment: { title: "Inlämning", description: "Skriv en text." },
            },
        ];
        const cloned = cloneModules(original);

        expect(cloned[0].sections[0].instructions).toBe("Läs texten.");
        expect(cloned[0].sections[1].instructions).toBe("");
        expect(cloned[0].assignment).toEqual({
            title: "Inlämning",
            description: "Skriv en text.",
        });
    });

    it("omits empty assignment objects when cloning", () => {
        const original = [
            {
                moduleNumber: 2,
                title: "Modul 2",
                sections: [{ title: "S1" }],
                assignment: { title: "", description: "" },
            },
        ];
        const cloned = cloneModules(original);

        expect(cloned[0].assignment).toBeUndefined();
    });
});
