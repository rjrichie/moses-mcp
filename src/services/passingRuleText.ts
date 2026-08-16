/**
 * Turns the Moses API's structured passing-rule entities
 * (EStudiengangsbereichWahlregel | EBolognamodulListenwahlregel) into the
 * human-readable strings the `passingRules` field has always exposed.
 * Kept as prose rather than structured data because that's what MCP/LLM
 * consumers of this tool actually want, and it's what scripts/e2e-check.ts
 * already asserts against.
 */
import type { ERef } from "../api/entities.js";

export interface PassingRuleLike {
  wahlregeltyp: string;
  wert?: number;
  wertmin?: number;
  wertmax?: number;
  /** Only present on BESTEHE_MIN_ANZAHL_IN: the sub-areas to choose from. */
  studiengangsbereichList?: ERef[];
}

export function templatePassingRule(rule: PassingRuleLike): string {
  const n = rule.wert ?? rule.wertmin ?? rule.wertmax;

  switch (rule.wahlregeltyp) {
    case "BESTEHE_ALLE":
      return "Must pass all modules in this area";
    case "FREIE_WAHL":
      return "Free choice (no additional restriction)";
    case "BESTEHE_MIN_LP":
      return `At least ${n} credits (LP)`;
    case "BESTEHE_MAX_LP":
      return `At most ${n} credits (LP)`;
    case "BESTEHE_MIN_ANZAHL":
      return `At least ${n} module${n === 1 ? "" : "s"}`;
    case "BESTEHE_MAX_ANZAHL":
      return `At most ${n} module${n === 1 ? "" : "s"}`;
    case "BESTEHE_MIN_ANZAHL_IN": {
      const areas = rule.studiengangsbereichList?.map((a) => a.name).filter(Boolean);
      const from = areas && areas.length > 0 ? ` from: ${areas.join(", ")}` : "";
      return `At least ${n} module${n === 1 ? "" : "s"}${from}`;
    }
    default: {
      // Unseen rule type (new StuPOs may introduce ones not covered above):
      // fall back to a generic description rather than throwing.
      if (rule.wahlregeltyp.includes("_MIN_")) return `At least ${n} (${rule.wahlregeltyp})`;
      if (rule.wahlregeltyp.includes("_MAX_")) return `At most ${n} (${rule.wahlregeltyp})`;
      return n !== undefined ? `${rule.wahlregeltyp} (${n})` : rule.wahlregeltyp;
    }
  }
}
