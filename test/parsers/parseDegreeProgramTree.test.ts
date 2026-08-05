import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { extractAreaExpandRequest, parseDegreeProgramTree } from "../../src/parsers/parseDegreeProgramTree.js";

const html = readFileSync(path.resolve(__dirname, "../fixtures/degree-program-tree.html"), "utf8");

describe("parseDegreeProgramTree", () => {
  it("parses the curriculum area tree and StuPO/semester pickers", () => {
    const structure = parseDegreeProgramTree(html, "31");

    expect(structure.mapped).toBe(true);
    expect(structure.selectedStupo?.label).toBe("StuPO 2015");
    expect(structure.selectedSemester?.label).toBe("WiSe 2025/26");
    expect(structure.availableStupos.length).toBeGreaterThanOrEqual(2);
    expect(structure.availableSemesters.length).toBeGreaterThan(10);

    const pflicht = structure.areas.find((a) => a.name === "Pflichtbereich");
    expect(pflicht).toBeDefined();
    expect(pflicht?.moduleCount).toBe(16);
    expect(pflicht?.lp).toBe("102");
    expect(pflicht?.rowKey).toBe("0_0");
  });
});

describe("extractAreaExpandRequest", () => {
  it("builds a POST request for a valid row key", () => {
    const structure = parseDegreeProgramTree(html, "31");
    const pflicht = structure.areas.find((a) => a.name === "Pflichtbereich")!;

    const req = extractAreaExpandRequest(html, pflicht.rowKey);
    expect(req.postUrl).toContain("anzeigen.html");
    expect(req.renderTarget).toContain("studiengangsbereich");
    expect(req.body.get("jakarta.faces.partial.ajax")).toBe("true");
    expect(req.body.get("jakarta.faces.behavior.event")).toBe("select");
    expect(Array.from(req.body.keys()).some((k) => k.endsWith("_selection"))).toBe(true);
  });

  it("throws for an unknown row key", () => {
    expect(() => extractAreaExpandRequest(html, "9_9")).toThrow();
  });
});
