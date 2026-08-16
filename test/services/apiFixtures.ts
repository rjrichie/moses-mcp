/**
 * A small, self-consistent fake object graph mirroring the Moses API's
 * shape (mimics both curriculum models plus a module description), used to
 * unit-test src/services/*.ts mapping logic without hitting the live API.
 * Field names/nesting were verified against real live responses during
 * development — see src/api/entities.ts's comments for provenance.
 */

export const DB: Record<string, any[]> = {
  studiengang: [
    {
      id: 1,
      name: "Testprogramm",
      kurzname: "TP",
      studiengangart: { name: "Bachelor of Science" },
      organisationseinheit: { name: "Fakultät Test" },
      stupoList: [{ id: 10 }],
      link: "https://example.com/testprogramm",
    },
    {
      id: 2,
      name: "Testprogramm New Model",
      kurzname: "TPN",
      studiengangart: { name: "Master of Science" },
      organisationseinheit: { name: "Fakultät Test" },
      stupoList: [{ id: 11 }],
      link: "https://example.com/testprogramm-new",
    },
  ],
  stupo: [
    { id: 10, name: "Testprogramm (B. Sc.) - StuPO 2020", ausgelaufen: false, jahr: 2020, studiengang: { id: 1 } },
    { id: 11, name: "Testprogramm New Model (M. Sc.) - StuPO 2022", ausgelaufen: false, jahr: 2022, studiengang: { id: 2 } },
  ],
  studiengangsabbildung: [
    {
      id: 100,
      stupo: { id: 10 },
      bereicheFreigegeben: false,
      studiengangsbereichList: [],
      bolognamodullisteList: [{ id: 200 }],
    },
    {
      id: 101,
      stupo: { id: 11 },
      bereicheFreigegeben: true,
      studiengangsbereichList: [{ id: 900 }],
      bolognamodullisteList: [],
    },
  ],
  bolognamodulliste: [
    { id: 200, studiengangsabbildung: { id: 100 }, semester: { id: 50 }, freigabe: true, bolognamodulListengruppeList: [{ id: 300 }, { id: 301 }] },
  ],
  semester: [{ id: 50, name: "WiSe 2020/21", startDate: "2020-10-01" }],
  bolognamodullistengruppe: [
    // Root container: unnamed, like the real synthetic root discovered live — must never surface as an area.
    { id: 300, bolognamodulListe: { id: 200 }, rang: 1, bolognamodulListenwahlregelList: [], bolognamodulListenzuordnungList: [], childrenList: [{ id: 301, name: "Pflichtbereich" }] },
    { id: 301, name: "Pflichtbereich", parent: { id: 300 }, bolognamodulListe: { id: 200 }, bolognamodulListenwahlregelList: [{ id: 400 }, { id: 401 }], bolognamodulListenzuordnungList: [{ id: 500 }], childrenList: [] },
  ],
  bolognamodullistenwahlregel: [
    { id: 400, wahlregeltyp: "BESTEHE_MIN_LP", wertmin: 6 },
    { id: 401, wahlregeltyp: "BESTEHE_MAX_LP", wertmax: 9 },
  ],
  bolognamodullistenzuordnung: [
    { id: 500, bolognamodulVersion: { id: 600 }, bolognamodulListengruppe: { id: 301 }, modultitel: "Testmodul", modullp: 6, modulbenotet: true, makroturnus: { name: "Wintersemester" }, bolognamodulPruefungsform: { name: "Schriftliche Prüfung" }, modulgewichtung: 1 },
  ],

  // New (studiengangsbereich) model, for a second program.
  studiengangsbereich: [
    { id: 900, name: "Kernmodule", parent: undefined, studiengangsabbildung: { id: 101 }, studiengangswahlregelList: [{ id: 402 }], studiengangszuordnungList: [{ id: 501 }], childrenList: [] },
  ],
  studiengangsbereichwahlregel: [{ id: 402, wahlregeltyp: "BESTEHE_ALLE" }],
  studiengangszuordnung: [
    { id: 501, bolognamodulVersion: { id: 601 }, studiengangsbereich: { id: 900 }, modultitel: "Kernmodul A", modullp: 9, modulbenotet: false, makroturnus: { name: "Sommersemester" }, bolognamodulPruefungsform: { name: "Portfolioprüfung" }, modulgewichtung: 1 },
  ],

  // Module description graph (both bolognamodulVersion ids resolve to modules below).
  bolognamodul: [
    { id: 700, name: "Testmodul", number: 12345, verantwortlicher: { name: "Muster, Max" }, oe: { name: "FG Testgebiet" }, bolognamodulVersionList: [{ id: 600 }] },
    { id: 701, name: "Kernmodul A", number: 54321, bolognamodulVersionList: [{ id: 601 }] },
  ],
  bolognamodulversion: [
    { id: 600, name: "Testmodul", bolognamodul: { id: 700 }, versionsnummer: 3, semesterAb: { id: 40, name: "WiSe 2018/19" }, semesterBis: undefined, bolognamodulBeschreibung: { id: 800 } },
    { id: 601, name: "Kernmodul A", bolognamodul: { id: 701 }, versionsnummer: 1, semesterAb: { id: 40, name: "WiSe 2018/19" } },
  ],
  bolognamodulbeschreibung: [
    { id: 800, lp: 6, verantwortlicher: { name: "Muster, Max" }, lernergebnisseDE: "Lernergebnisse-Text", lehrinhalteDE: "Inhalte-Text", makroturnus: { name: "Wintersemester" }, bestandteilGruppeList: [{ id: 850 }], bestandteilList: [], pruefung: { id: 900 }, addressedLanguages: "de", availableLanguages: "de,en" },
  ],
  bolognamodulbestandteilgruppe: [{ id: 850, name: "Pflichtbereich", bestandteilList: [{ id: 870 }, { id: 871 }] }],
  bolognamodulbestandteil: [
    { id: 870, rang: 1, lvTitel: "Testmodul", lvLehrformat: { name: "Vorlesung" }, lvNummer: "0000 L 001", lvMakroturnus: { name: "Wintersemester" }, lvSprache: "[de]" },
    { id: 871, rang: 2, lvTitel: "Testmodul", lvLehrformat: { name: "Übung" }, lvNummer: "0000 L 001T", lvMakroturnus: { name: "Wintersemester" }, lvSprache: "[de]" },
  ],
  bolognamodulpruefung: [{ id: 900, benotet: true, pruefungsform: { name: "Schriftliche Prüfung" } }],
};

