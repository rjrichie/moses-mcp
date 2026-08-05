import * as cheerio from "cheerio";
import type { ModuleSearchResult } from "../types.js";

export function parseModuleSearch(html: string): ModuleSearchResult[] {
  const $ = cheerio.load(html);
  const results: ModuleSearchResult[] = [];

  $("tbody[id$='_data'] > tr").each((_, tr) => {
    const cells = $(tr).find("td");
    if (cells.length < 9) return;

    const numberCell = $(cells[0]);
    const numberLink = numberCell.find("a").first();
    const versionSmall = numberCell.find("small").first().text().trim(); // "(7)"
    const version = versionSmall.replace(/[()]/g, "");

    const titleLink = $(cells[2]).find("a").first();

    results.push({
      moduleNumber: numberLink.text().trim(),
      version,
      title: titleLink.text().trim() || $(cells[2]).text().trim(),
      languages: $(cells[4]).text().trim(),
      lp: $(cells[5]).text().trim(),
      grading: $(cells[6]).text().trim(),
      responsiblePerson: $(cells[7]).text().trim(),
      orgUnit: $(cells[8]).text().trim(),
      descriptionUrl: titleLink.attr("href") ?? "",
    });
  });

  return results;
}
