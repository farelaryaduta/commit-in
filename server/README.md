# commit-in service

Zero-dependency HTTP server that turns the prompts assembled by the
`commit-in` CLI into commit-message suggestions using [Groq](https://groq.com).
End users never need an API key — **only this server does**.

## Run

```bash
GROQ_API_KEY=gsk_... node server/server.mjs
```

Optional env:

| Variable | Default | Meaning |
| --- | --- | --- |
| `GROQ_MODEL` | `llama-3.3-70b-versatile` | Model to ask for suggestions |
| `COMMIT_IN_API_TOKEN` | _(unset)_ | Shared secret; when set, the CLI must call with `Authorization: Bearer <token>` |
| `PORT` | `8787` | HTTP port |

Point the CLI at it:

```bash
export COMMIT_IN_API_URL=https://your-service.example.com
# optionally, if you set COMMIT_IN_API_TOKEN:
export COMMIT_IN_API_TOKEN=...
npx commit-in
```

Swap models later (e.g. to a DeepSeek model) by changing `GROQ_MODEL` — the
CLI never changes.

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