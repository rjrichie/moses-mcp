/**
 * End-to-end check: spawns the built MCP server over stdio and walks through
 * the four example queries the tool was designed for. Run with:
 *   npm run build && npx tsx scripts/e2e-check.ts
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

function textOf(result: any): any {
  const text = result.content?.[0]?.text;
  return text ? JSON.parse(text) : result;
}

async function main() {
  const transport = new StdioClientTransport({
    command: "node",
    args: ["dist/index.js"], // built via `npm run build`, path relative to cwd (project root)
  });
  const client = new Client({ name: "e2e-check", version: "0.1.0" });
  await client.connect(transport);

  console.log("=== Query 1: Pflichtmodule for Informatik B.Sc. ===");
  const searchRes = textOf(
    await client.callTool({ name: "search_degree_programs", arguments: { query: "Informatik" } }),
  );
  const informatik = searchRes.find((p: any) => p.name === "Informatik" && p.degreeType.includes("Bachelor"));
  if (!informatik) throw new Error("Informatik B.Sc. not found in search results");
  console.log("Found program:", informatik.name, informatik.id);

  const structure = textOf(
    await client.callTool({ name: "get_degree_program_structure", arguments: { programId: informatik.id } }),
  );
  console.log("Resolved StuPO/semester:", structure.selectedStupo, structure.selectedSemester);
  const pflicht = structure.areas.find((a: any) => a.name === "Pflichtbereich");
  if (!pflicht) throw new Error("Pflichtbereich not found");
  console.log(`Pflichtbereich: ${pflicht.moduleCount} modules, ${pflicht.lp} LP`);

  const areaModules = textOf(
    await client.callTool({
      name: "list_area_modules",
      arguments: {
        programId: informatik.id,
        stupo: structure.selectedStupo.value,
        semester: structure.selectedSemester.value,
        area: "Pflichtbereich",
      },
    }),
  );
  console.log(`list_area_modules returned ${areaModules.length} modules`);
  if (areaModules.length !== pflicht.moduleCount) {
    throw new Error(`Expected ${pflicht.moduleCount} modules, got ${areaModules.length}`);
  }

  console.log("\n=== Query 2: which Pflichtmodule use Portfolioprüfung ===");
  const portfolio = areaModules.filter((m: any) => m.examType === "Portfolioprüfung");
  console.log(
    `${portfolio.length} modules use Portfolioprüfung:`,
    portfolio.map((m: any) => m.name),
  );
  if (portfolio.length === 0) throw new Error("Expected at least one Portfolioprüfung module");

  console.log("\n=== Query 3: Computer Vision module recommendations ===");
  const cvModules = textOf(await client.callTool({ name: "search_modules", arguments: { query: "Computer Vision" } }));
  console.log(`Found ${cvModules.length} Computer Vision modules:`, cvModules.map((m: any) => m.title));
  if (cvModules.length === 0) throw new Error("Expected Computer Vision modules");

  console.log("\n=== Query 4: cross-program usage for a module ===");
  const detail = textOf(
    await client.callTool({ name: "get_module_details", arguments: { moduleNumber: "40022" } }),
  );
  console.log(`Module ${detail.moduleNumber}/${detail.version} "${detail.title}" is used in:`);
  for (const p of detail.usedInPrograms) console.log(` - ${p.programName}`);
  if (detail.usedInPrograms.length === 0) throw new Error("Expected cross-program usage data");

  console.log("\nAll checks passed.");
  await client.close();
}

main().catch((err) => {
  console.error("E2E check FAILED:", err);
  process.exit(1);
});
