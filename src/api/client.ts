/**
 * Typed client for the Moses REST API v2
 * (https://moseskonto.tu-berlin.de/moses/api/v2), token-authenticated via
 * an X-API-Key header. This is sanctioned, documented API access (unlike
 * the HTML scraping this replaces), so there's no need for a cookie jar or
 * a conservative serialized request queue — just a small concurrency cap
 * as a courtesy against bursty bulk fetches (see moduleUsageIndex.ts).
 */
import type { EApiError, EPagedResponse } from "./entities.js";

const BASE_URL = "https://moseskonto.tu-berlin.de/moses/api/v2";
const USER_AGENT = "moses-mcp/0.2 (token-authenticated API client)";
const MAX_CONCURRENCY = 4;
const IDLIST_CHUNK_SIZE = 200;

function getApiToken(): string {
  const token = process.env.API_TOKEN;
  if (!token) {
    throw new Error("API_TOKEN environment variable is not set. Add it to .env (see .env.example).");
  }
  return token;
}

/** Simple counting semaphore limiting in-flight requests. */
class ConcurrencyLimiter {
  private active = 0;
  private queue: (() => void)[] = [];

  async run<T>(fn: () => Promise<T>): Promise<T> {
    if (this.active >= MAX_CONCURRENCY) {
      await new Promise<void>((resolve) => this.queue.push(resolve));
    }
    this.active++;
    try {
      return await fn();
    } finally {
      this.active--;
      this.queue.shift()?.();
    }
  }
}

const limiter = new ConcurrencyLimiter();

function buildUrl(path: string, params?: Record<string, string | number | undefined>): string {
  // NOTE: new URL(path, base) treats a leading-slash path as absolute from
  // the origin, which would silently drop BASE_URL's "/moses/api/v2"
  // prefix — always concatenate instead.
  const cleanPath = path.startsWith("/") ? path.slice(1) : path;
  const url = new URL(`${BASE_URL}/${cleanPath}`);
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined) url.searchParams.set(key, String(value));
    }
  }
  return url.toString();
}

const MAX_RETRIES = 3;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function rawRequest(url: string): Promise<unknown> {
  return limiter.run(async () => {
    let lastErr: unknown;
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      if (attempt > 0) await sleep(500 * 2 ** (attempt - 1));
      try {
        const res = await fetch(url, {
          headers: { "X-API-Key": getApiToken(), "User-Agent": USER_AGENT },
        });
        const body = (await res.json()) as unknown;
        if (!res.ok) {
          const err = body as EApiError;
          const message = err?.error?.message ?? res.statusText;
          throw new Error(`Moses API request failed: GET ${url} -> ${res.status} ${message}`);
        }
        return body;
      } catch (err) {
        lastErr = err;
        // Only retry transient network failures, not HTTP-level errors (4xx/5xx already thrown above).
        if (!(err instanceof TypeError) && !(err instanceof Error && err.message.includes("fetch failed"))) {
          throw err;
        }
      }
    }
    throw lastErr;
  });
}

/** GET a paginated Moses API list endpoint, e.g. "/studiengang" with {name: "Informatik"}. */
export async function apiGet<T>(
  path: string,
  params?: Record<string, string | number | undefined>,
): Promise<EPagedResponse<T>> {
  return (await rawRequest(buildUrl(path, params))) as EPagedResponse<T>;
}

/**
 * GET a single entity by id, e.g. apiGetById<EStudiengang>("studiengang", 31).
 * The Moses API wraps even single-entity lookups in {data: [entity]}.
 * Returns undefined on a 404 ("not found" is a normal outcome when
 * resolving an optional ref, not an exceptional one).
 */
export async function apiGetById<T>(entity: string, id: number | string): Promise<T | undefined> {
  try {
    const res = (await rawRequest(buildUrl(`/${entity}/${id}`))) as EPagedResponse<T>;
    return res.data[0];
  } catch (err) {
    if (err instanceof Error && / 404 /.test(err.message)) return undefined;
    throw err;
  }
}

/**
 * `/bolognamodul` silently ignores the `idlist` query param and returns its
 * full unfiltered (paginated) result set instead — verified live, every
 * other entity endpoint tested (studiengang, studiengangsbereich,
 * bolognamodulversion, stupo, ...) filters correctly. Real API-side quirk,
 * not a client bug. Fetch these individually by id instead.
 */
const IDLIST_BROKEN_ENTITIES = new Set(["bolognamodul"]);

/**
 * Batch-fetch entities by id via the API's `idlist` query param — the
 * primary way relationships are resolved, since nearly every entity embeds
 * related objects only as lightweight {id, mosesTypeCode, endpointPath}
 * refs. Dedupes ids, chunks requests, and fetches chunks concurrently
 * (bounded by the shared ConcurrencyLimiter). Order of the returned array
 * is not guaranteed to match `ids`.
 */
export async function apiFetchByIdlist<T>(entity: string, ids: (number | string)[]): Promise<T[]> {
  const uniqueIds = Array.from(new Set(ids.map(String)));
  if (uniqueIds.length === 0) return [];

  if (IDLIST_BROKEN_ENTITIES.has(entity)) {
    const results = await Promise.all(uniqueIds.map((id) => apiGetById<T>(entity, id)));
    return results.filter((r) => r !== undefined) as T[];
  }

  const chunks: string[][] = [];
  for (let i = 0; i < uniqueIds.length; i += IDLIST_CHUNK_SIZE) {
    chunks.push(uniqueIds.slice(i, i + IDLIST_CHUNK_SIZE));
  }

  const results = await Promise.all(
    chunks.map((chunk) =>
      apiGet<T>(`/${entity}`, { idlist: chunk.map(encodeURIComponent).join(","), pageSize: chunk.length }),
    ),
  );
  return results.flatMap((r) => r.data);
}

/**
 * Fetch every record of an entity by paging through at the max page size.
 * Only for bulk index-building (see moduleUsageIndex.ts) — never call this
 * from an interactive tool request path.
 */
export async function apiFetchAllPages<T>(entity: string, params?: Record<string, string | number>): Promise<T[]> {
  const first = await apiGet<T>(`/${entity}`, { ...params, pageNumber: 1, pageSize: 10000 });
  if (first.totalPages <= 1) return first.data;

  const rest = await Promise.all(
    Array.from({ length: first.totalPages - 1 }, (_, i) =>
      apiGet<T>(`/${entity}`, { ...params, pageNumber: i + 2, pageSize: 10000 }),
    ),
  );
  return [first.data, ...rest.map((r) => r.data)].flat();
}
