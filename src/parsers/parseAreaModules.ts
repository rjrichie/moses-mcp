import * as cheerio from "cheerio";
import type { AreaModule } from "../types.js";

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Parse the PrimeFaces partial-response XML returned by the area-expand AJAX postback. */
export function parseAreaModules(ajaxResponseXml: string, renderTarget: string): AreaModule[] {
  const cdataRegex = new RegExp(`<update id="${escapeRegex(renderTarget)}"><!\\[CDATA\\[(.*?)\\]\\]></update>`, "s");
  const match = ajaxResponseXml.match(cdataRegex);
  if (!match) return [];
  const fragmentHtml = match[1];

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
