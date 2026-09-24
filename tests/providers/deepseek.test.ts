import { describe, expect, it, vi } from "vitest";
import {
  DeepSeekProvider,
  DEFAULT_MAX_RETRIES,
  DEFAULT_TIMEOUT_MS,
  DEEPSEEK_BASE_URL,
  DEEPSEEK_CHAT_COMPLETIONS,
  DEEPSEEK_MODEL,
} from "../../src/providers/deepseek";
import { ProviderError } from "../../src/providers/llm";
import type { GenerateRequest } from "../../src/types";

function jsonReply(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const REQ: GenerateRequest = { system: "sys", user: "usr" };

describe("DeepSeekProvider", () => {
  it("returns the completion content and builds the expected request", async () => {
    const calls: Array<{ url: string; init: RequestInit; body: unknown }> = [];
    const fetcher = async (url: string, init: RequestInit) => {
      calls.push({ url, init, body: JSON.parse(String(init.body)) });
      return jsonReply({ choices: [{ message: { content: "feat(api): add login" } }] });
    };
    const p = new DeepSeekProvider("sk-test", fetcher);
    const out = await p.generate(REQ);
    expect(out).toBe("feat(api): add login");
    expect(calls).toHaveLength(1);
    const { url, init, body } = calls[0]!;
    expect(url).toBe(DEEPSEEK_BASE_URL + DEEPSEEK_CHAT_COMPLETIONS);
    expect(init.headers).toMatchObject({ authorization: "Bearer sk-test" });
    expect(body).toMatchObject({
      model: DEEPSEEK_MODEL,
      temperature: 0.7,
      max_tokens: 250,
      thinking: { type: "disabled" },
      messages: [
        { role: "system", content: "sys" },
        { role: "user", content: "usr" },
      ],
    });
  });

  it("fails fast (no retries) on 401", async () => {
    const fetcher = vi.fn(async () => jsonReply({ error: "bad key" }, 401));
    const p = new DeepSeekProvider("sk-bad", fetcher, { maxRetries: 2 });
    await expect(p.generate(REQ)).rejects.toMatchObject({ code: "auth" });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("retries retriable statuses then succeeds", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(jsonReply({}, 429))
      .mockResolvedValueOnce(jsonReply({ choices: [{ message: { content: "fix: ok" } }] }));
    const p = new DeepSeekProvider("sk-test", fetcher, {
      maxRetries: 2,
      timeoutMs: 5000,
    });
    const out = await p.generate(REQ);
    expect(out).toBe("fix: ok");
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("gives up after exhausting retries on persistent 5xx", async () => {
    const fetcher = vi.fn(async () => jsonReply({}, 503));
    const p = new DeepSeekProvider("sk-test", fetcher, {
      maxRetries: 1,
      timeoutMs: 5000,
    });
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
    const p = new DeepSeekProvider("sk-test", fetcher, { timeoutMs: 5000 });
    await expect(p.generate({ ...REQ, signal: ac.signal })).rejects.toMatchObject({
      name: "AbortError",
    });
  });

  it("reports a timeout as a ProviderError after retries", async () => {
    const p = new DeepSeekProvider(
      "sk-test",
      async (_url: string, init: RequestInit) => {
        return new Promise<Response>((_resolve, reject) => {
          void _resolve;
          init.signal!.addEventListener("abort", () => reject(init.signal!.reason));
        });
      },
      { timeoutMs: 40, maxRetries: 1 },
    );
    await expect(p.generate(REQ)).rejects.toMatchObject({ code: "timeout" });
  });

  it("throws on empty completions", async () => {
    const fetcher = async () => jsonReply({ choices: [{ message: { content: "" } }] });
    const p = new DeepSeekProvider("sk-test", fetcher);
    await expect(p.generate(REQ)).rejects.toMatchObject({ code: "empty" });
  });

  it("exposes sane defaults", () => {
    expect(DEFAULT_TIMEOUT_MS).toBe(30_000);
    expect(DEFAULT_MAX_RETRIES).toBe(2);
  });

  it("treats ProviderError with a stable code", () => {
    const e = new ProviderError("boom", { code: "http", retriable: true, status: 429 });
    expect(e.name).toBe("ProviderError");
    expect(e.code).toBe("http");
    expect(e.retriable).toBe(true);
    expect(e.status).toBe(429);
  });
});