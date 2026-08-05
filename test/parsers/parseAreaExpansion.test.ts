import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseAreaExpansion } from "../../src/parsers/parseAreaModules.js";

const pflichtXml = readFileSync(path.resolve(__dirname, "../fixtures/area-expand-response.xml"), "utf8");
const wahlpflichtXml = readFileSync(
  path.resolve(__dirname, "../fixtures/area-expand-response-wahlpflicht.xml"),
  "utf8",
);

describe("parseAreaExpansion", () => {
  it("parses a single-condition passing rule (Pflichtbereich: all modules required)", () => {
    const { modules, passingRules } = parseAreaExpansion(pflichtXml, "j_idt56:studiengangsbereich");
    expect(modules).toHaveLength(16);
    expect(passingRules).toEqual(["Alle Module dieses Studiengangsbereiches müssen bestanden werden."]);
  });

  it("parses multi-condition passing rules (Wahlpflicht: min/max credits)", () => {
    const { modules, passingRules } = parseAreaExpansion(wahlpflichtXml, "j_idt56:studiengangsbereich");
    expect(modules.length).toBeGreaterThan(0);
    expect(passingRules).toEqual([
      "Es müssen mindestens 6 Leistungspunkte bestanden werden.",
      "Es dürfen höchstens 9 Leistungspunkte bestanden werden.",
    ]);
  });

  it("returns empty modules and rules when the render target is not present", () => {
    expect(parseAreaExpansion(pflichtXml, "does-not-exist")).toEqual({ modules: [], passingRules: [] });
  });
});
