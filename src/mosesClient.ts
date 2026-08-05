/**
 * Low-level HTTP client for Moses (moseskonto.tu-berlin.de).
 *
 * moses' robots.txt disallows automated access site-wide, even though the
 * MTS pages themselves require no login and are meant for public browsing.
 * This client is built for personal, low-volume use: requests are
 * serialized (no concurrency) with a delay between them, and a descriptive
 * User-Agent is sent. See README.md.
 */
import { CookieJar } from "tough-cookie";

const BASE_URL = "https://moseskonto.tu-berlin.de";
const USER_AGENT = "moses-mcp/0.1 (personal module-discovery tool; low-volume, non-bulk use)";
const MIN_DELAY_MS = 800;

class RequestQueue {
  private tail: Promise<unknown> = Promise.resolve();
  private lastRequestAt = 0;

  run<T>(fn: () => Promise<T>): Promise<T> {
    const result = this.tail.then(async () => {
      const wait = MIN_DELAY_MS - (Date.now() - this.lastRequestAt);
      if (wait > 0) await sleep(wait);
      try {
        return await fn();
      } finally {
        this.lastRequestAt = Date.now();
      }
    });
    // Swallow errors on the tail so one failed request doesn't jam the queue.
    this.tail = result.catch(() => undefined);
    return result;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class MosesClient {
  private jar = new CookieJar();
  private queue = new RequestQueue();

  /** GET a URL (relative to the Moses base, or absolute) and return the response text. */
  async get(url: string): Promise<string> {
    const res = await this.request(this.resolve(url), { method: "GET" });
    return res.text();
  }

  /** POST url-encoded form fields (e.g. a PrimeFaces AJAX postback) and return the response text. */
  async post(url: string, fields: Map<string, string> | Record<string, string>): Promise<string> {
    const entries = fields instanceof Map ? Array.from(fields.entries()) : Object.entries(fields);
    const body = entries.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join("&");
    const res = await this.request(this.resolve(url), {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Faces-Request": "partial/ajax",
        "X-Requested-With": "XMLHttpRequest",
      },
      body,
    });
    return res.text();
  }

  private resolve(url: string): string {
    return url.startsWith("http") ? url : `${BASE_URL}${url.startsWith("/") ? "" : "/"}${url}`;
  }

  private async request(url: string, init: RequestInit): Promise<Response> {
    return this.queue.run(async () => {
      const cookieHeader = await this.jar.getCookieString(url);
      const headers = new Headers(init.headers);
      if (cookieHeader) headers.set("Cookie", cookieHeader);
      headers.set("User-Agent", USER_AGENT);

      const res = await fetch(url, { ...init, headers, redirect: "follow" });
      const setCookies = (res.headers as Headers & { getSetCookie?: () => string[] }).getSetCookie?.() ?? [];
      for (const sc of setCookies) {
        await this.jar.setCookie(sc, url);
      }
      if (!res.ok) {
        throw new Error(`Moses request failed: ${init.method ?? "GET"} ${url} -> ${res.status}`);
      }
      return res;
    });
  }
}

export const mosesClient = new MosesClient();
