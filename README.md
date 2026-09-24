# commit-in

**AI-powered commit messages that match your repo's style — right on the command line.**

`commit-in` is a zero-install CLI (`npx commit-in`) that turns your staged
changes into a ready-to-commit Git/GitHub message. It reads what you've staged,
classifies the files, learns how this repository writes commit history, asks a
hosted service backed by Groq (DeepSeek, or any model) for suggestions, then
lets you pick, edit, or write the final message — and commits it for you.

```bash
npx commit-in
```

Works with any Git repository, and pushes straight to GitHub with `--push`.

---

## Why?

Writing commit messages is monotonous, and every repo has its own style. Let a
model that has seen the whole diff draft the message, while you keep the final
word. `commit-in` is built around a few principles:

- **You stay in control.** It *suggests* and *remembers* your style — you pick,
  edit, or replace any message before it lands.
- **Your secrets never leave the machine.** Sensitive files contribute
  metadata only, never content, and a redaction pass strips keys and
  credentials from diffs.
- **No API keys on your machine.** The CLI talks to a commit-in service you
  host; the model key lives server-side only.

---

## Quick start

Requires **Node.js >= 20.12** and Git.

```bash
# run without installing anything
npx commit-in

# or install once
npm install -g commit-in
```

Point the CLI at your commit-in service (see [Host your own
service](#host-your-own-service)):

```bash
export COMMIT_IN_API_URL=https://ci.example.com
# optionally, if your service requires a shared token:
export COMMIT_IN_API_TOKEN=...
```

Or put it in `.commitinrc.json` so it's persistent:

```json
{ "apiUrl": "https://ci.example.com", "apiToken": "..." }
```

Want to try it right now, without any service?

```bash
npx commit-in --offline          # rule-based suggestions, no network
```

---

## What you see on every run

A header and status panel summarize exactly what will be sent before anything
happens:

```text
┌──────────────────────────────────────────────┐
│  commit-in                                   │
└──────────────────────────────────────────────┘


  ┌─ repository status ────────────────────────┐
  │ branch: main                               │
  │ 4 staged file(s)                           │
  │   A  app/Http/Controllers/TaskController.php  controller  +80 -0
  │   A  app/Models/Task.php                      source      +20 -0
  │   M  routes/web.php                           route       +2  -1
  │   M  composer.lock                            deps        +30 -5  ignored for AI
  │ working tree: 2 staged, 1 modified, 3 untracked
  │ hints: type=feat, scope=task
  │ style: conventional commits, en, subject <= 72 chars
  └─────────────────────────────────────────────┘

  Choose a commit message:
  > feat(task): add task controller and model
    ...
```

Files flagged `sensitive` or `ignored for AI` appear here but **never** leak
their contents into the prompt.

---

## Features

- **Repo-aware suggestions.** Detects Conventional Commits style — type/scope
  usage, subject shapes, emoji, and language (English or Indonesian) — from
  your history, and avoids repeating recent per-file subjects.
- **Framework presets.** Built-in classification for Laravel and Next.js with
  generic fallbacks, so type/scope hints fit the codebase.
- **Safety by default.** Lockfiles, minified assets, build output, `.env`,
  keys, and credentials are never sent to the model; diffs are redacted.
- **Diff budget.** Per-file and total diff limits (defaults 2 000 / 12 000
  chars) keep prompts cheap while prioritizing source files.
- **Automatic staging.** Nothing staged? `commit-in` offers to stage all
  working-tree changes or lets you pick files individually.
- **Status dashboard.** A welcome panel shows your branch, staged files,
  working tree, hints, and detected style before the model is ever asked.
- **Offline mode.** `--offline` runs the full flow without a service or
  network — great for demos and tests.

---

## Usage

```bash
# suggest and commit (interactive)
commit-in

# stage everything, take the first suggestion, commit and push
commit-in -a -y -c --push

# skip committing (just suggest)
commit-in -n

# force a type/scope
commit-in -t fix -s orders

# inspect exactly what would be sent to the model
commit-in -e
commit-in -e --full     # include the full diff
```

### Flags

| Flag | Meaning |
| --- | --- |
| `--stageddonly` | Never auto-stage; only use already-staged files |
| `-a, --all` | Stage all tracked working-tree changes first (`git add -u`) |
| `-c, --commit` | Skip final confirmation, run `git commit` |
| `-n, --dry-run` | Print the chosen message without committing |
| `--push` | Run `git push` after a successful commit |
| `-e, --echo` / `--show-prompt` | Print the model prompt and exit |
| `--full` | With `--echo`, also print the full diff |
| `-y, --yes` | Skip all prompts; use the first suggestion |
| `--offline` | Skip the service; use rule-based suggestions |
| `--verbose` | Print diagnostics (provider, latency) |
| `-t, --type <type>` | Force a commit type (`feat`, `fix`, `refactor`, …) |
| `-s, --scope <scope>` | Force a commit scope |
| `--count <n>` | Number of suggestions (1–5) |
| `--api-url <url>` | Base URL of your hosted commit-in service |
| `--language <lang>` | `auto`, `en`, or `id` |
| `--body` | Capture an optional body after selecting a suggestion |
| `--force-conventional` | Force Conventional Commits style |
| `--no-verify` | Pass `--no-verify` to `git commit` |
| `-v, --version` | Print version |
| `-h, --help` | Print help |

---

## GitHub

`commit-in` runs on any Git repository — including a fresh GitHub clone — and
commits locally like you would. To get your work up:

```bash
npx commit-in -a -y -c --push
```

- `-a` stages everything, `-y` picks the model's best message, `-c` commits,
  and `--push` runs `git push` — your branch appears on GitHub ready for a PR.
- Point `commit-in` at your hosted service via `COMMIT_IN_API_URL` (or
  `"apiUrl"` in `.commitinrc.json`) and set `COMMIT_IN_API_TOKEN` as a secret
  if your service uses one — it works great with GitHub Codespaces and
  Actions secrets.
- Nothing about `commit-in` is GitHub-specific — the model only ever sees your
  local staged diff, so the same flow works with GitLab, Bitbucket, or any
  remote.

### GitLab, Bitbucket & others

Identical usage — only `git push` knows about the remote, so the tool doesn't
care where your code lives.

---

## Configuration

`commit-in` reads `.commitinrc.json` from the **current directory** (no upward
search). Environment variables (`COMMIT_IN_*`) override it; CLI flags override
everything.

```jsonc
{
  // "apiUrl": "https://ci.example.com",
  // "apiToken": "shared-secret-for-your-service",
  // "count": 3,
  // "historyDepth": 50,
  // "maxDiffChars": 12000,
  // "language": "auto",
  // "body": false,
  // "timeoutMs": 30000,
  // "maxRetries": 2,
  // "temperature": 0.7,
  // "maxSubjectLength": 72,
  // "ignore": [],
  // "forceConventional": false
}
```

Invalid file values fail fast; invalid environment values warn and are ignored.

### Exit codes

| Code | Meaning |
| --- | --- |
| 0 | Success (committed or dry-run) |
| 1 | Runtime error, commit/push failure, no changes |
| 2 | Usage error (no repo, bad config, service URL not configured) |
| 3 | Sensitive files staged and aborted |
| 130 | Cancelled (Ctrl+C / escape) |

---

## Safety

- Sensitive paths (`.env*` except examples, `.pem`, `.key`, credentials,
  service accounts, private keys) are flagged — their **content is never
  sent**, and you can abort (exit 3).
- Lockfiles, min/map files, build and vendor directories, binaries, and
  anything matched by `ignore` never leave the machine.
- A pure redaction pass strips private key blocks and common secret formats
  from diff text before it's sent.

---

## How it works

1. Read staged files (`git diff --staged`), auto-staging when nothing is
   staged.
2. Classify each file (presets + generic rules) and infer a type/scope hint.
3. Learn the repo's commit style from recent history (ignoring merges and
   reverts).
4. Budget and redact diffs; assemble the system + user prompt.
5. POST the prompt to your hosted commit-in service (Groq by default) and
   parse the suggestions robustly. On service failure (or `--offline`), fall
   back to deterministic rule-based suggestions.
6. You pick, edit, or write a message; `commit-in` commits with `git commit -F -`.

---

## Host your own service

The npm package only ships the CLI — the model lives behind a service you
control, so **nobody ever needs an API key**. A zero-dependency reference
server (Groq backend) is included in `server/`:

```bash
GROQ_API_KEY=gsk_... node server/server.mjs
```

See [`server/README.md`](server/README.md) for the full contract, optional
shared token, and how to swap models (e.g. DeepSeek) later without touching
the CLI.

## Development

```bash
npm install
npm run dev -- --help      # run from source
npm test
npm run typecheck
npm run build              # bundles to dist/cli.mjs
GROQ_API_KEY=... npm run serve   # run the hosted service locally
npm run eval               # manual real-model evaluation (needs COMMIT_IN_API_URL)
```

## License

MIT