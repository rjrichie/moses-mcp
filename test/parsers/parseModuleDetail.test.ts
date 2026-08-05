import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseModuleDetail } from "../../src/parsers/parseModuleDetail.js";

const html = readFileSync(path.resolve(__dirname, "../fixtures/module-detail.html"), "utf8");

describe("parseModuleDetail", () => {
  it("parses the full module version description", () => {
    const detail = parseModuleDetail(html);

    expect(detail.moduleNumber).toBe("40022");
    expect(detail.version).toBe("11");
    expect(detail.title).toBe("Algorithmen und Datenstrukturen");
    expect(detail.lp).toBe("6");
    expect(detail.grading).toBe("Benotet");
    expect(detail.examType).toBe("Schriftliche Prüfung");
    expect(detail.faculty).toBe("Fakultät IV");
    expect(detail.learningOutcomes).toContain("Datenstrukturen und Algorithmen");
    expect(detail.content).toContain("Backtracking");
  });

  it("parses the cross-program usage table", () => {
    const detail = parseModuleDetail(html);
    expect(detail.usedInPrograms.length).toBeGreaterThan(0);

    const informatik = detail.usedInPrograms.find((p) => p.programName.startsWith("Informatik"));
    expect(informatik).toBeDefined();
    expect(informatik?.programUrl).toContain("studiengang=");

    const ces = detail.usedInPrograms.find((p) => p.programName.includes("Computational Engineering Science"));
    expect(ces).toBeDefined();
    expect(ces?.firstUsed).toBe("SoSe 2026");
  });
});
