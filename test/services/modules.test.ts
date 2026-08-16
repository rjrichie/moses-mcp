import { beforeEach, describe, expect, it, vi } from "vitest";
import { mockApiFetchByIdlist, mockApiGet, mockApiGetById } from "./apiFixtures.js";

vi.mock("../../src/api/client.js", () => ({
  apiGet: mockApiGet,
  apiGetById: mockApiGetById,
  apiFetchByIdlist: mockApiFetchByIdlist,
}));
vi.mock("../../src/cache.js", () => ({
  cached: (_key: string, fn: () => Promise<unknown>) => fn(),
  peekCached: async () => undefined, // no usage index built — resolveUsedInPrograms should return [] gracefully
}));

describe("modules", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("getModuleDetails resolves the full description, correctly-ordered components, and empty usedInPrograms without an index", async () => {
    const { getModuleDetails } = await import("../../src/services/modules.js");

    const detail = await getModuleDetails("12345");

    expect(detail.moduleNumber).toBe("12345");
    expect(detail.version).toBe("3");
    expect(detail.title).toBe("Testmodul");
    expect(detail.lp).toBe("6");
    expect(detail.grading).toBe("Benotet");
    expect(detail.examType).toBe("Schriftliche Prüfung");
    expect(detail.startingSemesters).toBe("Wintersemester");
    expect(detail.orgUnit).toBe("FG Testgebiet");
    // faculty/institute are a known, documented fidelity gap — the granted API endpoints don't expose them.
    expect(detail.faculty).toBe("");
    expect(detail.institute).toBe("");

    // Components must come out sorted by `rang` (Vorlesung before Übung), not idlist-fetch order.
    expect(detail.components).toEqual([
      { name: "Testmodul", type: "Vorlesung", number: "0000 L 001", turnus: "Wintersemester", language: "de" },
      { name: "Testmodul", type: "Übung", number: "0000 L 001T", turnus: "Wintersemester", language: "de" },
    ]);

    expect(detail.usedInPrograms).toEqual([]);
  });

  it("getModuleDetails resolves a specific requested version, not just the latest", async () => {
    const { getModuleDetails } = await import("../../src/services/modules.js");
    const detail = await getModuleDetails("12345", { version: "3" });
    expect(detail.version).toBe("3");
  });

  it("searchModules resolves a numeric query via modulNummer and maps grading/examType", async () => {
    const { searchModules } = await import("../../src/services/modules.js");

    const results = await searchModules("54321");

    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({ moduleNumber: "54321", title: "Kernmodul A", version: "1" });
  });

  it("searchModules resolves a title query via modulTitel", async () => {
    const { searchModules } = await import("../../src/services/modules.js");
    const results = await searchModules("Testmodul");
    expect(results.map((r) => r.title)).toEqual(["Testmodul"]);
    expect(results[0].descriptionUrl).toContain("nummer=12345&version=3");
  });
});
