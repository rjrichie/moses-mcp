/**
 * Reverse lookup: "which degree programs use module version X" — needed for
 * ModuleDetail.usedInPrograms.
 *
 * Neither the new-model `/studiengangszuordnung` (~39k records) nor the
 * legacy-model `/bolognamodullistenzuordnung` (~406k records) endpoints
 * support filtering by bolognamodulVersion — only `idlist`/pagination, and
 * there's no other way to narrow the query server-side (verified — several
 * plausible filter param names were tried live and silently ignored).
 *
 * Measured live: the API costs ~7-8ms/record server-side regardless of page
 * size, so a full scan of both tables is a ~13-minute, ~445k-record
 * operation even at modest concurrency — far too slow to build lazily
 * inside an interactive tool call, and enough sustained load that doing it
 * silently on a cold cache would look exactly like the "crawler causing
 * performance drops" behavior the API access email said they'd block IPs
 * over. So this index is built ONLY by an explicit, deliberate step —
 * `npm run build-usage-index` (see scripts/build-usage-index.ts) — never
 * automatically. `resolveUsedInPrograms` only ever reads whatever index is
 * already cached; if none has been built yet (or it's stale), it returns an
 * empty list rather than triggering a build.
 */
import { apiFetchAllPages, apiFetchByIdlist } from "../api/client.js";
import { cached, peekCached } from "../cache.js";
import type {
  EBolognamodulliste,
  EBolognamodulListengruppe,
  EBolognamodulListenzuordnung,
  ESemester,
  EStudiengang,
  EStudiengangsabbildung,
  EStudiengangsbereich,
  EStudiengangszuordnung,
  EStupo,
} from "../api/entities.js";
import type { ProgramUsage } from "../types.js";

const INDEX_TTL_MS = 7 * 24 * 60 * 60 * 1000;

interface UsageIndexEntry {
  zuordnungId: number;
  groupId: number;
  model: "new" | "legacy";
}

type UsageIndex = Record<number, UsageIndexEntry[]>;

const INDEX_CACHE_KEY = "api:module-usage-index";

/**
 * Build the full reverse index by paging through both zuordnung tables.
 * Takes on the order of minutes (~445k records total) — only call this from
 * the explicit `npm run build-usage-index` entry point, never from a tool
 * request path. Exported for that script; not used elsewhere in this file.
 */
export async function buildAndCacheUsageIndex(onProgress?: (message: string) => void): Promise<UsageIndex> {
  onProgress?.("Fetching studiengangszuordnung (new-model, ~39k records)...");
  const newRecords = await apiFetchAllPages<EStudiengangszuordnung>("studiengangszuordnung");
  onProgress?.(`Fetched ${newRecords.length} studiengangszuordnung records.`);

  onProgress?.("Fetching bolognamodullistenzuordnung (legacy-model, ~406k records, this is the slow part)...");
  const legacyRecords = await apiFetchAllPages<EBolognamodulListenzuordnung>("bolognamodullistenzuordnung");
  onProgress?.(`Fetched ${legacyRecords.length} bolognamodullistenzuordnung records.`);

  const index: UsageIndex = {};
  const push = (versionId: number, entry: UsageIndexEntry) => {
    (index[versionId] ??= []).push(entry);
  };
  for (const r of newRecords) {
    push(r.bolognamodulVersion.id, { zuordnungId: r.id, groupId: r.studiengangsbereich.id, model: "new" });
  }
  for (const r of legacyRecords) {
    push(r.bolognamodulVersion.id, { zuordnungId: r.id, groupId: r.bolognamodulListengruppe.id, model: "legacy" });
  }

  return cached(INDEX_CACHE_KEY, async () => index, { ttlMs: INDEX_TTL_MS, refresh: true });
}

function dedupe(ids: (number | undefined)[]): number[] {
  return Array.from(new Set(ids.filter((id): id is number => id !== undefined)));
}

/**
 * Resolve the degree programs (with best-effort usage stats) that use
 * `versionId`, from whatever reverse index is already cached. Returns []
 * (rather than building one) if the index hasn't been built yet or has
 * expired — run `npm run build-usage-index` to populate/refresh it.
 */
