/**
 * Standalone prototype: replicate the PrimeFaces TreeTable "select" AJAX
 * postback that Moses uses to expand a Studiengangsbereich (e.g. "Pflichtbereich")
 * into its module list, without a browser.
 *
 * Validated manually against a known-good case (Informatik B.Sc., StuPO 2015,
 * WiSe 2025/26): expanding "Pflichtbereich" must yield 16 modules including
 * "Algorithmen und Datenstrukturen" (Schriftliche Prüfung) and
 * "Diskrete Strukturen" (Portfolioprüfung).
 *
 * Run with: npm run prototype:area-expand
 */
import * as cheerio from "cheerio";
import { CookieJar } from "tough-cookie";

const BASE = "https://moseskonto.tu-berlin.de";
const USER_AGENT = "moses-mcp-research/0.1 (+personal discovery tool, low-volume)";

const PROGRAM_URL = `${BASE}/moses/modultransfersystem/studiengaenge/anzeigen.html?studiengang=31&mkg=24544&semester=75`;
const TARGET_AREA = "Pflichtbereich";

async function fetchWithCookies(
  url: string,
  jar: CookieJar,
  init: RequestInit = {},
): Promise<Response> {
  const cookieHeader = await jar.getCookieString(url);
  const headers = new Headers(init.headers);
  if (cookieHeader) headers.set("Cookie", cookieHeader);
  headers.set("User-Agent", USER_AGENT);
  const res = await fetch(url, { ...init, headers, redirect: "follow" });
  const setCookies = (res.headers as Headers & { getSetCookie?: () => string[] }).getSetCookie?.() ?? [];
  for (const sc of setCookies) {
    await jar.setCookie(sc, url);
  }
  return res;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Serialize every input/select/textarea inside the given form id, like jQuery's .serialize(). */
function serializeForm($: cheerio.CheerioAPI, formId: string): Map<string, string> {
  const params = new Map<string, string>();
  const form = $(`#${cssEscape(formId)}`);
  form.find("input, select, textarea").each((_, el) => {
    const $el = $(el);
    const name = $el.attr("name");
    if (!name) return;
    const tag = el.tagName?.toLowerCase();
    if (tag === "select") {
      const selected = $el.find("option[selected]").first();
      const value = selected.length ? selected.attr("value") ?? "" : ($el.find("option").first().attr("value") ?? "");
      params.set(name, value ?? "");
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

function cssEscape(id: string): string {
  // form ids here are plain JSF ids (letters/digits/underscore), no colons expected at this level
  return id.replace(/([:.])/g, "\\$1");
}

interface AreaModule {
  name: string;
  moduleNumber: string;
  version: string;
  lp: string;
  graded: string;
  examType: string;
  turnus: string;
  weight: string;
  moduleUrl: string;
}

async function main() {
  const jar = new CookieJar();

  // 1. GET the program page to establish session (jfwid/ClientWindow) + ViewState.
  const programRes = await fetchWithCookies(PROGRAM_URL, jar);
  if (!programRes.ok) throw new Error(`GET program page failed: ${programRes.status}`);
  const programHtml = await programRes.text();
  const $ = cheerio.load(programHtml);

  // 2. Locate the treetable component and its enclosing form.
  const treeTableEl = $(".ui-treetable").first();
  const treeTableId = treeTableEl.attr("id");
  if (!treeTableId) throw new Error("Could not find .ui-treetable component on the page");
  const formId = treeTableId.split(":")[0];

  // 3. Find the render target ("u" param) from the inline PrimeFaces.ab(...) select behavior.
  const scripts = $("script")
    .map((_, el) => $(el).html() ?? "")
    .get()
    .join("\n");
  const abRegex = new RegExp(`PrimeFaces\\.ab\\(\\{s:"${escapeRegex(treeTableId)}"[^}]*u:"([^"]+)"`);
  const abMatch = scripts.match(abRegex);
  const renderTarget = abMatch?.[1];
  if (!renderTarget) throw new Error("Could not find PrimeFaces.ab render target for the treetable");

  // 4. Find the row key (data-rk) for the target area by matching its visible label.
  let rowKey: string | undefined;
  $("tr[data-rk]").each((_, el) => {
    const label = $(el).find("td").first().text().trim();
    if (label === TARGET_AREA) {
      rowKey = $(el).attr("data-rk");
      return false;
    }
  });
  if (!rowKey) throw new Error(`Could not find row key for area "${TARGET_AREA}"`);

  // 5. Determine the POST action URL from the form itself (already carries ;jsessionid= and ?jfwid=).
  const actionUrl = $(`#${cssEscape(formId)}`).attr("action");
  if (!actionUrl) throw new Error("Could not find form action URL");
  const postUrl = actionUrl.startsWith("http") ? actionUrl : `${BASE}${actionUrl}`;

  // 6. Serialize the full form, then overlay the AJAX-specific + selection params.
  const body = serializeForm($, formId);
  body.set(`${treeTableId}_selection`, rowKey);
  body.set("jakarta.faces.partial.ajax", "true");
  body.set("jakarta.faces.source", treeTableId);
  body.set("jakarta.faces.partial.execute", treeTableId);
  body.set("jakarta.faces.partial.render", renderTarget);
  body.set("jakarta.faces.behavior.event", "select");
  body.set("jakarta.faces.partial.event", "select");

  const bodyString = Array.from(body.entries())
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join("&");

  const ajaxRes = await fetchWithCookies(postUrl, jar, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "Faces-Request": "partial/ajax",
      "X-Requested-With": "XMLHttpRequest",
    },
    body: bodyString,
  });
  if (!ajaxRes.ok) throw new Error(`AJAX POST failed: ${ajaxRes.status}`);
  const ajaxXml = await ajaxRes.text();

  // 7. Extract the CDATA fragment for the render target and parse the module table.
  const cdataRegex = new RegExp(
    `<update id="${escapeRegex(renderTarget)}"><!\\[CDATA\\[(.*?)\\]\\]></update>`,
    "s",
  );
  const cdataMatch = ajaxXml.match(cdataRegex);
  if (!cdataMatch) throw new Error("Could not find render-target update in AJAX response");
  const fragmentHtml = cdataMatch[1];

  const $$ = cheerio.load(fragmentHtml);
  const modules: AreaModule[] = [];
  $$("table.ui-datatable-data tr, tbody tr").each((_, tr) => {
    const cells = $$(tr).find("td");
    if (cells.length < 7) return;
    const nameLink = $$(cells[0]).find("a");
    const numberLink = $$(cells[1]).find("a");
    const moduleUrl = nameLink.attr("href") ?? "";
    modules.push({
      name: nameLink.text().trim() || $$(cells[0]).text().trim(),
      moduleNumber: numberLink.text().trim() || $$(cells[1]).text().trim(),
      version: $$(cells[2]).text().trim(),
      lp: $$(cells[3]).text().trim(),
      graded: $$(cells[4]).text().trim(),
      examType: $$(cells[5]).text().trim(),
      turnus: $$(cells[6]).text().trim(),
      weight: cells.length > 7 ? $$(cells[7]).text().trim() : "",
      moduleUrl,
    });
  });

  console.log(`Found ${modules.length} modules in "${TARGET_AREA}":\n`);
  for (const m of modules) {
    console.log(`- ${m.name} (#${m.moduleNumber}/${m.version}) — ${m.lp} LP, ${m.graded}, ${m.examType}, ${m.turnus}`);
  }

  // Sanity checks against the known-good case.
  const algoDat = modules.find((m) => m.name === "Algorithmen und Datenstrukturen");
  const diskrete = modules.find((m) => m.name === "Diskrete Strukturen");
  const ok =
    modules.length === 16 &&
    algoDat?.examType === "Schriftliche Prüfung" &&
    diskrete?.examType === "Portfolioprüfung";

  console.log(`\nValidation: ${ok ? "PASS" : "FAIL"}`);
  if (!ok) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
