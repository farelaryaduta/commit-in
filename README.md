# commit-in

Suggest and commit Git messages for your staged changes using an LLM.

`commit-in` inspects the files you have staged, learns the commit style of the
repository, builds a carefully budgeted diff, asks DeepSeek for suggestions,
and lets you pick, edit, or write your own message — then commits it for you.

```text
npx commit-in
```

## Features

- **Repo-aware suggestions.** Detects Conventional Commits style (type/scope
  usage, shapes, emoji, language — English or Indonesian), and avoids repeating
  recent per-file commit subjects.
- **Framework presets.** Built-in classification for Laravel and Next.js
  projects with fallback generic rules, so type/scope hints match the codebase.
- **Safety first.** Lockfiles, minified assets, build output, `.env`, keys, and
  credentials are never sent to the model. Secrets in diffs are redacted.
- **Diff budget.** Per-file and total diff limits (defaults 2000/12000 chars)
  keep prompts cheap while prioritizing source files.
- **Offline mode.** `--provider fake` runs the full flow with canned
  suggestions — great for testing and demos.
- **Automatic staging.** With nothing staged, `commit-in` offers to stage all
  tracked working-tree changes (choose faster than `git add`), or pick files
  individually. `--stageddonly` forbids auto-staging.

## Install

Requires Node.js >= 20.12.

```bash
# run without installing
npx commit-in

# or install globally
npm install -g commit-in
```

The `commit-in` binary is also aliased as `ci`.

## Requirements

Set your DeepSeek API key:

```bash
# PowerShell
$env:DEEPSEEK_API_KEY = "sk-..."
# cmd
set DEEPSEEK_API_KEY=sk-...
# or permanently
setx DEEPSEEK_API_KEY sk-...
```

Without a key `commit-in` fails fast with setup instructions — it never guesses
or silently downgrades. Use `--provider fake` to try it offline.

## Usage

```bash
# suggest and commit (interactive)
commit-in

# pick the first suggestion and commit right away
commit-in -y -c

# skip committing
commit-in -n

# force a type/scope
commit-in -t fix -s orders

# see exactly what would be sent to the model
commit-in -e
commit-in -e --full   # include the full, untruncated diff
```

### Flags

| Flag | Meaning |
| --- | --- |
| `--stageddonly` | Never auto-stage; only use already-staged files |
| `-c, --commit` | Skip the final confirmation, run `git commit` |
| `-n, --dry-run` | Print the chosen message without committing |
| `--push` | Run `git push` after a successful commit |
| `-e, --echo` | Print the model prompt and exit |
| `--full` | With `--echo`, also print the full diff |
| `-y, --yes` | Skip all prompts; use the first suggestion |
| `-t, --type <type>` | Force a commit type (`feat`, `fix`, `refactor`, …) |
| `-s, --scope <scope>` | Force a commit scope |
| `--count <n>` | Number of suggestions to request (1–5) |
| `--provider <provider>` | `deepseek` or `fake` |
| `--model <id>` | Override the model identifier |
| `--language <lang>` | Force suggestions in `auto`, `en`, or `id` |
| `--body` | Capture an optional body after selecting a suggestion |
| `--force-conventional` | Force Conventional Commits style |
| `--no-verify` | Pass `--no-verify` to `git commit` |
| `-v, --version` | Print version |
| `-h, --help` | Print help |

### Configuration

`commit-in` reads `.commitinrc.json` from the current directory (no upward
search). Defaults:

```jsonc
{
  // "provider": "deepseek",
  // "count": 3,
  // "historyDepth": 50,
  // "maxDiffChars": 12000,
  // "language": "auto",
  // "body": false,
  // "model": "deepseek-v4-flash",
  // "timeoutMs": 30000,
  // "maxRetries": 2,
  // "temperature": 0.7,
  // "maxSubjectLength": 72,
  // "ignore": [],
  // "forceConventional": false,
  // "apiKey": "sk-..." // prefer DEEPSEEK_API_KEY
}
```

Environment variables (`COMMIT_IN_*`) override the file; CLI flags override
everything. Invalid file values fail fast; invalid environment values warn and
are ignored.

### Exit codes

| Code | Meaning |
| --- | --- |
| 0 | Success (committed or dry-run) |
| 1 | Runtime error, commit/push failure, no changes |
| 2 | Usage error (no repo, bad config, missing API key) |
| 3 | Sensitive files staged and aborted |
| 130 | Cancelled (Ctrl+C / escape) |

## Safety

- Sensitive paths (`.env*` except example files, `.pem`, `.key`, credentials,
  service-account files, private keys) are flagged. Their **content is never
  sent**; you get a warning and can abort (exit 3).
- Lockfiles, min/map files, build and vendor directories, binaries, and files
  matched by the `ignore` config never leave the machine.
- A pure redaction pass strips private key blocks and common secret formats
  from any diff text before it is sent.

## Development

```bash
npm install
npm run dev -- --help      # run from source
npm test
npm run typecheck
npm run build              # bundles to dist/cli.js
npm run eval               # manual real-model evaluation (requires key)
```

## How it works

1. Read staged files (`git diff --staged`), auto-staging when nothing is
   staged.
2. Classify each file (presets + generic rules) and infer a type/scope hint.
3. Learn repo style from recent history (ignoring merges/reverts).
4. Budget and redact diffs; assemble the system+user prompt.
5. Ask DeepSeek for suggestions; parse them robustly.
6. Let you pick, edit, or write a message; commit with `git commit -F -`.