/**
 * Types for the Moses REST API v2 (https://moseskonto.tu-berlin.de/moses/api/v2).
 *
 * Field names below are verified against live API responses, not just the
 * OpenAPI spec's declared schemas — the spec's $ref for the legacy
 * "bolognamodulliste" entity family is misleading (it points at
 * EModulliste/EStudiengangsbereich-shaped schemas, but live responses use
 * different field names, documented per-entity below).
 */

export interface ERef {
  id: number;
  name?: string;
  mosesTypeCode: string;
  endpointPath?: string;
}

export interface EPagedResponse<T> {
  totalPages: number;
  pageNumber: number;
  pageSize: number;
  data: T[];
}

export interface EApiError {
  error: { code: number; message: string };
}

export interface EStudiengang {
  id: number;
  name: string;
  kurzname: string;
  studiengangart?: ERef;
  organisationseinheit?: ERef;
  stupoList: ERef[];
  visible: boolean;
  description?: string;
  link?: string;
}

export interface EStupo {
  id: number;
  name: string;
  jahr?: number;
  ausgelaufen: boolean;
  leistungspunkte?: number;
  regelstudienzeit?: number;
  studiengang?: ERef;
  erstesEinschreibesemester?: ERef;
  letztesEinschreibesemester?: ERef;
  visible: boolean;
}

export interface ESemester {
  id: number;
  name: string;
  startDate?: string;
  endDate?: string;
  semesterTyp?: string;
}

export interface EStudiengangsabbildung {
  id: number;
  stupo: ERef;
  bereicheFreigegeben: boolean;
  studiengangsbereichList: ERef[];
  modullisteList: ERef[];
  bolognamodullisteList: ERef[];
}

// --- "New" curriculum model (studiengangsbereich) ---

export interface EStudiengangsbereich {
  id: number;
  name: string;
  studiengangsabbildung?: ERef;
  rang?: number;
  beschreibung?: string;
  studienrichtungsbereich?: boolean;
  studiengangswahlregelList: ERef[];
  studiengangszuordnungList: ERef[];
  parent?: ERef;
  childrenList: ERef[];
}

export interface EStudiengangsbereichWahlregel {
  id: number;
  studiengangsbereich?: ERef;
  wahlregeltyp: string;
  wert?: number;
}

export interface EStudiengangszuordnung {
  id: number;
  bolognamodulVersion: ERef;
  studiengangsbereich: ERef;
  modultitel: string;
  modullp: number;
  modulbenotet: boolean;
  makroturnus?: ERef;
  bolognamodulPruefungsform?: ERef;
  modulgewichtung?: number;
}

// --- "Legacy" curriculum model (bolognamodulliste) ---

export interface EBolognamodulliste {
  id: number;
  studiengangsabbildung: ERef;
  semester: ERef;
  freigabe: boolean;
  bolognamodulListengruppeList: ERef[];
}

export interface EBolognamodulListengruppe {
  id: number;
  name: string;
  bolognamodulListe?: ERef;
  rang?: number;
  bolognamodulListenwahlregelList: ERef[];
  bolognamodulListenzuordnungList: ERef[];
  parent?: ERef;
  childrenList: ERef[];
}

export interface EBolognamodulListenwahlregel {
  id: number;
  bolognamodulListengruppe?: ERef;
  wahlregeltyp: string;
  wertmin?: number;
  wertmax?: number;
}

export interface EBolognamodulListenzuordnung {
  id: number;
  bolognamodulVersion: ERef;
  bolognamodulListengruppe: ERef;
  modultitel: string;
  modullp: number;
  modulbenotet: boolean;
  makroturnus?: ERef;
  bolognamodulPruefungsform?: ERef;
  modulgewichtung?: number;
}

// --- Module description graph (shared by both curriculum models) ---

export interface EBolognamodul {
  id: number;
  name: string;
  number: number;
  verantwortlicher?: ERef;
  oe?: ERef;
  sekretariat?: ERef;
  email?: string;
  webseite?: string;
  bolognamodulVersionList: ERef[];
}

export interface EBolognamodulVersion {
  id: number;
  bolognamodul: ERef;
  versionsnummer: number;
  semesterAb?: ERef;
  semesterBis?: ERef;
  bolognamodulBeschreibung?: ERef;
  // Present on the /bolognamodulversion?modulTitel= search response.
  name?: string;
}

export interface EBolognamodulBeschreibung {
  id: number;
  version?: ERef;
  lp: number;
  verantwortlicher?: ERef;
  lernergebnisseDE?: string;
  lernergebnisseEN?: string;
  lehrinhalteDE?: string;
  lehrinhalteEN?: string;
  semesterDauer?: number;
  makroturnus?: ERef;
  /**
   * NOT the module's Lehrveranstaltungen — these are unrelated Aufwand
   * placeholder entries. The real components live nested under
   * bestandteilGruppeList -> EBolognamodulBestandteilGruppe.bestandteilList.
   */
  bestandteilList: ERef[];
  bestandteilGruppeList: ERef[];
  pruefung?: ERef;
  addressedLanguages?: string;
  availableLanguages?: string;
}

export interface EBolognamodulBestandteilGruppe {
  id: number;
  name: string;
  beschreibung?: ERef;
  typ?: string;
  typNummerMin?: number;
  typNummerMax?: number;
  bestandteilList: ERef[];
}

export interface EBolognamodulPruefung {
  id: number;
  benotet: boolean;
  pruefungsform?: ERef;
  sprache?: string;
  dauerumfangDE?: string;
  dauerumfangEN?: string;
  portfolioart?: ERef;
}

export interface EBolognamodulPruefungsform {
  id: number;
  name: string;
}

export interface EBolognamodulBestandteil {
  id: number;
  bestandteilGruppe?: ERef;
  rang?: number;
  lvTitel: string;
  lvLehrformat?: ERef;
  lvNummer?: string;
  lvMakroturnus?: ERef;
  lvSprache?: string;
  lvSws?: number;
}
