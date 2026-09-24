#!/usr/bin/env node
/**
 * commit-in service (Groq backend).
 *
 * A zero-dependency server that turns the prompt assembled by the commit-in
 * CLI into commit-message suggestions using Groq. End users never need an API
 * key — only this server does.
 *
 * ENV:
 *   GROQ_API_KEY            required
 *   GROQ_MODEL              default "llama-3.3-70b-versatile"
 *   COMMIT_IN_API_TOKEN     optional shared secret; when set, the CLI must
 *                           send it as `Authorization: Bearer <token>`
 *   PORT                    default 8787
 *
 * Run:  GROQ_API_KEY=... node server/server.mjs
 */
import { createServer } from "node:http";

const GROQ_BASE = "https://api.groq.com/openai/v1/chat/completions";
const PORT = Number(process.env.PORT || 8787);
const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GROQ_MODEL = process.env.GROQ_MODEL || "llama-3.3-70b-versatile";
const SERVICE_TOKEN = process.env.COMMIT_IN_API_TOKEN || "";

if (!GROQ_API_KEY) {
  console.error("GROQ_API_KEY is not set");
  process.exit(1);
}

function send(res, status, body) {
  const data = JSON.stringify(body);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(data),
  });
  res.end(data);
}

function readBody(req) {
  return new Promise((resolve) => {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > 1_000_000) req.destroy();
    });
    req.on("end", () => resolve(raw));
  });
}

async function callGroq(messages, temperature, maxTokens) {
  const res = await fetch(GROQ_BASE, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${GROQ_API_KEY}`,
    },
    body: JSON.stringify({
      model: GROQ_MODEL,
      messages,
      temperature,
      max_tokens: maxTokens,
    }),
    signal: AbortSignal.timeout(30_000),
  });

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

const server = createServer(async (req, res) => {
  const url = new URL(req.url || "/", "http://localhost");

  if (req.method === "GET" && url.pathname === "/health") {
    send(res, 200, { ok: true, model: GROQ_MODEL });
    return;
  }

  if (url.pathname !== "/suggest") {
    send(res, 404, { error: "not found" });
    return;
  }
  if (req.method !== "POST") {
    send(res, 405, { error: "method not allowed" });
    return;
  }

  if (SERVICE_TOKEN) {
    const provided = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
    if (provided !== SERVICE_TOKEN) {
      send(res, 401, { error: "missing or invalid service token" });
      return;
    }
  }

  let body;
  try {
    body = JSON.parse((await readBody(req)) || "{}");
  } catch {
    send(res, 400, { error: "invalid JSON body" });
    return;
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
    send(res, 400, { error: "messages must be a non-empty array of {role, content}" });
    return;
  }

  const temperature =
    typeof body.temperature === "number" ? body.temperature : 0.7;
  const maxTokens =
    Number.isInteger(body.max_tokens) && body.max_tokens > 0
      ? body.max_tokens
      : 250;

  try {
    const text = await callGroq(messages, temperature, maxTokens);
    send(res, 200, { text });
  } catch (err) {
    const status = err?.status ?? 500;
    send(res, status, { error: String(err?.message || err) });
  }
});

server.listen(PORT, () => {
  console.log(`commit-in service listening on http://0.0.0.0:${PORT} (model: ${GROQ_MODEL})`);
});