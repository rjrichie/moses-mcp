import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { resolveCurrentVersion } from "../../src/parsers/parseModuleOverview.js";

const html = readFileSync(path.resolve(__dirname, "../fixtures/module-overview.html"), "utf8");

describe("resolveCurrentVersion", () => {
  it("resolves the current version from the module overview page", () => {
    const current = resolveCurrentVersion(html);
    expect(current).toEqual({ moduleNumber: "40022", version: "11" });
  });
});
