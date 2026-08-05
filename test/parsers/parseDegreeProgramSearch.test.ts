import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseDegreeProgramSearch } from "../../src/parsers/parseDegreeProgramSearch.js";

const html = readFileSync(path.resolve(__dirname, "../fixtures/degree-program-search.html"), "utf8");

describe("parseDegreeProgramSearch", () => {
  it("parses degree program search results", () => {
    const results = parseDegreeProgramSearch(html);
    expect(results.length).toBeGreaterThan(0);

    const informatik = results.find((r) => r.name === "Informatik");
    expect(informatik).toBeDefined();
    expect(informatik?.shortName).toBe("IN");
    expect(informatik?.degreeType).toBe("Bachelor of Science");
    expect(informatik?.faculty).toBe("Fakultät IV");
    expect(informatik?.id).toBe("31");
  });
});
