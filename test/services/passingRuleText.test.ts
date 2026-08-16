import { describe, expect, it } from "vitest";
import { templatePassingRule } from "../../src/services/passingRuleText.js";

describe("templatePassingRule", () => {
  it("templates BESTEHE_ALLE", () => {
    expect(templatePassingRule({ wahlregeltyp: "BESTEHE_ALLE" })).toBe("Must pass all modules in this area");
  });

  it("templates BESTEHE_MIN_LP / BESTEHE_MAX_LP (wertmin/wertmax, the legacy-model shape)", () => {
    expect(templatePassingRule({ wahlregeltyp: "BESTEHE_MIN_LP", wertmin: 6 })).toBe("At least 6 credits (LP)");
    expect(templatePassingRule({ wahlregeltyp: "BESTEHE_MAX_LP", wertmax: 9 })).toBe("At most 9 credits (LP)");
  });

  it("templates BESTEHE_MIN_LP / BESTEHE_MAX_LP (wert, the new-model shape)", () => {
    expect(templatePassingRule({ wahlregeltyp: "BESTEHE_MIN_LP", wert: 6 })).toBe("At least 6 credits (LP)");
    expect(templatePassingRule({ wahlregeltyp: "BESTEHE_MAX_LP", wert: 9 })).toBe("At most 9 credits (LP)");
  });

  it("templates BESTEHE_MIN_ANZAHL / BESTEHE_MAX_ANZAHL with singular/plural", () => {
    expect(templatePassingRule({ wahlregeltyp: "BESTEHE_MIN_ANZAHL", wert: 1 })).toBe("At least 1 module");
    expect(templatePassingRule({ wahlregeltyp: "BESTEHE_MAX_ANZAHL", wert: 2 })).toBe("At most 2 modules");
  });

  it("templates FREIE_WAHL", () => {
    expect(templatePassingRule({ wahlregeltyp: "FREIE_WAHL" })).toBe("Free choice (no additional restriction)");
  });

  it("templates BESTEHE_MIN_ANZAHL_IN with referenced sub-areas", () => {
    expect(
      templatePassingRule({
        wahlregeltyp: "BESTEHE_MIN_ANZAHL_IN",
        wert: 1,
        studiengangsbereichList: [{ id: 1253, name: "Kernmodule", mosesTypeCode: "studiengangsbereich" }],
      }),
    ).toBe("At least 1 module from: Kernmodule");
  });

  it("falls back gracefully for an unknown rule type instead of throwing", () => {
    expect(templatePassingRule({ wahlregeltyp: "SOME_NEW_RULE_TYPE", wert: 3 })).toBe("SOME_NEW_RULE_TYPE (3)");
    expect(templatePassingRule({ wahlregeltyp: "BESTEHE_MIN_SOMETHING_NEW", wert: 3 })).toBe(
      "At least 3 (BESTEHE_MIN_SOMETHING_NEW)",
    );
  });
});
