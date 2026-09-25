# commitin service

Turns the prompts assembled by the `commitin` CLI into commit-message
suggestions using [Groq](https://groq.com). Two entrypoints, same API:

- [`worker.mjs`](worker.mjs) — Cloudflare Workers (recommended, free & always awake)
- [`server.mjs`](server.mjs) — plain Node (`node server/server.mjs`), for
  Render/Railway/VPS self-hosting

End users never need an API key — **only this service does**.

## Deploy to Cloudflare Workers

```bash
npm install
npx wrangler login               # once per machine
npm run deploy
```

Store the key as a Worker secret (never in the repo):

```bash
npx wrangler secret put GROQ_API_KEY
# paste: gsk_...
```

Optional variables (dashboard → Settings → Variables, or `wrangler secret`):

| Variable | Required | Default | Meaning |
| --- | --- | --- | --- |
| `GROQ_API_KEY` | yes | — | Groq API key |
| `GROQ_MODEL` | no | `qwen/qwen3.8-27b` | Model to ask for suggestions |
| `COMMIT_IN_API_TOKEN` | no | _(unset)_ | Shared secret; when set, the CLI must call with `Authorization: Bearer <token>` |

You'll get a URL like `https://commit-in.<subdomain>.workers.dev`. Test it:

```bash
curl https://commit-in.<subdomain>.workers.dev/health
# {"ok":true,"model":"llama-3.3-70b-versatile"}
```

Local smoke test without deploying: `npm run dev:worker`.

## Self-host instead (Render / Railway / VPS)

```bash
GROQ_API_KEY=gsk_... node server/server.mjs
```

Same env table as above, plus `PORT` (default `8787`, read from the host).

## API

**`GET /health`** → `{ "ok": true, "model": "..." }`

**`POST /suggest`**

```json
{
  "messages": [
    { "role": "system", "content": "…" },
    { "role": "user",   "content": "…" }
  ],
  "temperature": 0.7,
  "max_tokens": 250
}
```

→ `200 { "text": "…numbered suggestions from the model…" }`

Errors return a JSON `{ "error": "…" }` with an appropriate status code.

Swap models later (e.g. to a DeepSeek model) by changing `GROQ_MODEL` — the
CLI never changes.