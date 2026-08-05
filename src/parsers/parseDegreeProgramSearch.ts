import * as cheerio from "cheerio";
import type { DegreeProgramSummary } from "../types.js";

export function parseDegreeProgramSearch(html: string): DegreeProgramSummary[] {
  const $ = cheerio.load(html);
  const results: DegreeProgramSummary[] = [];

  $(".ui-datatable-data > tr").each((_, tr) => {
    const cells = $(tr).find("td");
    if (cells.length < 4) return;
    const nameLink = $(cells[0]).find("a").first();
    const href = nameLink.attr("href") ?? "";
    const idMatch = href.match(/studiengang=(\d+)/);
    if (!idMatch) return;

    results.push({
      id: idMatch[1],
      name: nameLink.text().trim(),
      shortName: $(cells[1]).text().trim(),
      degreeType: $(cells[2]).text().trim(),
      faculty: $(cells[3]).text().trim(),
      url: href,
    });
  });

  return results;
}