function matchesId(entityId: number, ids: (number | string)[]): boolean {
  return ids.some((id) => Number(id) === entityId);
}

export async function mockApiGet(path: string, params?: Record<string, string | number | undefined>): Promise<any> {
  const entity = path.replace(/^\//, "");
  let data = DB[entity] ?? [];

  if (entity === "studiengangsabbildung" && params?.stupoId !== undefined) {
    data = data.filter((d) => d.stupo.id === Number(params.stupoId));
  }
  if (entity === "studiengang" && params?.name) {
    data = data.filter((d) => d.name.toLowerCase().includes(String(params.name).toLowerCase()));
  }
  if (entity === "bolognamodul" && params?.modulNummer !== undefined) {
    data = data.filter((d) => d.number === Number(params.modulNummer));
  }
  if (entity === "bolognamodulversion" && params?.modulTitel) {
    const needle = String(params.modulTitel).toLowerCase();
    data = data.filter((d) => (d.name ?? "").toLowerCase().includes(needle));
  }
  if (entity === "bolognamodulversion" && params?.modulNummer !== undefined) {
    const targetNumber = Number(params.modulNummer);
    data = data.filter((d) => DB.bolognamodul.find((m) => m.id === d.bolognamodul.id)?.number === targetNumber);
  }
  if (params?.idlist !== undefined) {
    const ids = decodeURIComponent(String(params.idlist)).split(",").map(Number);
    data = data.filter((d) => matchesId(d.id, ids));
  }

  return { totalPages: 1, pageNumber: 1, pageSize: data.length || 1, data };
}

export async function mockApiGetById(entity: string, id: number | string): Promise<any> {
  return (DB[entity] ?? []).find((d) => Number(d.id) === Number(id));
}

export async function mockApiFetchByIdlist(entity: string, ids: (number | string)[]): Promise<any[]> {
  if (ids.length === 0) return [];
  return (DB[entity] ?? []).filter((d) => matchesId(d.id, ids));
}

export async function mockApiFetchAllPages(entity: string): Promise<any[]> {
  return DB[entity] ?? [];
}
