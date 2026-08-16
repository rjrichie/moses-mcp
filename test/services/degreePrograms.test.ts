import { beforeEach, describe, expect, it, vi } from "vitest";
import { mockApiFetchAllPages, mockApiFetchByIdlist, mockApiGet, mockApiGetById } from "./apiFixtures.js";

vi.mock("../../src/api/client.js", () => ({
  apiGet: mockApiGet,
  apiGetById: mockApiGetById,
  apiFetchByIdlist: mockApiFetchByIdlist,
  apiFetchAllPages: mockApiFetchAllPages,
}));
vi.mock("../../src/cache.js", () => ({
  cached: (_key: string, fn: () => Promise<unknown>) => fn(),
  peekCached: async () => undefined,
}));

describe("degreePrograms (legacy bolognamodulliste model)", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("resolves the curriculum structure, excluding the unnamed synthetic root group", async () => {
    const { getDegreeProgramStructure } = await import("../../src/services/degreePrograms.js");

    const structure = await getDegreeProgramStructure("1");

    expect(structure.name).toBe("Testprogramm");
    expect(structure.degreeType).toBe("Bachelor of Science");
    expect(structure.mapped).toBe(true);
    expect(structure.selectedStupo).toEqual({ value: "10", label: "Testprogramm (B. Sc.) - StuPO 2020" });
    expect(structure.selectedSemester).toEqual({ value: "50", label: "WiSe 2020/21" });

    // The unnamed root container (id 300) must never be surfaced as a selectable area.
    expect(structure.areas.map((a) => a.name)).toEqual(["Pflichtbereich"]);
    const pflicht = structure.areas[0];
    expect(pflicht.rowKey).toBe("lg:301");
    expect(pflicht.moduleCount).toBe(1);
    expect(pflicht.lp).toBe("6");
    expect(pflicht.path).toEqual(["Modulliste WiSe 2020/21", "Pflichtbereich"]);
  });

  it("lists area modules with templated passing rules and a resolved module number/version", async () => {
    const { listAreaModules } = await import("../../src/services/degreePrograms.js");

    const result = await listAreaModules("1", "10", "50", "Pflichtbereich");

    expect(result.passingRules).toEqual(["At least 6 credits (LP)", "At most 9 credits (LP)"]);
    expect(result.modules).toHaveLength(1);
    expect(result.modules[0]).toMatchObject({
      name: "Testmodul",
      moduleNumber: "12345",
      version: "3",
      lp: "6",
      graded: "Benotet",
      examType: "Schriftliche Prüfung",
      turnus: "Wintersemester",
    });
    expect(result.modules[0].moduleUrl).toContain("nummer=12345&version=3");
  });

  it("resolves an area by substring match when given a plain name", async () => {
    const { listAreaModules } = await import("../../src/services/degreePrograms.js");
    const result = await listAreaModules("1", "10", "50", "pflicht");
    expect(result.modules).toHaveLength(1);
  });
});

describe("degreePrograms (new studiengangsbereich model)", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("resolves the curriculum structure via the new model, with no semester axis", async () => {
    const { getDegreeProgramStructure } = await import("../../src/services/degreePrograms.js");

    const structure = await getDegreeProgramStructure("2");

    expect(structure.mapped).toBe(true);
    expect(structure.availableSemesters).toEqual([]);
    expect(structure.areas).toHaveLength(1);
    expect(structure.areas[0]).toMatchObject({ name: "Kernmodule", rowKey: "sb:900", moduleCount: 1, lp: "9" });
    expect(structure.areas[0].path).toEqual(["Testprogramm New Model (M. Sc.) - StuPO 2022", "Kernmodule"]);
  });

  it("lists area modules for the new model, including an ungraded module", async () => {
    const { listAreaModules } = await import("../../src/services/degreePrograms.js");

    const result = await listAreaModules("2", "11", "", "Kernmodule");

    expect(result.passingRules).toEqual(["Must pass all modules in this area"]);
    expect(result.modules[0]).toMatchObject({ name: "Kernmodul A", moduleNumber: "54321", graded: "Unbenotet", examType: "Portfolioprüfung" });
  });
});
