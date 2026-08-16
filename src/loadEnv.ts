/**
 * Minimal, dependency-free .env loader. The server needs API_TOKEN to be
 * set, but MCP clients (Claude Desktop, Claude Code, the SDK's
 * StdioClientTransport used by scripts/e2e-check.ts, ...) generally do NOT
 * forward arbitrary env vars to the spawned server process — only a safe
 * allowlist (PATH, HOME, etc). So the server loads .env itself here, on
 * startup, rather than relying on the parent process to have sourced it.
 *
 * Resolved relative to this file's own location (not process.cwd()), since
 * an MCP client may spawn `node dist/index.js` from any working directory.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export function loadEnvFile(): void {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const envPath = path.resolve(here, "..", ".env");

  let raw: string;
  try {
    raw = readFileSync(envPath, "utf8");
  } catch {
    return; // No .env present — fine, e.g. if API_TOKEN is set some other way.
  }

  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;

    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}
