# moses-mcp

An MCP server for **discovering** degree programs and modules in [Moses](https://moseskonto.tu-berlin.de/moses/) — TU Berlin's course, exam, and module planning system. It talks to Moses' official REST API (`https://moseskonto.tu-berlin.de/moses/api/v2`), which innoCampus (who run Moses) can provision on request.

## Scope

- Search and browse degree programs (Studiengänge) and their curriculum structure (Pflichtbereich, Wahlpflichtbereich, ...).
- Search modules and read full module descriptions, including exam type (Prüfungsform) and which other degree programs use a given module.
- Out of scope: Vorlesungsverzeichnis (VVZ)/timetables, and anything requiring login (exam registration, editing module data).

## Tools

| Tool | What it does |
|---|---|
| `search_degree_programs` | Search degree programs by name, e.g. "Informatik" |
| `get_degree_program_structure` | Get a program's curriculum areas (Pflichtbereich, Wahlpflichtbereich, ...) with module/credit counts |
| `list_area_modules` | List the modules in one curriculum area, with credits, grading, exam type, and Turnus — plus the StuPO's passing rules for that area (e.g. credit min/max) |
| `search_modules` | Search modules by title or number, e.g. "Computer Vision" |
| `get_module_details` | Full module description: content, exam type, and which other degree programs use it |

Example things you can ask an MCP client connected to this server:

- "Which modules are mandatory (Pflichtmodul) for the Informatik B.Sc.?"
- "Of those, which use a Portfolioprüfung instead of a written exam?"
- "Recommend some Computer Vision modules for the Computer Science Master's."
- "What other degree programs can take module 40022?"
- "Make me a 6-semester study plan for the Informatik B.Sc. specializing in Theoretical Computer Science" (respects each area's StuPO passing rules, not just credit totals)

## Requirements

- Node.js 20 or later
- A Moses API token (see below)

## API access

There's no self-service signup — email innoCampus (who run Moses) and ask for API access; they'll issue a token and tell you which endpoints are enabled for it. Keep the token secret: it authenticates as you, and the endpoint owners can rate-limit or block API keys that generate excessive load (e.g. bulk-scanning without cause), so use `refresh: true` sparingly and avoid scripting bulk queries beyond what this tool already does.

## Setup

```bash
git clone <this-repo>
cd moses-mcp
npm install
cp .env.example .env   # then edit .env and set API_TOKEN=<your token>
npm run build
```

This produces a runnable server at `dist/index.js`, which communicates over stdio (standard MCP transport). The server reads `.env` itself on startup (resolved next to its own install location, not the caller's working directory), so a `.env` file in this project directory is enough — you don't need to configure the token separately in your MCP client, though you can (see below) if you'd rather not keep it in a file.

## Using it with an MCP client

### Claude Code

```bash
claude mcp add moses -- node /absolute/path/to/moses-mcp/dist/index.js
```

This registers the server at local scope (just this project, just you). Use `-s user` to make it available in every project, or `-s project` to check a shared `.mcp.json` into this repo for teammates. Check `claude mcp list` or run `/mcp` inside a session to confirm it's connected.

### Claude Desktop / other stdio clients

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

Any MCP client that supports stdio servers can use this the same way — point it at `node dist/index.js`. If you'd rather not keep the token in `.env`, most clients also let you set per-server environment variables directly in their config (e.g. add `"env": {"API_TOKEN": "..."}` alongside `"command"`/`"args"` above) instead.

## Enabling cross-program module usage lookups

`get_module_details`'s `usedInPrograms` (which other degree programs use a module) needs a reverse-lookup index that Moses' API doesn't support querying directly — building it means scanning the full assignment tables (~445k records), which takes on the order of 10-15 minutes. So it's never built automatically; run it explicitly, and re-run occasionally to refresh (it's cached for 7 days regardless):

```bash
npm run build-usage-index
```

Until this has been run at least once, `usedInPrograms` comes back as an empty list rather than blocking tool calls.

## Development

```bash
npm install
npm run dev     # run the MCP server via stdio (tsx, no build step)
npm run build   # compile to dist/
npm test        # run unit tests against fixture data (no network)
npm run e2e     # build, then exercise all 5 tools against the LIVE API
```

`src/api/client.ts` is the typed REST client (token auth via `X-API-Key`, batched `idlist` lookups, a small concurrency cap). `src/api/entities.ts` has the API's entity shapes. The trickiest part of `src/services/degreePrograms.ts` is that Moses' curriculum data comes in two structurally different shapes depending on the StuPO: a newer `studiengangsbereich` model, and an older per-semester `bolognamodulliste` model still used by some programs (Informatik B.Sc. among them) — `get_degree_program_structure`/`list_area_modules` detect and handle both. `src/services/moduleUsageIndex.ts` builds the cross-program usage index described above. `scripts/e2e-check.ts` runs the built server end-to-end against the live API.

## Troubleshooting

- **A degree program's curriculum looks empty / `mapped: false`**: not every Studien-/Prüfungsordnung (StuPO) has curriculum data mapped yet. `get_degree_program_structure` automatically tries a few recent StuPOs to find one with data if you don't specify `stupo`/`semester` explicitly.
- **Stale results after a Moses update**: pass `refresh: true` to any tool to bypass the cache, or delete the `.cache/` directory.
- **`get_module_details`'s `usedInPrograms` is always empty**: run `npm run build-usage-index` at least once — see above.
- **A tool errors unexpectedly**: the Moses API is under active development and has some known rough edges (e.g. `idlist` silently doesn't filter on a couple of endpoints — already worked around in `src/api/client.ts`). If a new one shows up, issues/PRs welcome.
