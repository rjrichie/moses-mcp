import { apiFetchByIdlist, apiGet, apiGetById } from "../api/client.js";
import { cached } from "../cache.js";
import { resolveUsedInPrograms } from "./moduleUsageIndex.js";
import type {
  EBolognamodul,
  EBolognamodulBeschreibung,
  EBolognamodulBestandteil,
  EBolognamodulBestandteilGruppe,
  EBolognamodulPruefung,
  EBolognamodulVersion,
} from "../api/entities.js";
import type { ModuleComponent, ModuleDetail, ModuleSearchResult } from "../types.js";

function moduleDescriptionUrl(moduleNumber: string, version: string): string {
  return `https://moseskonto.tu-berlin.de/moses/modultransfersystem/bolognamodule/beschreibung/anzeigen.html?nummer=${encodeURIComponent(
    moduleNumber,
  )}&version=${encodeURIComponent(version)}`;
}

function gradedText(benotet: boolean): string {
  return benotet ? "Benotet" : "Unbenotet";
}

/** Keep one row per module (highest versionsnummer) — a title/number search can match many historical versions. */
function dedupeToLatestVersion(versions: EBolognamodulVersion[]): EBolognamodulVersion[] {
  const byModuleId = new Map<number, EBolognamodulVersion>();
  for (const v of versions) {
    const existing = byModuleId.get(v.bolognamodul.id);
    if (!existing || v.versionsnummer > existing.versionsnummer) {
      byModuleId.set(v.bolognamodul.id, v);
    }
  }
  return Array.from(byModuleId.values());
}

export async function searchModules(
  query: string,
  opts: { semester?: string; refresh?: boolean } = {},
): Promise<ModuleSearchResult[]> {
  const trimmed = query.trim();
  const isModuleNumber = /^\d+$/.test(trimmed);

  const page = await cached(
    `api:modulversion:search:${query}`,
    () =>
      apiGet<EBolognamodulVersion>("/bolognamodulversion", isModuleNumber ? { modulNummer: Number(trimmed), pageSize: 500 } : { modulTitel: trimmed, pageSize: 500 }),
    { refresh: opts.refresh },
  );

  let versions = dedupeToLatestVersion(page.data);
  if (opts.semester) {
    const semesterId = Number(opts.semester);
    versions = versions.filter((v) => {
      const from = v.semesterAb?.id;
      const to = v.semesterBis?.id ?? Infinity;
      return from === undefined || (semesterId >= from && semesterId <= to);
    });
  }

  const [modules, beschreibungen] = await Promise.all([
    apiFetchByIdlist<EBolognamodul>(
      "bolognamodul",
      versions.map((v) => v.bolognamodul.id),
    ),
    apiFetchByIdlist<EBolognamodulBeschreibung>(
      "bolognamodulbeschreibung",
      versions.map((v) => v.bolognamodulBeschreibung?.id).filter((id): id is number => id !== undefined),
    ),
  ]);
  const moduleById = new Map(modules.map((m) => [m.id, m]));
  const beschreibungById = new Map(beschreibungen.map((b) => [b.id, b]));

  const pruefungen = await apiFetchByIdlist<EBolognamodulPruefung>(
    "bolognamodulpruefung",
    beschreibungen.map((b) => b.pruefung?.id).filter((id): id is number => id !== undefined),
  );
  const pruefungById = new Map(pruefungen.map((p) => [p.id, p]));

  return versions.map((v) => {
    const mod = moduleById.get(v.bolognamodul.id);
    const beschreibung = v.bolognamodulBeschreibung ? beschreibungById.get(v.bolognamodulBeschreibung.id) : undefined;
    const pruefung = beschreibung?.pruefung ? pruefungById.get(beschreibung.pruefung.id) : undefined;
    const moduleNumber = mod ? String(mod.number) : "";
    const version = String(v.versionsnummer);
    return {
      moduleNumber,
      version,
      title: v.name ?? mod?.name ?? "",
      languages: beschreibung?.availableLanguages ?? "",
      lp: beschreibung ? String(beschreibung.lp) : "",
      grading: pruefung ? gradedText(pruefung.benotet) : "",
      responsiblePerson: mod?.verantwortlicher?.name ?? "",
      orgUnit: mod?.oe?.name ?? "",
      descriptionUrl: moduleDescriptionUrl(moduleNumber, version),
    };
  });
}

