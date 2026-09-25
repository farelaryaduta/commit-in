/**
 * commitnow service for Cloudflare Workers (Groq backend).
 *
 * Turns the prompt assembled by the commitnow CLI into commit-message
 * suggestions using Groq. End users never need an API key — the Workers
 * deployment does.
 *
 * Secrets/variables (set via `wrangler secret put ...` or the dashboard):
 *   GROQ_API_KEY            required
 *   GROQ_MODEL              default "qwen/qwen3.8-27b"
 *   COMMIT_IN_API_TOKEN     optional shared secret; when set, the CLI must
 *                           send it as `Authorization: Bearer <token>`
 *
 * Deploy:  wrangler deploy -c server/wrangler.jsonc
 * Local:   wrangler dev -c server/wrangler.jsonc
 */
const GROQ_BASE = "https://api.groq.com/openai/v1/chat/completions";
const DEFAULT_MODEL = "qwen/qwen3.8-27b";
const GROQ_TIMEOUT_MS = 30_000;

function json(status, body, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", ...headers },
  });
}

async function callGroq(env, messages, temperature, maxTokens) {
  const res = await fetch(GROQ_BASE, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${env.GROQ_API_KEY}`,
    },
    body: JSON.stringify({
      model: env.GROQ_MODEL || DEFAULT_MODEL,
      messages,
      temperature,
      max_tokens: maxTokens,
    }),
    signal: AbortSignal.timeout(GROQ_TIMEOUT_MS),
  });

  if (res.status === 429) {
    const retryAfter = parseFloat(res.headers.get("retry-after") ?? "");
    throw Object.assign(new Error("Groq rate limit exceeded"), {
      status: 429,
      retryAfter: Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : 1,
    });
  }
  if (res.status === 401 || res.status === 403) {
    throw Object.assign(new Error("GROQ_API_KEY was rejected"), { status: 502 });
  }
  if (!res.ok) {
    const detail = (await res.text().catch(() => "")).slice(0, 300);
    throw Object.assign(new Error(`Groq error ${res.status}: ${detail}`), {
      status: 502,
    });
  }

  const data = await res.json();
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content !== "string" || content.trim() === "") {
    throw Object.assign(new Error("Groq returned an empty completion"), {
      status: 502,
    });
  }
  return content;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "GET" && url.pathname === "/health") {
      return json(200, { ok: true, model: env.GROQ_MODEL || DEFAULT_MODEL });
    }

    if (url.pathname !== "/suggest") {
      return json(404, { error: "not found" });
    }
    if (request.method !== "POST") {
      return json(405, { error: "method not allowed" });
    }
    if (!env.GROQ_API_KEY) {
      return json(503, { error: "GROQ_API_KEY is not set" });
    }

    const token = env.COMMIT_IN_API_TOKEN;
    if (token) {
      const provided = (request.headers.get("authorization") || "").replace(
        /^Bearer\s+/i,
        "",
      );
      if (provided !== token) {
        return json(401, { error: "missing or invalid service token" });
      }
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return json(400, { error: "invalid JSON body" });
    }

    const messages = body?.messages;
    const valid =
      Array.isArray(messages) &&
      messages.length > 0 &&
      messages.every(
        (m) =>
          m &&
          (m.role === "system" || m.role === "user" || m.role === "assistant") &&
          typeof m.content === "string" &&
          m.content.length > 0,
      );
    if (!valid) {
      return json(400, {
        error: "messages must be a non-empty array of {role, content}",
      });
    }

    const temperature =
      typeof body.temperature === "number" ? body.temperature : 0.7;
    const maxTokens =
      Number.isInteger(body.max_tokens) && body.max_tokens > 0
        ? body.max_tokens
        : 250;

    try {
      const text = await callGroq(env, messages, temperature, maxTokens);
      return json(200, { text });
    } catch (err) {
      const status = err?.status ?? 500;
      const headers =
        err?.retryAfter !== undefined
          ? { "retry-after": String(err.retryAfter) }
          : {};
      return json(status, { error: String(err?.message || err) }, headers);
    }
  },
};