export async function resolveUsedInPrograms(versionId: number): Promise<ProgramUsage[]> {
  const index = await peekCached<UsageIndex>(INDEX_CACHE_KEY, { ttlMs: INDEX_TTL_MS });
  const matches = index?.[versionId] ?? [];
  if (matches.length === 0) return [];

  const newMatches = matches.filter((m) => m.model === "new");
  const legacyMatches = matches.filter((m) => m.model === "legacy");

  const [newGroups, legacyGroups] = await Promise.all([
    apiFetchByIdlist<EStudiengangsbereich>(
      "studiengangsbereich",
      newMatches.map((m) => m.groupId),
    ),
    apiFetchByIdlist<EBolognamodulListengruppe>(
      "bolognamodullistengruppe",
      legacyMatches.map((m) => m.groupId),
    ),
  ]);
  const newGroupById = new Map(newGroups.map((g) => [g.id, g]));
  const legacyGroupById = new Map(legacyGroups.map((g) => [g.id, g]));

  const legacyListen = await apiFetchByIdlist<EBolognamodulliste>(
    "bolognamodulliste",
    dedupe(legacyGroups.map((g) => g.bolognamodulListe?.id)),
  );
  const legacyListeById = new Map(legacyListen.map((l) => [l.id, l]));

  const newAbbildungIds = newGroups.map((g) => g.studiengangsabbildung?.id);
  const legacyAbbildungIds = legacyListen.map((l) => l.studiengangsabbildung.id);
  const abbildungen = await apiFetchByIdlist<EStudiengangsabbildung>(
    "studiengangsabbildung",
    dedupe([...newAbbildungIds, ...legacyAbbildungIds]),
  );
  const abbildungById = new Map(abbildungen.map((a) => [a.id, a]));

  const stupos = await apiFetchByIdlist<EStupo>(
    "stupo",
    dedupe(abbildungen.map((a) => a.stupo.id)),
  );
  const stupoById = new Map(stupos.map((s) => [s.id, s]));

  const studiengaenge = await apiFetchByIdlist<EStudiengang>(
    "studiengang",
    dedupe(stupos.map((s) => s.studiengang?.id)),
  );
  const studiengangById = new Map(studiengaenge.map((s) => [s.id, s]));

  // For legacy matches only, resolve the semester so we can report a
  // best-effort firstUsed/lastUsed range (sorted chronologically by
  // startDate). The new (studiengangsbereich) model has no semester
  // dimension at all, so those matches don't contribute a date range.
  const semesters = await apiFetchByIdlist<ESemester>(
    "semester",
    dedupe(legacyListen.map((l) => l.semester.id)),
  );
  const semesterById = new Map(semesters.map((s) => [s.id, s]));

  interface Agg {
    studiengangId: number;
    stupoIds: Set<number>;
    usageCount: number;
    semesterIds: Set<number>;
  }
  const byProgram = new Map<number, Agg>();

  const record = (studiengangId: number | undefined, stupoId: number, semesterId?: number) => {
    if (studiengangId === undefined) return;
    let agg = byProgram.get(studiengangId);
    if (!agg) {
      agg = { studiengangId, stupoIds: new Set(), usageCount: 0, semesterIds: new Set() };
      byProgram.set(studiengangId, agg);
    }
    agg.stupoIds.add(stupoId);
    agg.usageCount++;
    if (semesterId !== undefined) agg.semesterIds.add(semesterId);
  };

  for (const m of newMatches) {
    const group = newGroupById.get(m.groupId);
    const abbildung = group?.studiengangsabbildung?.id !== undefined ? abbildungById.get(group.studiengangsabbildung.id) : undefined;
    const stupo = abbildung ? stupoById.get(abbildung.stupo.id) : undefined;
    record(stupo?.studiengang?.id, abbildung?.stupo.id ?? -1);
  }
  for (const m of legacyMatches) {
    const group = legacyGroupById.get(m.groupId);
    const liste = group?.bolognamodulListe?.id !== undefined ? legacyListeById.get(group.bolognamodulListe.id) : undefined;
    const abbildung = liste ? abbildungById.get(liste.studiengangsabbildung.id) : undefined;
    const stupo = abbildung ? stupoById.get(abbildung.stupo.id) : undefined;
    record(stupo?.studiengang?.id, abbildung?.stupo.id ?? -1, liste?.semester.id);
  }

  return Array.from(byProgram.values()).map((agg) => {
    const studiengang = studiengangById.get(agg.studiengangId);
    const sortedSemesters = Array.from(agg.semesterIds)
      .map((id) => semesterById.get(id))
      .filter((s): s is ESemester => s !== undefined)
      .sort((a, b) => (a.startDate ?? "").localeCompare(b.startDate ?? ""));
    return {
      programName: studiengang?.name ?? "",
      programUrl: studiengang
        ? `https://moseskonto.tu-berlin.de/moses/modultransfersystem/studiengaenge/anzeigen.html?studiengang=${studiengang.id}`
        : "",
      stupoCount: String(agg.stupoIds.size),
      usageCount: String(agg.usageCount),
      firstUsed: sortedSemesters[0]?.name ?? "",
      lastUsed: sortedSemesters[sortedSemesters.length - 1]?.name ?? "",
    };
  });
}
