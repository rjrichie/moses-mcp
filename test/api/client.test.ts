import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("api/client", () => {
  const originalToken = process.env.API_TOKEN;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    process.env.API_TOKEN = "test-token";
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    process.env.API_TOKEN = originalToken;
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  function jsonResponse(body: unknown, ok = true, status = 200) {
    return { ok, status, statusText: ok ? "OK" : "Error", json: async () => body };
  }

  it("apiGet builds a URL under /moses/api/v2, never dropping the prefix (regression: new URL(path, base) strips it for leading-slash paths)", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ totalPages: 1, pageNumber: 1, pageSize: 50, data: [] }));
    const { apiGet } = await import("../../src/api/client.js");

    await apiGet("/studiengang", { name: "Informatik" });

    const requestedUrl = fetchMock.mock.calls[0][0] as string;
    expect(requestedUrl).toMatch(/^https:\/\/moseskonto\.tu-berlin\.de\/moses\/api\/v2\/studiengang\?/);
    expect(requestedUrl).toContain("name=Informatik");
  });

  it("apiGet sends the X-API-Key header", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ totalPages: 1, pageNumber: 1, pageSize: 50, data: [] }));
    const { apiGet } = await import("../../src/api/client.js");

    await apiGet("/ping");

    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect((init.headers as Record<string, string>)["X-API-Key"]).toBe("test-token");
  });

  it("apiGetById unwraps data[0] and returns undefined on 404", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ data: [{ id: 31, name: "Informatik" }] }));
    const { apiGetById } = await import("../../src/api/client.js");
    expect(await apiGetById("studiengang", 31)).toEqual({ id: 31, name: "Informatik" });

    fetchMock.mockResolvedValueOnce(jsonResponse({ error: { code: 404, message: "no entity found." } }, false, 404));
    expect(await apiGetById("studiengang", 999999)).toBeUndefined();
  });

  it("apiFetchByIdlist batches ids into a single request for a normal entity", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ totalPages: 1, pageNumber: 1, pageSize: 2, data: [{ id: 1 }, { id: 2 }] }),
    );
    const { apiFetchByIdlist } = await import("../../src/api/client.js");

    const result = await apiFetchByIdlist("studiengangsbereich", [1, 2, 1]); // duplicate id should be deduped

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const requestedUrl = fetchMock.mock.calls[0][0] as string;
    expect(requestedUrl).toContain("idlist=1%2C2");
    expect(result).toEqual([{ id: 1 }, { id: 2 }]);
  });

  it("apiFetchByIdlist works around /bolognamodul silently ignoring idlist by fetching each id individually (verified live API bug)", async () => {
    fetchMock.mockImplementation(async (url: string) => {
      const id = Number(new URL(url).pathname.split("/").pop());
      return jsonResponse({ data: [{ id, number: id * 100 }] });
    });
    const { apiFetchByIdlist } = await import("../../src/api/client.js");

    const result = await apiFetchByIdlist("bolognamodul", [10, 20]);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls.map((c) => c[0])).toEqual(
      expect.arrayContaining([expect.stringContaining("/bolognamodul/10"), expect.stringContaining("/bolognamodul/20")]),
    );
    expect(result).toEqual(expect.arrayContaining([{ id: 10, number: 1000 }, { id: 20, number: 2000 }]));
  });

  it("apiFetchByIdlist returns [] without making a request for an empty id list", async () => {
    const { apiFetchByIdlist } = await import("../../src/api/client.js");
    expect(await apiFetchByIdlist("stupo", [])).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("throws a descriptive error using the API's {error:{code,message}} envelope on a non-OK response", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: { code: 401, message: "Invalid API-token." } }, false, 401));
    const { apiGet } = await import("../../src/api/client.js");

    await expect(apiGet("/studiengang")).rejects.toThrow(/401.*Invalid API-token/);
  });

  it("throws a clear error if API_TOKEN is unset, rather than sending an unauthenticated request", async () => {
    delete process.env.API_TOKEN;
    const { apiGet } = await import("../../src/api/client.js");

    await expect(apiGet("/ping")).rejects.toThrow(/API_TOKEN/);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
