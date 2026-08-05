import { cached } from "../cache.js";
import { mosesClient } from "../mosesClient.js";
import { parseModuleSearch } from "../parsers/parseModuleSearch.js";
import { parseModuleDetail } from "../parsers/parseModuleDetail.js";
import { resolveCurrentVersion } from "../parsers/parseModuleOverview.js";
import type { ModuleDetail, ModuleSearchResult } from "../types.js";

export async function searchModules(
  query: string,
  opts: { semester?: string; refresh?: boolean } = {},
): Promise<ModuleSearchResult[]> {
  const params = new URLSearchParams({ text: query });
  if (opts.semester) params.set("modulversionGueltigkeitSemester", opts.semester);
  const url = `/moses/modultransfersystem/bolognamodule/suchen.html?${params.toString()}`;

  const html = await cached(`module-search:${query}:${opts.semester ?? ""}`, () => mosesClient.get(url), {
    refresh: opts.refresh,
  });
  return parseModuleSearch(html);
}

export async function getModuleDetails(
  moduleNumber: string,
  opts: { version?: string; refresh?: boolean } = {},
): Promise<ModuleDetail> {
  let version = opts.version;

  if (!version) {
    const overviewUrl = `/moses/modultransfersystem/bolognamodule/ansehen.html?number=${encodeURIComponent(moduleNumber)}`;
    const overviewHtml = await cached(`module-overview:${moduleNumber}`, () => mosesClient.get(overviewUrl), {
      refresh: opts.refresh,
    });
    const current = resolveCurrentVersion(overviewHtml);
    if (!current) {
      throw new Error(`Could not resolve current version for module ${moduleNumber}`);
    }
    version = current.version;
  }

  const detailUrl = `/moses/modultransfersystem/bolognamodule/beschreibung/anzeigen.html?nummer=${encodeURIComponent(
    moduleNumber,
  )}&version=${encodeURIComponent(version)}`;
  const html = await cached(`module-detail:${moduleNumber}:${version}`, () => mosesClient.get(detailUrl), {
    refresh: opts.refresh,
  });
  return parseModuleDetail(html);
}
