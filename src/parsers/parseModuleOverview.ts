import * as cheerio from "cheerio";

/**
 * Resolve the current (first-listed / "Aktuelle Modulbeschreibung") version
 * for a module from its overview page (bolognamodule/ansehen.html).
 */
export function resolveCurrentVersion(html: string): { moduleNumber: string; version: string } | undefined {
  const $ = cheerio.load(html);
  const link = $('a[title="Modulbeschreibung dieser Version ansehen"]').first();
  const href = link.attr("href");
  if (!href) return undefined;
  const match = href.match(/nummer=(\d+)&(?:amp;)?version=(\d+)/);
  if (!match) return undefined;
  return { moduleNumber: match[1], version: match[2] };
}
