import { apiFetchByIdlist, apiGet, apiGetById } from "../api/client.js";
import { cached } from "../cache.js";
import { templatePassingRule } from "./passingRuleText.js";
import type {
  EBolognamodulliste,
  EBolognamodulListengruppe,
  EBolognamodulListenwahlregel,
  EBolognamodulListenzuordnung,
  EBolognamodul,
  EBolognamodulVersion,
  ERef,
  ESemester,
  EStudiengang,
  EStudiengangsabbildung,
  EStudiengangsbereich,
  EStudiengangsbereichWahlregel,
  EStudiengangszuordnung,
  EStupo,
} from "../api/entities.js";
import type { AreaModule, AreaModulesResult, DegreeProgramStructure, DegreeProgramSummary, ProgramAreaSummary } from "../types.js";

const MAX_STUPO_FALLBACK_ATTEMPTS = 4;

function moduleDescriptionUrl(moduleNumber: string, version: string): string {
  return `https://moseskonto.tu-berlin.de/moses/modultransfersystem/bolognamodule/beschreibung/anzeigen.html?nummer=${encodeURIComponent(
    moduleNumber,
  )}&version=${encodeURIComponent(version)}`;
}

function gradedText(benotet: boolean): string {
  return benotet ? "Benotet" : "Unbenotet";
}

/** Newest-first, not-yet-expired-first — used both for the StuPO fallback loop and the availableStupos list. */
function sortStupos(stupos: EStupo[]): EStupo[] {
  return stupos.slice().sort((a, b) => Number(a.ausgelaufen) - Number(b.ausgelaufen) || (b.jahr ?? 0) - (a.jahr ?? 0));
}

