/**
 * Simple file-based TTL cache. Moses curriculum/module data changes at most
 * once per semester, so aggressively caching keeps repeat lookups fast and
 * avoids re-hitting the server (see README's robots.txt note).
 */
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000; // 24h
const CACHE_DIR = path.resolve(process.cwd(), ".cache");

interface CacheEntry<T> {
  storedAt: number;
  value: T;
}

function keyToFilename(key: string): string {
  const hash = createHash("sha256").update(key).digest("hex");
  return path.join(CACHE_DIR, `${hash}.json`);
}

async function ensureCacheDir(): Promise<void> {
  await mkdir(CACHE_DIR, { recursive: true });
}

/**
 * Return a cached value for `key`, or compute it via `fn`, store it, and
 * return the fresh value. Pass `refresh: true` to bypass the cache read
 * (the freshly computed value still gets written back).
 */
export async function cached<T>(
  key: string,
  fn: () => Promise<T>,
  options: { ttlMs?: number; refresh?: boolean } = {},
): Promise<T> {
  const ttlMs = options.ttlMs ?? DEFAULT_TTL_MS;
  const file = keyToFilename(key);

  if (!options.refresh) {
    try {
      const raw = await readFile(file, "utf8");
      const entry = JSON.parse(raw) as CacheEntry<T>;
      if (Date.now() - entry.storedAt < ttlMs) {
        return entry.value;
      }
    } catch {
      // Cache miss or corrupt entry: fall through to recompute.
    }
  }

  const value = await fn();
  await ensureCacheDir();
  const entry: CacheEntry<T> = { storedAt: Date.now(), value };
  await writeFile(file, JSON.stringify(entry), "utf8");
  return value;
}

/**
 * Read a cached value for `key` if a fresh one exists, without ever
 * computing/storing a value on a miss. For caches that must be built
 * explicitly out-of-band (e.g. an expensive one-time index build) rather
 * than lazily on first request.
 */
export async function peekCached<T>(key: string, options: { ttlMs?: number } = {}): Promise<T | undefined> {
  const ttlMs = options.ttlMs ?? DEFAULT_TTL_MS;
  const file = keyToFilename(key);
  try {
    const raw = await readFile(file, "utf8");
    const entry = JSON.parse(raw) as CacheEntry<T>;
    if (Date.now() - entry.storedAt < ttlMs) return entry.value;
  } catch {
    // No cache entry (or corrupt) — treat as absent.
  }
  return undefined;
}
