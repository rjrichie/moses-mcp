import { cached } from "../cache.js";
import { mosesClient } from "../mosesClient.js";
import { extractAreaExpandRequest, parseDegreeProgramTree } from "../parsers/parseDegreeProgramTree.js";
import { parseDegreeProgramSearch } from "../parsers/parseDegreeProgramSearch.js";
import { parseAreaExpansion } from "../parsers/parseAreaModules.js";
import type { AreaModulesResult, DegreeProgramStructure, DegreeProgramSummary } from "../types.js";

const MAX_STUPO_FALLBACK_ATTEMPTS = 4;

export async function searchDegreePrograms(
  query: string,
  opts: { degreeType?: string; faculty?: string; refresh?: boolean } = {},
): Promise<DegreeProgramSummary[]> {
  const url = `/moses/modultransfersystem/studiengaenge/suchen.html?text=${encodeURIComponent(query)}`;
  const html = await cached(`degree-program-search:${query}`, () => mosesClient.get(url), {
    refresh: opts.refresh,
  });
  let results = parseDegreeProgramSearch(html);
  if (opts.degreeType) {
    const needle = opts.degreeType.toLowerCase();
    results = results.filter((r) => r.degreeType.toLowerCase().includes(needle));
  }
  if (opts.faculty) {
    const needle = opts.faculty.toLowerCase();
    results = results.filter((r) => r.faculty.toLowerCase().includes(needle));
  }
  return results;
}

function programUrl(programId: string, stupo?: string, semester?: string): string {
  const params = new URLSearchParams({ studiengang: programId });
  if (stupo) params.set("mkg", stupo);
  if (semester) params.set("semester", semester);
  return `/moses/modultransfersystem/studiengaenge/anzeigen.html?${params.toString()}`;
}

async function fetchProgramTree(
  programId: string,
  stupo: string | undefined,
  semester: string | undefined,
  refresh: boolean | undefined,
): Promise<DegreeProgramStructure> {
  const url = programUrl(programId, stupo, semester);
  const html = await cached(`degree-program-tree:${programId}:${stupo ?? ""}:${semester ?? ""}`, () => mosesClient.get(url), {
    refresh,
  });
  return parseDegreeProgramTree(html, programId);
}

/**
 * Get a degree program's curriculum structure. If `stupo`/`semester` are
 * omitted, resolves the newest StuPO + newest semester that Moses actually
 * has curriculum data ("mapped") for — some newer StuPOs exist but have no
 * Modulliste mapped yet, in which case Moses shows "ist nicht abgebildet"
 * and we fall back to the next StuPO.
 */
export async function getDegreeProgramStructure(
  programId: string,
  opts: { stupo?: string; semester?: string; refresh?: boolean } = {},
): Promise<DegreeProgramStructure> {
  if (opts.stupo && opts.semester) {
    return fetchProgramTree(programId, opts.stupo, opts.semester, opts.refresh);
  }

  // Discover available StuPOs first.
  const base = await fetchProgramTree(programId, opts.stupo, undefined, opts.refresh);
  const stupoCandidates = opts.stupo
    ? [{ value: opts.stupo, label: opts.stupo }]
    : base.availableStupos.slice(0, MAX_STUPO_FALLBACK_ATTEMPTS);

  let lastAttempt = base;
  for (const stupoOpt of stupoCandidates) {
    const withSemesters = await fetchProgramTree(programId, stupoOpt.value, undefined, opts.refresh);
    const semesterValue = opts.semester ?? withSemesters.availableSemesters[0]?.value;
    if (!semesterValue) continue;

    const full = await fetchProgramTree(programId, stupoOpt.value, semesterValue, opts.refresh);
    lastAttempt = full;
    if (full.mapped && full.areas.length > 0) return full;
  }

  return lastAttempt;
}

/**
 * List the modules assigned to a curriculum area (e.g. "Pflichtbereich",
 * "Wahlpflichtbereich Theoretische Informatik") within a specific StuPO +
 * semester snapshot of a degree program's structure, along with the area's
 * StuPO-defined passing rules (credit min/max, category requirements, ...).
 */
export async function listAreaModules(
  programId: string,
  stupo: string,
  semester: string,
  areaNameOrRowKey: string,
  opts: { refresh?: boolean } = {},
): Promise<AreaModulesResult> {
  const url = programUrl(programId, stupo, semester);
  const html = await cached(`degree-program-tree:${programId}:${stupo}:${semester}`, () => mosesClient.get(url), {
    refresh: opts.refresh,
  });

  const structure = parseDegreeProgramTree(html, programId);
  const area =
    structure.areas.find((a) => a.rowKey === areaNameOrRowKey) ??
    structure.areas.find((a) => a.name === areaNameOrRowKey) ??
    structure.areas.find((a) => a.name.toLowerCase().includes(areaNameOrRowKey.toLowerCase()));

  if (!area) {
    const available = structure.areas.map((a) => a.name).join(", ");
    throw new Error(`Area "${areaNameOrRowKey}" not found. Available areas: ${available}`);
  }

  const req = extractAreaExpandRequest(html, area.rowKey);
  const xml = await cached(
    `area-modules:${programId}:${stupo}:${semester}:${area.rowKey}`,
    () => mosesClient.post(req.postUrl, req.body),
    { refresh: opts.refresh },
  );

  return parseAreaExpansion(xml, req.renderTarget);
}
