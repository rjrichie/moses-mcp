import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseAreaModules } from "../../src/parsers/parseAreaModules.js";

const xml = readFileSync(path.resolve(__dirname, "../fixtures/area-expand-response.xml"), "utf8");

describe("parseAreaModules", () => {
  it("parses the module table out of the AJAX partial-response", () => {
    const modules = parseAreaModules(xml, "j_idt56:studiengangsbereich");
    expect(modules).toHaveLength(16);

    const algoDat = modules.find((m) => m.name === "Algorithmen und Datenstrukturen");
    expect(algoDat).toBeDefined();
    expect(algoDat?.moduleNumber).toBe("40022");
    expect(algoDat?.examType).toBe("Schriftliche Prüfung");
    expect(algoDat?.lp).toBe("6");

    const diskrete = modules.find((m) => m.name === "Diskrete Strukturen");
    expect(diskrete?.examType).toBe("Portfolioprüfung");
  });

  it("returns an empty array when the render target is not present", () => {
    expect(parseAreaModules(xml, "does-not-exist")).toEqual([]);
  });
});
