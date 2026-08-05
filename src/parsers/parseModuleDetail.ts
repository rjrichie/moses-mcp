import * as cheerio from "cheerio";
import type { ModuleDetail, ProgramUsage } from "../types.js";

function fieldValue($: cheerio.CheerioAPI, labelText: string): string {
  let value = "";
  $(".form-group").each((_, el) => {
    const $el = $(el);
    const label = $el.find("label").first().text().trim().replace(/:$/, "");
    if (label !== labelText) return;
    const labelFull = $el.find("label").first().text().trim();
    const full = $el.text().trim();
    value = (full.startsWith(labelFull) ? full.slice(labelFull.length) : full).replace(/\s+/g, " ").trim();
    return false;
  });
  return value;
}

function sectionText($: cheerio.CheerioAPI, heading: string): string {
  let value = "";
  $("h3, h4").each((_, el) => {
    if ($(el).text().trim() !== heading) return;
    const text = $(el).closest(".row").find(".preformatedTextarea").first().text().trim();
    if (text) value = text;
    return false;
  });
  return value;
}

/** Parse a module-version description page (bolognamodule/beschreibung/anzeigen.html). */
export function parseModuleDetail(html: string): ModuleDetail {
  const $ = cheerio.load(html);

  const modVersion = fieldValue($, "Modul / Version"); // "#40022 / #11"
  const modVersionMatch = modVersion.match(/#(\S+)\s*\/\s*#(\S+)/);

  const usedInPrograms: ProgramUsage[] = [];
  $("h4").each((_, h4el) => {
    if (!$(h4el).text().includes("wird in folgenden Studiengängen verwendet")) return;
    const table = $(h4el).parent().find("table").first();
    table.find("tbody > tr").each((_, tr) => {
      const cells = $(tr).find("td");
      if (cells.length < 6) return;
      const link = $(cells[1]).find("a").first();
      usedInPrograms.push({
        programName: link.text().trim(),
        programUrl: link.attr("href") ?? "",
        stupoCount: $(cells[2]).text().trim(),
        usageCount: $(cells[3]).text().trim(),
        firstUsed: $(cells[4]).text().trim(),
        lastUsed: $(cells[5]).text().trim(),
      });
    });
  });

  return {
    moduleNumber: modVersionMatch?.[1] ?? "",
    version: modVersionMatch?.[2] ?? "",
    title: fieldValue($, "Titel des Moduls"),
    validity: fieldValue($, "Gültigkeit"),
    languagesAvailable: fieldValue($, "Verfügbare Sprache(n)"),
    lp: fieldValue($, "Leistungspunkte"),
    responsiblePerson: fieldValue($, "Modulverantwortliche*r"),
    grading: fieldValue($, "Benotung"),
    examType: fieldValue($, "Prüfungsform"),
    teachingLanguage: fieldValue($, "Lehrsprache(n)"),
    faculty: fieldValue($, "Fakultät"),
    institute: fieldValue($, "Institut"),
    orgUnit: fieldValue($, "Fachgebiet"),
    learningOutcomes: sectionText($, "Lernergebnisse"),
    content: sectionText($, "Lehrinhalte"),
    usedInPrograms,
  };
}
