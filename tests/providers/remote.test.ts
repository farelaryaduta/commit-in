import { describe, expect, it, vi } from "vitest";
import {
  RemoteProvider,
  DEFAULT_API_URL,
  DEFAULT_MAX_RETRIES,
  DEFAULT_TIMEOUT_MS,
} from "../../src/providers";
import { ProviderError } from "../../src/providers";
import type { GenerateRequest } from "../../src/types";

const API_URL = "https://ci.example.com";

function jsonReply(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const REQ: GenerateRequest = { system: "sys", user: "usr" };

describe("RemoteProvider", () => {
  it("posts to /suggest and returns the text reply", async () => {
    const calls: Array<{ url: string; init: RequestInit; body: unknown }> = [];
    const fetcher = async (url: string, init: RequestInit) => {
      calls.push({ url, init, body: JSON.parse(String(init.body)) });
      return jsonReply({ text: "feat(api): add login" });
    };
    const p = new RemoteProvider({ apiUrl: API_URL }, fetcher);
    const out = await p.generate(REQ);
    expect(out).toBe("feat(api): add login");
    expect(calls).toHaveLength(1);
    const { url, init, body } = calls[0]!;
    expect(url).toBe(`${API_URL}/suggest`);
    expect(init.headers).toMatchObject({ "content-type": "application/json" });
    expect(body).toMatchObject({
      temperature: 0.7,
      max_tokens: 250,
      messages: [
        { role: "system", content: "sys" },
        { role: "user", content: "usr" },
      ],
    });
  });

  it("sends the service token as a bearer header when configured", async () => {
    let auth: string | undefined;
    const fetcher = async (_url: string, init: RequestInit) => {
      auth = (init.headers as Record<string, string>).authorization;
      return jsonReply({ text: "fix: ok" });
    };
    const p = new RemoteProvider({ apiUrl: API_URL, apiToken: "tok" }, fetcher);
    await p.generate(REQ);
    expect(auth).toBe("Bearer tok");
  });

  it("fails fast (no retries) on 401", async () => {
    const fetcher = vi.fn(async () => jsonReply({ error: "bad token" }, 401));
    const p = new RemoteProvider({ apiUrl: API_URL, maxRetries: 2 }, fetcher);
    await expect(p.generate(REQ)).rejects.toMatchObject({ code: "auth" });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("retries retriable statuses then succeeds", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(jsonReply({}, 429))
      .mockResolvedValueOnce(jsonReply({ text: "fix: ok" }));
    const p = new RemoteProvider(
      { apiUrl: API_URL, maxRetries: 2, timeoutMs: 5000 },
      fetcher,
    );
    const out = await p.generate(REQ);
    expect(out).toBe("fix: ok");
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("gives up after exhausting retries on persistent 5xx", async () => {
    const fetcher = vi.fn(async () => jsonReply({}, 503));
    const p = new RemoteProvider(
      { apiUrl: API_URL, maxRetries: 1, timeoutMs: 5000 },
      fetcher,
    );
    await expect(p.generate(REQ)).rejects.toMatchObject({ code: "http" });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("propagates a caller abort immediately", async () => {
    const ac = new AbortController();
    ac.abort();
    const fetcher = async (_url: string, init?: RequestInit) => {
      return new Promise<Response>((_resolve, reject) => {
        if (init!.signal!.aborted) return reject(init!.signal!.reason);
        init!.signal!.addEventListener("abort", () => reject(init!.signal!.reason));
      });
    };
    const p = new RemoteProvider({ apiUrl: API_URL, timeoutMs: 5000 }, fetcher);
    await expect(p.generate({ ...REQ, signal: ac.signal })).rejects.toMatchObject({
      name: "AbortError",
    });
  });

  it("reports a timeout as a ProviderError after retries", async () => {
    const p = new RemoteProvider(
      {
        apiUrl: API_URL,
        timeoutMs: 40,
        maxRetries: 1,
      },
      async (_url: string, init: RequestInit) => {
        return new Promise<Response>((_resolve, reject) => {
          init.signal!.addEventListener("abort", () => reject(init.signal!.reason));
        });
      },
    );
    await expect(p.generate(REQ)).rejects.toMatchObject({ code: "timeout" });
  });

  it("throws on empty completions", async () => {
    const fetcher = async () => jsonReply({ text: "" });
    const p = new RemoteProvider({ apiUrl: API_URL }, fetcher);
    await expect(p.generate(REQ)).rejects.toMatchObject({ code: "empty" });
  });

  it("exposes sane defaults", () => {
    expect(DEFAULT_TIMEOUT_MS).toBe(30_000);
    expect(DEFAULT_MAX_RETRIES).toBe(2);
    expect(DEFAULT_API_URL).toMatch(/^https:\/\/[^/]+$/);
  });

  it("treats ProviderError with a stable code", () => {
    const e = new ProviderError("boom", { code: "http", retriable: true, status: 429 });
    expect(e.name).toBe("ProviderError");
    expect(e.code).toBe("http");
    expect(e.retriable).toBe(true);
    expect(e.status).toBe(429);
  });
});