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
                sections: [{ title: "S1", description: "d1" }],
            },
        ]);
        expect(cloned[0]).not.toBe(original[0]);
        expect(cloned[0].sections[0]).not.toBe(original[0].sections[0]);
    });
});
