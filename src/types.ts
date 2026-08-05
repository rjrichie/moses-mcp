export interface DegreeProgramSummary {
  id: string;
  name: string;
  shortName: string;
  degreeType: string;
  faculty: string;
  url: string;
}

export interface ProgramAreaSummary {
  /** Path segments from root, e.g. ["Modulliste WiSe 2025/26", "Wahlpflichtbereich", "Wahlpflichtbereich Theoretische Informatik"] */
  path: string[];
  name: string;
  rowKey: string;
  subAreaCount: number;
  moduleCount: number;
  lp: string;
}

export interface DegreeProgramStructure {
  programId: string;
  name: string;
  degreeType: string;
  shortName: string;
  faculty: string;
  selectedStupo?: { value: string; label: string };
  selectedSemester?: { value: string; label: string };
  availableStupos: { value: string; label: string }[];
  availableSemesters: { value: string; label: string }[];
  mapped: boolean;
  areas: ProgramAreaSummary[];
}

export interface AreaModule {
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

export interface AreaModulesResult {
  modules: AreaModule[];
  /**
   * StuPO-defined conditions for passing this curriculum area (e.g. "at
   * least 6, at most 9 LP" or category requirements) that are NOT implied
   * by the module list alone. Respect these when composing a study plan —
   * don't just pick modules until a credit target is met.
   */
  passingRules: string[];
}

export interface ModuleSearchResult {
  moduleNumber: string;
  version: string;
  title: string;
  languages: string;
  lp: string;
  grading: string;
  responsiblePerson: string;
  orgUnit: string;
  descriptionUrl: string;
}

export interface ProgramUsage {
  programName: string;
  programUrl: string;
  stupoCount: string;
  usageCount: string;
  firstUsed: string;
  lastUsed: string;
}

export interface ModuleDetail {
  moduleNumber: string;
  version: string;
  title: string;
  validity: string;
  languagesAvailable: string;
  lp: string;
  responsiblePerson: string;
  grading: string;
  examType: string;
  teachingLanguage: string;
  faculty: string;
  institute: string;
  orgUnit: string;
  learningOutcomes: string;
  content: string;
  usedInPrograms: ProgramUsage[];
}
