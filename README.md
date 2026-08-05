# moses-mcp

An MCP server for **discovering** degree programs and modules in [Moses](https://moseskonto.tu-berlin.de/moses/) — TU Berlin's course, exam, and module planning system. It scrapes the public **Modulverzeichnis (MTS)** section, which requires no login and is meant to be browsed by students and staff.

There's no official Moses API, so this works by parsing the public MTS web pages directly.

## Scope

- Search and browse degree programs (Studiengänge) and their curriculum structure (Pflichtbereich, Wahlpflichtbereich, ...).
- Search modules and read full module descriptions, including exam type (Prüfungsform) and which other degree programs use a given module.
- Out of scope: Vorlesungsverzeichnis (VVZ)/timetables, and anything requiring login (exam registration, editing module data).

## Tools

| Tool | What it does |
|---|---|
| `search_degree_programs` | Search degree programs by name, e.g. "Informatik" |
| `get_degree_program_structure` | Get a program's curriculum areas (Pflichtbereich, Wahlpflichtbereich, ...) with module/credit counts |
| `list_area_modules` | List the modules in one curriculum area, with credits, grading, exam type, and Turnus |
| `search_modules` | Search modules by title or number, e.g. "Computer Vision" |
| `get_module_details` | Full module description: content, exam type, and which other degree programs use it |

Example things you can ask an MCP client connected to this server:

- "Which modules are mandatory (Pflichtmodul) for the Informatik B.Sc.?"
- "Of those, which use a Portfolioprüfung instead of a written exam?"
- "Recommend some Computer Vision modules for the Computer Science Master's."
- "What other degree programs can take module 40022?"

## Requirements

- Node.js 20 or later

## Setup

```bash
git clone <this-repo>
cd moses-mcp
npm install
npm run build
```

This produces a runnable server at `dist/index.js`, which communicates over stdio (standard MCP transport).

## Using it with an MCP client

Add it to your client's MCP server config, pointing at the built `dist/index.js`. For example, in Claude Desktop's `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "moses": {
      "command": "node",
      "args": ["/absolute/path/to/moses-mcp/dist/index.js"]
    }
  }
}
```

Any MCP client that supports stdio servers (Claude Code, Claude Desktop, etc.) can use this the same way — point it at `node dist/index.js`.

## A note on `robots.txt`

`moseskonto.tu-berlin.de/robots.txt` disallows automated access site-wide (`Disallow: /`), even though the MTS pages themselves require no authentication and are intended for public browsing. This tool is built for personal, low-volume use — not bulk crawling:

- Requests are serialized (no concurrency) with a delay between them.
- A descriptive User-Agent is sent.
- Results are cached locally (default 24h TTL) so repeat lookups don't re-hit the server.

If you plan to use this beyond personal/occasional lookups, consider reaching out to innoCampus (who run Moses) about proper API access instead.

## Development

```bash
npm install
npm run dev     # run the MCP server via stdio (tsx, no build step)
npm run build   # compile to dist/
npm test        # run parser unit tests against saved HTML fixtures
```

Since Moses is a stateful server-rendered app (Jakarta Faces/PrimeFaces) rather than a REST API, most of the scraping logic lives in `src/parsers/` (HTML/XML parsing with cheerio) and `src/mosesClient.ts` (a small, polite HTTP client with a session cookie jar). `scripts/prototype-area-expand.ts` is a standalone script documenting/validating the one stateful AJAX interaction the tool replicates (expanding a curriculum area). `scripts/e2e-check.ts` runs the built server end-to-end against the live site.

## Troubleshooting

- **A degree program's curriculum looks empty / `mapped: false`**: not every Studien-/Prüfungsordnung (StuPO) has a curriculum mapped for every semester yet. `get_degree_program_structure` automatically tries a few StuPOs to find one with data if you don't specify `stupo`/`semester` explicitly.
- **Stale results after a Moses update**: pass `refresh: true` to any tool to bypass the cache, or delete the `.cache/` directory.
- **A tool errors on an unfamiliar page structure**: Moses' HTML can change between semesters/releases. Since this scrapes public pages rather than using a stable API, parsers in `src/parsers/` may need small updates if that happens — issues/PRs welcome.
