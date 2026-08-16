/**
 * Builds the "which degree programs use this module" reverse index used by
 * get_module_details' usedInPrograms field, and caches it to .cache/.
 *
 * This is a deliberately explicit, manually-triggered step — NOT run
 * automatically by the server — because it scans ~445k records across two
 * API endpoints that don't support server-side filtering, taking on the
 * order of 10-15 minutes. Re-run occasionally to refresh (curriculum
 * assignments change at most once/semester; the cached index is honored
 * for 7 days regardless). Until this has been run at least once,
 * usedInPrograms will come back empty.
 *
 * Usage: npm run build-usage-index
 */
import { loadEnvFile } from "../src/loadEnv.js";
import { buildAndCacheUsageIndex } from "../src/services/moduleUsageIndex.js";

loadEnvFile();

async function main() {
  const start = Date.now();
  const index = await buildAndCacheUsageIndex((message) => console.log(message));
  const versionCount = Object.keys(index).length;
  const elapsedMin = ((Date.now() - start) / 60000).toFixed(1);
  console.log(`\nDone in ${elapsedMin} min. Indexed usage for ${versionCount} distinct module versions.`);
}

main().catch((err) => {
  console.error("build-usage-index failed:", err);
  process.exit(1);
});
