import * as cheerio from "cheerio";
import type { AreaModule } from "../types.js";

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Extract the rendered HTML fragment for `renderTarget` out of a PrimeFaces partial-response XML. */
export function extractRenderedFragment(ajaxResponseXml: string, renderTarget: string): string | undefined {
  const cdataRegex = new RegExp(`<update id="${escapeRegex(renderTarget)}"><!\\[CDATA\\[(.*?)\\]\\]></update>`, "s");
  return ajaxResponseXml.match(cdataRegex)?.[1];
}

function parseAreaModulesFragment(fragmentHtml: string): AreaModule[] {
  const $ = cheerio.load(fragmentHtml);
  const modules: AreaModule[] = [];

  $("table.ui-datatable-data tr, tbody tr").each((_, tr) => {
    const cells = $(tr).find("td");
    if (cells.length < 7) return;
    const nameLink = $(cells[0]).find("a");
    const numberLink = $(cells[1]).find("a");

    modules.push({
      name: nameLink.text().trim() || $(cells[0]).text().trim(),
      moduleNumber: numberLink.text().trim() || $(cells[1]).text().trim(),
      version: $(cells[2]).text().trim(),
      lp: $(cells[3]).text().trim(),
      graded: $(cells[4]).text().trim(),
      examType: $(cells[5]).text().trim(),
      turnus: $(cells[6]).text().trim(),
      weight: cells.length > 7 ? $(cells[7]).text().trim() : "",
      moduleUrl: nameLink.attr("href") ?? "",
    });
  });

  return modules;
}

/**
 * Parse the "Regeln zum Bestehen" (passing rules) for this area — e.g. credit
 * minimums/maximums or category requirements defined by the StuPO. These are
 * NOT implied by the module list alone and must be respected when composing
 * a study plan (see github.com/rjrichie/moses-mcp/issues/1).
 */
function parseAreaRulesFragment(fragmentHtml: string): string[] {
  const $ = cheerio.load(fragmentHtml);
  const rules: string[] = [];

  $("h5").each((_, h5el) => {
    if (!$(h5el).text().includes("Regeln zum Bestehen")) return;
    $(h5el)
      .next(".form-group")
      .find("li")
      .each((_, li) => {
        const text = $(li).text().trim();
        if (text) rules.push(text);
      });
    return false;
  });

  return rules;
}

/** Parse the PrimeFaces partial-response XML returned by the area-expand AJAX postback. */
export function parseAreaModules(ajaxResponseXml: string, renderTarget: string): AreaModule[] {
  const fragment = extractRenderedFragment(ajaxResponseXml, renderTarget);
  if (!fragment) return [];
  return parseAreaModulesFragment(fragment);
}

export interface AreaExpansion {
  modules: AreaModule[];
  /** StuPO-defined conditions for passing this area, e.g. credit min/max or category requirements. */
  passingRules: string[];
}

/** Parse both the module list and passing rules for an area-expand AJAX response. */
export function parseAreaExpansion(ajaxResponseXml: string, renderTarget: string): AreaExpansion {
  const fragment = extractRenderedFragment(ajaxResponseXml, renderTarget);
  if (!fragment) return { modules: [], passingRules: [] };
  return {
    modules: parseAreaModulesFragment(fragment),
    passingRules: parseAreaRulesFragment(fragment),
  };
}
