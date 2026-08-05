import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseModuleSearch } from "../../src/parsers/parseModuleSearch.js";

const html = readFileSync(path.resolve(__dirname, "../fixtures/module-search.html"), "utf8");

describe("parseModuleSearch", () => {
  it("parses module search results", () => {
    const results = parseModuleSearch(html);
    expect(results.length).toBe(6);

    const applied = results.find((r) => r.title === "Applied Computer Vision");
    expect(applied).toBeDefined();
    expect(applied?.moduleNumber).toBe("40282");
    expect(applied?.version).toBe("7");
    expect(applied?.languages).toBe("en");
    expect(applied?.lp).toBe("6");
    expect(applied?.orgUnit).toContain("Computer Vision and Remote Sensing");
    expect(applied?.descriptionUrl).toContain("nummer=40282");
  });
});
