/**
 * End-to-end check: spawns the built MCP server over stdio and walks through
 * example queries the tool was designed for, against the LIVE Moses API.
 * Run with:
 *   npm run build && npx tsx scripts/e2e-check.ts
 *
 * Area names/counts below are tied to Informatik B.Sc.'s current StuPO,
 * which this script resolves dynamically (via get_degree_program_structure)
 * rather than hardcoding a StuPO id — but the specific area names asserted
 * on (e.g. "Fachübergreifende Kompetenzen") reflect Informatik's curriculum
 * structure AS OF the newest StuPO at the time this was last updated,  and
 * may need updating again if/when TU Berlin restructures the curriculum.
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

  console.log("=== Query 1: degree program + curriculum structure resolution for Informatik B.Sc. ===");
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
  if (!structure.mapped || structure.areas.length === 0) throw new Error("Expected a mapped curriculum with areas");
  const pflicht = structure.areas.find((a: any) => a.name === "Pflichtbereich");
  if (!pflicht) throw new Error("Pflichtbereich not found");
  console.log(`Pflichtbereich: ${pflicht.subAreaCount} sub-areas`);

  const fachuebergreifend = structure.areas.find((a: any) => a.name === "Fachübergreifende Kompetenzen");
  if (!fachuebergreifend) throw new Error("Fachübergreifende Kompetenzen not found");

  const fuArea = textOf(
    await client.callTool({
      name: "list_area_modules",
      arguments: {
        programId: informatik.id,
        stupo: structure.selectedStupo.value,
        semester: structure.selectedSemester.value,
        area: "Fachübergreifende Kompetenzen",
      },
    }),
  );
  console.log(`list_area_modules returned ${fuArea.modules.length} modules`);
  console.log("passingRules:", fuArea.passingRules);
  if (fuArea.modules.length !== fachuebergreifend.moduleCount) {
    throw new Error(`Expected ${fachuebergreifend.moduleCount} modules, got ${fuArea.modules.length}`);
  }
  if (fuArea.passingRules.length === 0) {
    throw new Error("Expected at least one passing rule for Fachübergreifende Kompetenzen");
  }

  console.log("\n=== Query 2: which of those modules use Portfolioprüfung ===");
  const portfolio = fuArea.modules.filter((m: any) => m.examType === "Portfolioprüfung");
  console.log(
    `${portfolio.length} modules use Portfolioprüfung:`,
    portfolio.map((m: any) => m.name),
  );
  if (portfolio.length === 0) throw new Error("Expected at least one Portfolioprüfung module");

  console.log("\n=== Query 2b: Wahlpflicht area passing rules (StuPO min/max credits) ===");
  const wahlpflichtArea = textOf(
    await client.callTool({
      name: "list_area_modules",
      arguments: {
        programId: informatik.id,
        stupo: structure.selectedStupo.value,
        semester: structure.selectedSemester.value,
        area: "Programmierpraktikum",
      },
    }),
  );
  console.log("passingRules:", wahlpflichtArea.passingRules);
  if (wahlpflichtArea.passingRules.length < 2) {
    throw new Error("Expected at least two passing rules (min + max credits) for the Wahlpflicht area");
  }

  console.log("\n=== Query 3: Computer Vision module recommendations ===");
  const cvModules = textOf(await client.callTool({ name: "search_modules", arguments: { query: "Computer Vision" } }));
  console.log(`Found ${cvModules.length} Computer Vision modules:`, cvModules.map((m: any) => m.title));
  if (cvModules.length === 0) throw new Error("Expected Computer Vision modules");

  console.log("\n=== Query 4: module detail resolution (incl. cross-program usage) ===");
  const detail = textOf(
    await client.callTool({ name: "get_module_details", arguments: { moduleNumber: "40022" } }),
  );
  console.log(`Module ${detail.moduleNumber}/${detail.version} "${detail.title}"`);
  if (!detail.title || !detail.content) throw new Error("Expected a resolved module description");
  // usedInPrograms depends on `npm run build-usage-index` having been run at
  // least once (that reverse lookup is deliberately NOT built automatically
  // — see src/services/moduleUsageIndex.ts — since a full build takes on
  // the order of minutes). Report it, but don't fail the check over it.
  if (detail.usedInPrograms.length > 0) {
    console.log("usedInPrograms:");
    for (const p of detail.usedInPrograms) console.log(` - ${p.programName}`);
  } else {
    console.log("usedInPrograms is empty (expected unless `npm run build-usage-index` has been run).");
  }

  console.log("\nAll checks passed.");
  await client.close();
}

main().catch((err) => {
  console.error("E2E check FAILED:", err);
  process.exit(1);
});