/** Resolve the module's Lehrveranstaltungen from bestandteilGruppeList (NOT beschreibung.bestandteilList, which holds unrelated Aufwand placeholders, not the real components). */
async function resolveComponents(beschreibung: EBolognamodulBeschreibung): Promise<ModuleComponent[]> {
  const groups = await apiFetchByIdlist<EBolognamodulBestandteilGruppe>(
    "bolognamodulbestandteilgruppe",
    beschreibung.bestandteilGruppeList.map((g) => g.id),
  );
  const bestandteilIds = groups.flatMap((g) => g.bestandteilList.map((b) => b.id));
  const bestandteile = await apiFetchByIdlist<EBolognamodulBestandteil>("bolognamodulbestandteil", bestandteilIds);

  return bestandteile
    .slice()
    .sort((a, b) => (a.rang ?? 0) - (b.rang ?? 0))
    .map((b) => ({
      name: b.lvTitel,
      type: b.lvLehrformat?.name ?? "",
      number: b.lvNummer ?? "",
      turnus: b.lvMakroturnus?.name ?? "",
      language: (b.lvSprache ?? "").replace(/[[\]]/g, ""),
    }));
}

export async function getModuleDetails(
  moduleNumber: string,
  opts: { version?: string; refresh?: boolean } = {},
): Promise<ModuleDetail> {
  const modulePage = await cached(
    `api:bolognamodul:${moduleNumber}`,
    () => apiGet<EBolognamodul>("/bolognamodul", { modulNummer: Number(moduleNumber) }),
    { refresh: opts.refresh },
  );
  const mod = modulePage.data[0];
  if (!mod) throw new Error(`No module found with number ${moduleNumber}`);

  const versions = await cached(
    `api:bolognamodulversion:by-modul:${mod.id}`,
    () => apiFetchByIdlist<EBolognamodulVersion>("bolognamodulversion", mod.bolognamodulVersionList.map((v) => v.id)),
    { refresh: opts.refresh },
  );
  const version = opts.version
    ? versions.find((v) => String(v.versionsnummer) === opts.version)
    : versions.reduce((latest, v) => (!latest || v.versionsnummer > latest.versionsnummer ? v : latest), undefined as EBolognamodulVersion | undefined);
  if (!version) throw new Error(`Could not resolve version ${opts.version ?? "(current)"} for module ${moduleNumber}`);

  const beschreibung = version.bolognamodulBeschreibung
    ? await cached(
        `api:bolognamodulbeschreibung:${version.bolognamodulBeschreibung.id}`,
        () => apiGetById<EBolognamodulBeschreibung>("bolognamodulbeschreibung", version.bolognamodulBeschreibung!.id),
        { refresh: opts.refresh },
      )
    : undefined;

  const pruefung = beschreibung?.pruefung
    ? await apiGetById<EBolognamodulPruefung>("bolognamodulpruefung", beschreibung.pruefung.id)
    : undefined;

  const components = beschreibung ? await resolveComponents(beschreibung) : [];
  const usedInPrograms = await resolveUsedInPrograms(version.id);

  return {
    moduleNumber: String(mod.number),
    version: String(version.versionsnummer),
    title: version.name ?? mod.name,
    // No direct API field for a human "validity" string; best-effort from the version's semester range.
    validity: version.semesterBis ? `${version.semesterAb?.name ?? ""} – ${version.semesterBis.name}` : `since ${version.semesterAb?.name ?? ""}`,
    languagesAvailable: beschreibung?.availableLanguages ?? "",
    lp: beschreibung ? String(beschreibung.lp) : "",
    responsiblePerson: beschreibung?.verantwortlicher?.name ?? mod.verantwortlicher?.name ?? "",
    grading: pruefung ? gradedText(pruefung.benotet) : "",
    examType: pruefung?.pruefungsform?.name ?? "",
    teachingLanguage: beschreibung?.addressedLanguages ?? "",
    // The API's granted endpoints only expose the module's Fachgebiet (orgUnit), not its parent
    // Institut/Fakultät hierarchy — those two fields are left empty (a known fidelity gap vs. the
    // old scrape, which read them off a page that showed the full org hierarchy).
    faculty: "",
    institute: "",
    orgUnit: mod.oe?.name ?? "",
    learningOutcomes: beschreibung?.lernergebnisseDE ?? "",
    content: beschreibung?.lehrinhalteDE ?? "",
    startingSemesters: beschreibung?.makroturnus?.name ?? "",
    components,
    usedInPrograms,
  };
}
