#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { loadEnvFile } from "./loadEnv.js";
import { getDegreeProgramStructure, listAreaModules, searchDegreePrograms } from "./services/degreePrograms.js";
import { getModuleDetails, searchModules } from "./services/modules.js";

// MCP clients generally don't forward arbitrary env vars to spawned server
// processes, so load .env ourselves rather than relying on the caller.
loadEnvFile();

const server = new McpServer({
  name: "moses-mcp",
  version: "0.1.0",
});

const refreshParam = z.boolean().optional().describe("Bypass the local cache and re-fetch from Moses");

server.registerTool(
  "search_degree_programs",
  {
    title: "Search degree programs",
    description:
      "Search TU Berlin Moses degree programs (Studiengänge) by name, e.g. 'Informatik' or 'Computer Science'. " +
      "Returns each program's id (needed by get_degree_program_structure), short name, degree type (e.g. Bachelor of Science), and faculty.",
    inputSchema: {
      query: z.string().describe("Full or partial degree program name"),
      degreeType: z.string().optional().describe("Filter by degree type substring, e.g. 'Bachelor' or 'Master'"),
      faculty: z.string().optional().describe("Filter by faculty substring, e.g. 'Fakultät IV'"),
      refresh: refreshParam,
    },
  },
  async ({ query, degreeType, faculty, refresh }) => {
    const results = await searchDegreePrograms(query, { degreeType, faculty, refresh });
    return { content: [{ type: "text", text: JSON.stringify(results, null, 2) }] };
  },
);

server.registerTool(
  "get_degree_program_structure",
  {
    title: "Get degree program curriculum structure",
    description:
      "Get a degree program's curriculum areas (Pflichtbereich, Wahlpflichtbereich <name>, Wahlbereich, Bachelorarbeit, ...) " +
      "for a given StuPO + semester snapshot, with module/credit counts per area. " +
      "If stupo/semester are omitted, resolves the newest StuPO+semester Moses actually has curriculum data for. " +
      "Use the returned stupo/semester values with list_area_modules to see the actual modules in an area.",
    inputSchema: {
      programId: z.string().describe("Degree program id, from search_degree_programs"),
      stupo: z.string().optional().describe("Studien-/Prüfungsordnung id (the 'mkg' value), e.g. from a previous call's selectedStupo"),
      semester: z.string().optional().describe("Modulliste semester id, e.g. from a previous call's selectedSemester"),
      refresh: refreshParam,
    },
  },
  async ({ programId, stupo, semester, refresh }) => {
    const structure = await getDegreeProgramStructure(programId, { stupo, semester, refresh });
    return { content: [{ type: "text", text: JSON.stringify(structure, null, 2) }] };
  },
);

server.registerTool(
  "list_area_modules",
  {
    title: "List modules in a curriculum area",
    description:
      "List the modules assigned to one curriculum area of a degree program (e.g. 'Pflichtbereich' or " +
      "'Wahlpflichtbereich Theoretische Informatik'), for a specific StuPO + semester (get these from " +
      "get_degree_program_structure first). Each module includes credits (lp), whether it's graded, its exam " +
      "type (examType, e.g. 'Schriftliche Prüfung' or 'Portfolioprüfung'), and Turnus. Filter the results " +
      "client-side on examType to answer questions like 'which mandatory modules use a Portfolioprüfung'. " +
      "The result also includes passingRules: StuPO-defined conditions for passing this specific area (e.g. " +
      "'at least 6, at most 9 credits' or category requirements like requiring both a Seminar and a " +
      "Praktikum). These are NOT implied by the module list — when building a study plan, you MUST satisfy " +
      "each selected area's passingRules, not just pick modules until some overall credit target looks met.",
    inputSchema: {
      programId: z.string().describe("Degree program id"),
      stupo: z.string().describe("Studien-/Prüfungsordnung id (the 'mkg' value)"),
      semester: z.string().describe("Modulliste semester id"),
      area: z.string().describe("Area name (or exact row key) as returned by get_degree_program_structure, e.g. 'Pflichtbereich'"),
      refresh: refreshParam,
    },
  },
  async ({ programId, stupo, semester, area, refresh }) => {
    const modules = await listAreaModules(programId, stupo, semester, area, { refresh });
    return { content: [{ type: "text", text: JSON.stringify(modules, null, 2) }] };
  },
);

server.registerTool(
  "search_modules",
  {
    title: "Search modules",
    description:
      "Search TU Berlin Moses modules by title or exact module number, e.g. 'Computer Vision'. Useful for " +
      "discovering/recommending modules by topic. Returns module number/version, title, language(s), credits, " +
      "grading, responsible person, and organizational unit (Fachgebiet). Use get_module_details for the full " +
      "description and which degree programs use a given module.",
    inputSchema: {
      query: z.string().describe("Module title (partial match) or exact module number"),
      semester: z
        .string()
        .optional()
        .describe("Restrict to modules with a description valid in this semester id; defaults to the current semester"),
      refresh: refreshParam,
    },
  },
  async ({ query, semester, refresh }) => {
    const results = await searchModules(query, { semester, refresh });
    return { content: [{ type: "text", text: JSON.stringify(results, null, 2) }] };
  },
);

server.registerTool(
  "get_module_details",
  {
    title: "Get module details",
    description:
      "Get a module version's full description: title, credits, exam type (Prüfungsform), grading, teaching " +
      "language, faculty/institute/Fachgebiet, learning outcomes, content, Turnus (startingSemesters — which " +
      "semester(s) the module can be started in, e.g. 'Wintersemester', 'Sommersemester', or 'Winter- und " +
      "Sommersemester', plus a components list with per-Lehrveranstaltung Turnus), and — critically — the list " +
      "of degree programs (usedInPrograms) that use this module version. Use startingSemesters/components to " +
      "answer 'is this offered in winter or summer' when building a study plan — don't guess this from " +
      "validity dates. Use usedInPrograms to answer 'what other majors could take this module'. If version is " +
      "omitted, resolves the current version.",
    inputSchema: {
      moduleNumber: z.string().describe("Module number, e.g. '40022'"),
      version: z.string().optional().describe("Specific module version; defaults to the current version"),
      refresh: refreshParam,
    },
  },
  async ({ moduleNumber, version, refresh }) => {
    const detail = await getModuleDetails(moduleNumber, { version, refresh });
    return { content: [{ type: "text", text: JSON.stringify(detail, null, 2) }] };
  },
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error("moses-mcp failed to start:", err);
  process.exit(1);
});
