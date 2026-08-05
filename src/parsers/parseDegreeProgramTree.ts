import * as cheerio from "cheerio";
import type { DegreeProgramStructure, ProgramAreaSummary } from "../types.js";

function parseSelectOptions($: cheerio.CheerioAPI, select: cheerio.Cheerio<any>) {
  const options: { value: string; label: string }[] = [];
  let selected: { value: string; label: string } | undefined;
  select.find("option").each((_, opt) => {
    const $opt = $(opt);
    // The placeholder ("Bitte wählen...") option has no `value` attribute at
    // all; cheerio then falls back to its text content for .attr("value"),
    // so presence must be checked explicitly rather than truthiness.
    if (!$opt.is("[value]")) return;
    const value = $opt.attr("value") ?? "";
    const label = $opt.text().trim();
    const entry = { value, label };
    options.push(entry);
    if ($opt.attr("selected") !== undefined) selected = entry;
  });
  return { options, selected };
}

/** Parse the degree-program detail page (top-level curriculum tree + StuPO/semester pickers). */
export function parseDegreeProgramTree(html: string, programId: string): DegreeProgramStructure {
  const $ = cheerio.load(html);

  const name = $("h1, h2").first().text().trim() || $(".card h3").first().text().trim();

  const selects = $("select");
  let stupoSelect: cheerio.Cheerio<any> | undefined;
  let semesterSelect: cheerio.Cheerio<any> | undefined;
  selects.each((_, el) => {
    const $el = $(el);
    const labelText = $el.closest(".form-group").find("label").first().text().trim();
    if (/Studien-.*Prüfungsordnung/i.test(labelText)) stupoSelect = $el;
    else if (/Modulliste/i.test(labelText)) semesterSelect = $el;
  });

  const stupoParsed = stupoSelect ? parseSelectOptions($, stupoSelect) : { options: [], selected: undefined };
  const semesterParsed = semesterSelect
    ? parseSelectOptions($, semesterSelect)
    : { options: [], selected: undefined };

  const mapped = !html.includes("ist nicht abgebildet");

  const areas: ProgramAreaSummary[] = [];
  $("tr[data-rk]").each((_, tr) => {
    const $tr = $(tr);
    const rowKey = $tr.attr("data-rk") ?? "";
    const cells = $tr.find("td");
    if (cells.length < 4) return;
    const label = $(cells[0]).text().trim();
    areas.push({
      path: rowKey.split("_"),
      name: label,
      rowKey,
      subAreaCount: parseInt($(cells[1]).text().trim(), 10) || 0,
      moduleCount: parseInt($(cells[2]).text().trim(), 10) || 0,
      lp: $(cells[3]).text().trim(),
    });
  });

  return {
    programId,
    name,
    degreeType: "",
    shortName: "",
    faculty: "",
    selectedStupo: stupoParsed.selected,
    selectedSemester: semesterParsed.selected,
    availableStupos: stupoParsed.options,
    availableSemesters: semesterParsed.options,
    mapped,
    areas,
  };
}

export interface AreaExpandRequest {
  postUrl: string;
  body: Map<string, string>;
  renderTarget: string;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function cssEscapeId(id: string): string {
  return id.replace(/([:.])/g, "\\$1");
}

function serializeForm($: cheerio.CheerioAPI, formId: string): Map<string, string> {
  const params = new Map<string, string>();
  const form = $(`#${cssEscapeId(formId)}`);
  form.find("input, select, textarea").each((_, el) => {
    const $el = $(el);
    const name = $el.attr("name");
    if (!name) return;
    const tag = (el as any).tagName?.toLowerCase();
    if (tag === "select") {
      const selectedOpt = $el.find("option[selected]").first();
      const value = selectedOpt.length
        ? (selectedOpt.attr("value") ?? "")
        : ($el.find("option").first().attr("value") ?? "");
      params.set(name, value);
    } else {
      const type = ($el.attr("type") ?? "text").toLowerCase();
      if (type === "checkbox" || type === "radio") {
        if ($el.attr("checked") !== undefined) params.set(name, $el.attr("value") ?? "on");
      } else {
        params.set(name, $el.attr("value") ?? "");
      }
    }
  });
  return params;
}

/**
 * Build the PrimeFaces TreeTable "select" AJAX postback needed to expand
 * `areaRowKey` (as found in a ProgramAreaSummary.rowKey) into its module list.
 */
export function extractAreaExpandRequest(html: string, areaRowKey: string): AreaExpandRequest {
  const $ = cheerio.load(html);

  const treeTableEl = $(".ui-treetable").first();
  const treeTableId = treeTableEl.attr("id");
  if (!treeTableId) throw new Error("Could not find .ui-treetable component on the page");
  const formId = treeTableId.split(":")[0];

  const scripts = $("script")
    .map((_, el) => $(el).html() ?? "")
    .get()
    .join("\n");
  const abRegex = new RegExp(`PrimeFaces\\.ab\\(\\{s:"${escapeRegex(treeTableId)}"[^}]*u:"([^"]+)"`);
  const abMatch = scripts.match(abRegex);
  const renderTarget = abMatch?.[1];
  if (!renderTarget) throw new Error("Could not find PrimeFaces.ab render target for the treetable");

  const rowExists = $(`tr[data-rk="${areaRowKey}"]`).length > 0;
  if (!rowExists) throw new Error(`No tree row found with row key "${areaRowKey}"`);

  const actionUrl = $(`#${cssEscapeId(formId)}`).attr("action");
  if (!actionUrl) throw new Error("Could not find form action URL");

  const body = serializeForm($, formId);
  body.set(`${treeTableId}_selection`, areaRowKey);
  body.set("jakarta.faces.partial.ajax", "true");
  body.set("jakarta.faces.source", treeTableId);
  body.set("jakarta.faces.partial.execute", treeTableId);
  body.set("jakarta.faces.partial.render", renderTarget);
  body.set("jakarta.faces.behavior.event", "select");
  body.set("jakarta.faces.partial.event", "select");

  return { postUrl: actionUrl, body, renderTarget };
}
