# moses-mcp

An MCP server for **discovering** degree programs and modules in [Moses](https://moseskonto.tu-berlin.de/moses/) — TU Berlin's course, exam, and module planning system. It scrapes the public **Modulverzeichnis (MTS)** section, which requires no login and is meant to be browsed by students and staff.

## Scope

- Search and browse degree programs (Studiengänge) and their curriculum structure (Pflichtbereich, Wahlpflichtbereich, ...).
- Search modules and read full module descriptions, including exam type (Prüfungsform) and which other degree programs use a given module.
- Out of scope: Vorlesungsverzeichnis (VVZ)/timetables, and anything requiring login (exam registration, editing module data).

## A note on `robots.txt`

`moseskonto.tu-berlin.de/robots.txt` disallows automated access site-wide (`Disallow: /`), even though the MTS pages themselves require no authentication and are intended for public browsing. This tool is built for personal, low-volume use — not bulk crawling:

- Requests are serialized (no concurrency) with a delay between them.
- A descriptive User-Agent is sent.
- Results are cached locally (default 24h TTL) so repeat lookups don't re-hit the server.

If you plan to use this beyond personal/occasional lookups, consider reaching out to innoCampus (who run Moses) about proper API access instead.

## Development

```bash
npm install
npm run dev     # run the MCP server via stdio (tsx)
npm run build   # compile to dist/
npm test        # run parser unit tests
```

See `/Users/richiejonathan/.claude/plans/i-want-to-create-tranquil-pie.md` for the implementation plan.