export async function searchDegreePrograms(
  query: string,
  opts: { degreeType?: string; faculty?: string; refresh?: boolean } = {},
): Promise<DegreeProgramSummary[]> {
  const page = await cached(
    `api:studiengang:search:${query}`,
    () => apiGet<EStudiengang>("/studiengang", { name: query, pageSize: 200 }),
    { refresh: opts.refresh },
  );

  let results: DegreeProgramSummary[] = page.data.map((s) => ({
    id: String(s.id),
    name: s.name,
    shortName: s.kurzname,
    degreeType: s.studiengangart?.name ?? "",
    faculty: s.organisationseinheit?.name ?? "",
    url: s.link ?? "",
  }));

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

/** Common shape of EStudiengangszuordnung and EBolognamodulListenzuordnung (differ only in their parent-area ref field name). */
interface ZuordnungLike {
  id: number;
  bolognamodulVersion: ERef;
  modultitel: string;
  modullp: number;
  modulbenotet: boolean;
  makroturnus?: ERef;
  bolognamodulPruefungsform?: ERef;
  modulgewichtung?: number;
}

async function mapZuordnungToAreaModules(zuordnungen: ZuordnungLike[]): Promise<AreaModule[]> {
  const versions = await apiFetchByIdlist<EBolognamodulVersion>(
    "bolognamodulversion",
    zuordnungen.map((z) => z.bolognamodulVersion.id),
  );
  const versionById = new Map(versions.map((v) => [v.id, v]));
  const modules = await apiFetchByIdlist<EBolognamodul>(
    "bolognamodul",
    versions.map((v) => v.bolognamodul.id),
  );
  const moduleById = new Map(modules.map((m) => [m.id, m]));

  return zuordnungen.map((z) => {
    const version = versionById.get(z.bolognamodulVersion.id);
    const mod = version ? moduleById.get(version.bolognamodul.id) : undefined;
    const moduleNumber = mod ? String(mod.number) : "";
    const versionStr = version ? String(version.versionsnummer) : "";
    return {
      name: z.modultitel,
      moduleNumber,
      version: versionStr,
      lp: String(z.modullp),
      graded: gradedText(z.modulbenotet),
      examType: z.bolognamodulPruefungsform?.name ?? "",
      turnus: z.makroturnus?.name ?? "",
      weight: z.modulgewichtung !== undefined ? String(z.modulgewichtung) : "",
      moduleUrl: moduleDescriptionUrl(moduleNumber, versionStr),
    };
  });
}

interface ResolvedAbbildung {
  mapped: boolean;
  model: "new" | "legacy" | "none";
  selectedSemester?: { value: string; label: string };
  availableSemesters: { value: string; label: string }[];
  areaSummaries: ProgramAreaSummary[];
  rawNewAreas: EStudiengangsbereich[];
  rawLegacyGroups: EBolognamodulListengruppe[];
}

const EMPTY_RESOLVED: ResolvedAbbildung = {
  mapped: false,
  model: "none",
  availableSemesters: [],
  areaSummaries: [],
  rawNewAreas: [],
  rawLegacyGroups: [],
};

async function buildNewModelAreas(areas: EStudiengangsbereich[], rootLabel: string): Promise<ProgramAreaSummary[]> {
  const areaById = new Map(areas.map((a) => [a.id, a]));
  const zuordnungen = await apiFetchByIdlist<EStudiengangszuordnung>(
    "studiengangszuordnung",
    areas.flatMap((a) => a.studiengangszuordnungList.map((z) => z.id)),
  );
  const lpByAreaId = new Map<number, number>();
  for (const z of zuordnungen) {
    lpByAreaId.set(z.studiengangsbereich.id, (lpByAreaId.get(z.studiengangsbereich.id) ?? 0) + z.modullp);
  }

  function pathFor(area: EStudiengangsbereich): string[] {
    const segments: string[] = [];
    let current: EStudiengangsbereich | undefined = area;
    while (current) {
      // The root container grouping a whole abbildung's areas is itself
      // unnamed (verified live) — walk past it for ancestors, but don't
      // emit it as a path segment.
      if (current.name) segments.unshift(current.name);
      current = current.parent ? areaById.get(current.parent.id) : undefined;
    }
    return [rootLabel, ...segments];
  }

  // Same unnamed root: it's a traversal anchor, not a selectable area — drop it from the output.
  return areas
    .filter((a) => !!a.name)
    .map((a) => ({
      path: pathFor(a),
      name: a.name,
      rowKey: `sb:${a.id}`,
      subAreaCount: a.childrenList.length,
      moduleCount: a.studiengangszuordnungList.length,
      lp: String(lpByAreaId.get(a.id) ?? 0),
    }));
}

async function buildLegacyModelAreas(groups: EBolognamodulListengruppe[], rootLabel: string): Promise<ProgramAreaSummary[]> {
  const groupById = new Map(groups.map((g) => [g.id, g]));
  const zuordnungen = await apiFetchByIdlist<EBolognamodulListenzuordnung>(
    "bolognamodullistenzuordnung",
    groups.flatMap((g) => g.bolognamodulListenzuordnungList.map((z) => z.id)),
  );
  const lpByGroupId = new Map<number, number>();
  for (const z of zuordnungen) {
    lpByGroupId.set(z.bolognamodulListengruppe.id, (lpByGroupId.get(z.bolognamodulListengruppe.id) ?? 0) + z.modullp);
  }

  function pathFor(group: EBolognamodulListengruppe): string[] {
    const segments: string[] = [];
    let current: EBolognamodulListengruppe | undefined = group;
    while (current) {
      // Same unnamed-root situation as the new model — skip it as a segment, keep walking through it.
      if (current.name) segments.unshift(current.name);
      current = current.parent ? groupById.get(current.parent.id) : undefined;
    }
    return [rootLabel, ...segments];
  }

  return groups
    .filter((g) => !!g.name)
    .map((g) => ({
      path: pathFor(g),
      name: g.name,
      rowKey: `lg:${g.id}`,
      subAreaCount: g.childrenList?.length ?? 0,
      moduleCount: g.bolognamodulListenzuordnungList.length,
      lp: String(lpByGroupId.get(g.id) ?? 0),
    }));
}

/**
 * Resolve a StuPO's curriculum data — trying the "new" studiengangsbereich
 * model first, then falling back to the "legacy" bolognamodulliste model
 * (used by e.g. Informatik B.Sc.) — since which model a given StuPO uses is
 * only knowable by checking `bereicheFreigegeben`/list population live.
 */
async function resolveAbbildung(
  stupo: EStupo,
  semesterIdOverride: number | undefined,
  refresh: boolean | undefined,
): Promise<ResolvedAbbildung> {
  return cached(
    `api:abbildung:${stupo.id}:${semesterIdOverride ?? ""}`,
    async () => {
      const abbildungPage = await apiGet<EStudiengangsabbildung>("/studiengangsabbildung", { stupoId: stupo.id });
      const abbildung = abbildungPage.data[0];
      if (!abbildung) return EMPTY_RESOLVED;

      if (abbildung.bereicheFreigegeben && abbildung.studiengangsbereichList.length > 0) {
        const areas = await apiFetchByIdlist<EStudiengangsbereich>(
          "studiengangsbereich",
          abbildung.studiengangsbereichList.map((a) => a.id),
        );
        const areaSummaries = await buildNewModelAreas(areas, stupo.name);
        return {
          mapped: true,
          model: "new",
          availableSemesters: [],
          areaSummaries,
          rawNewAreas: areas,
          rawLegacyGroups: [],
        } satisfies ResolvedAbbildung;
      }

      if (abbildung.bolognamodullisteList.length > 0) {
        const listen = await apiFetchByIdlist<EBolognamodulliste>(
          "bolognamodulliste",
          abbildung.bolognamodullisteList.map((l) => l.id),
        );
        const semesters = await apiFetchByIdlist<ESemester>(
          "semester",
          listen.map((l) => l.semester.id),
        );
        const semesterById = new Map(semesters.map((s) => [s.id, s]));

        const availableSemesters = listen
          .slice()
          .sort((a, b) => (semesterById.get(b.semester.id)?.startDate ?? "").localeCompare(semesterById.get(a.semester.id)?.startDate ?? ""))
          .map((l) => ({ value: String(l.semester.id), label: semesterById.get(l.semester.id)?.name ?? l.semester.name ?? "" }));

        let chosen: EBolognamodulliste | undefined;
        if (semesterIdOverride !== undefined) {
          chosen = listen.find((l) => l.semester.id === semesterIdOverride);
        } else {
          const freigegeben = listen.filter((l) => l.freigabe);
          const pool = freigegeben.length > 0 ? freigegeben : listen;
          chosen = pool
            .slice()
            .sort((a, b) => (semesterById.get(b.semester.id)?.startDate ?? "").localeCompare(semesterById.get(a.semester.id)?.startDate ?? ""))[0];
        }
        if (!chosen) return { ...EMPTY_RESOLVED, availableSemesters };

        const groups = await apiFetchByIdlist<EBolognamodulListengruppe>(
          "bolognamodullistengruppe",
          chosen.bolognamodulListengruppeList.map((g) => g.id),
        );
        const chosenSemesterName = semesterById.get(chosen.semester.id)?.name ?? chosen.semester.name ?? "";
        const areaSummaries = await buildLegacyModelAreas(groups, `Modulliste ${chosenSemesterName}`);

        return {
          mapped: chosen.freigabe,
          model: "legacy",
          selectedSemester: { value: String(chosen.semester.id), label: chosenSemesterName },
          availableSemesters,
          areaSummaries,
          rawNewAreas: [],
          rawLegacyGroups: groups,
        } satisfies ResolvedAbbildung;
      }

      return EMPTY_RESOLVED;
    },
    { refresh },
  );
}

/**
 * Get a degree program's curriculum structure. If `stupo`/`semester` are
 * omitted, resolves the newest StuPO (+ newest semester, for StuPOs using
 * the legacy per-semester model) that Moses actually has curriculum data
 * ("mapped") for.
 */
export async function getDegreeProgramStructure(
  programId: string,
  opts: { stupo?: string; semester?: string; refresh?: boolean } = {},
): Promise<DegreeProgramStructure> {
  const studiengang = await cached(
    `api:studiengang:${programId}`,
    () => apiGetById<EStudiengang>("studiengang", programId),
    { refresh: opts.refresh },
  );
  if (!studiengang) throw new Error(`No degree program found with id ${programId}`);

  const allStupos = await apiFetchByIdlist<EStupo>(
    "stupo",
    studiengang.stupoList.map((s) => s.id),
  );
  const availableStupos = sortStupos(allStupos).map((s) => ({ value: String(s.id), label: s.name }));

  const base = {
    programId,
    name: studiengang.name,
    degreeType: studiengang.studiengangart?.name ?? "",
    shortName: studiengang.kurzname,
    faculty: studiengang.organisationseinheit?.name ?? "",
    availableStupos,
  };

  const candidates = opts.stupo
    ? allStupos.filter((s) => String(s.id) === opts.stupo)
    : sortStupos(allStupos).slice(0, MAX_STUPO_FALLBACK_ATTEMPTS);

  let lastAttempt: DegreeProgramStructure = { ...base, mapped: false, availableSemesters: [], areas: [] };

  for (const stupo of candidates) {
    const resolved = await resolveAbbildung(stupo, opts.semester ? Number(opts.semester) : undefined, opts.refresh);
    const full: DegreeProgramStructure = {
      ...base,
      selectedStupo: { value: String(stupo.id), label: stupo.name },
      selectedSemester: resolved.selectedSemester,
      availableSemesters: resolved.availableSemesters,
      mapped: resolved.mapped,
      areas: resolved.areaSummaries,
    };
    lastAttempt = full;
    if (full.mapped && full.areas.length > 0) return full;
  }

  return lastAttempt;
}

function findArea(areas: ProgramAreaSummary[], areaNameOrRowKey: string): ProgramAreaSummary | undefined {
  return (
    areas.find((a) => a.rowKey === areaNameOrRowKey) ??
    areas.find((a) => a.name === areaNameOrRowKey) ??
    areas.find((a) => a.name.toLowerCase().includes(areaNameOrRowKey.toLowerCase()))
  );
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
  const stupoObj = await apiGetById<EStupo>("stupo", stupo);
  if (!stupoObj) throw new Error(`Unknown StuPO ${stupo}`);

  // The new (studiengangsbereich) model has no semester dimension, so resolveAbbildung simply
  // ignores this override on that path — re-resolving here (rather than trusting the caller's
  // `semester` to imply a model) lets us independently detect which model actually applies.
  const resolved = await resolveAbbildung(stupoObj, Number(semester), opts.refresh);

  const area = findArea(resolved.areaSummaries, areaNameOrRowKey);
  if (!area) {
    const available = resolved.areaSummaries.map((a) => a.name).join(", ");
    throw new Error(`Area "${areaNameOrRowKey}" not found. Available areas: ${available}`);
  }

  if (resolved.model === "new") {
    const rawArea = resolved.rawNewAreas.find((a) => `sb:${a.id}` === area.rowKey);
    if (!rawArea) throw new Error(`Internal error: could not resolve raw area for ${area.rowKey}`);
    const [zuordnungen, wahlregeln] = await Promise.all([
      apiFetchByIdlist<EStudiengangszuordnung>(
        "studiengangszuordnung",
        rawArea.studiengangszuordnungList.map((z) => z.id),
      ),
      apiFetchByIdlist<EStudiengangsbereichWahlregel>(
        "studiengangsbereichwahlregel",
        rawArea.studiengangswahlregelList.map((w) => w.id),
      ),
    ]);
    return {
      modules: await mapZuordnungToAreaModules(zuordnungen),
      passingRules: wahlregeln.map(templatePassingRule),
    };
  }

  if (resolved.model === "legacy") {
    const rawGroup = resolved.rawLegacyGroups.find((g) => `lg:${g.id}` === area.rowKey);
    if (!rawGroup) throw new Error(`Internal error: could not resolve raw area for ${area.rowKey}`);
    const [zuordnungen, wahlregeln] = await Promise.all([
      apiFetchByIdlist<EBolognamodulListenzuordnung>(
        "bolognamodullistenzuordnung",
        rawGroup.bolognamodulListenzuordnungList.map((z) => z.id),
      ),
      apiFetchByIdlist<EBolognamodulListenwahlregel>(
        "bolognamodullistenwahlregel",
        rawGroup.bolognamodulListenwahlregelList.map((w) => w.id),
      ),
    ]);
    return {
      modules: await mapZuordnungToAreaModules(zuordnungen),
      passingRules: wahlregeln.map(templatePassingRule),
    };
  }

  throw new Error(`No curriculum data mapped for StuPO ${stupo} / semester ${semester}`);
}
