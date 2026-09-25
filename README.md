<p align="center">
  <h1 align="center">commit-in</h1>
  <p align="center">
    AI-powered commit messages that match your repository's style.
    <br />
    <a href="https://www.npmjs.com/package/commit-in"><strong>View on npm »</strong></a>
  </p>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/commit-in">
    <img src="https://img.shields.io/npm/v/commit-in?color=%237c3aed&label=npm" alt="npm version" />
  </a>
  <a href="https://www.npmjs.com/package/commit-in">
    <img src="https://img.shields.io/npm/dm/commit-in?color=%2310b981" alt="npm downloads" />
  </a>
  <a href="https://github.com/farelaryaduta/commit-in/blob/main/LICENSE">
    <img src="https://img.shields.io/npm/l/commit-in?color=%233b82f6" alt="license" />
  </a>
  <img src="https://img.shields.io/node/v/commit-in?color=%23f59e0b" alt="node version" />
</p>

---

Stop staring at your staged files wondering what to write. **commit-in** reads your diff, studies how your repo writes its commit history, and suggests messages that actually belong there. You pick one (or write your own), and it commits for you.

```bash
npx commit-in
```

That's it. Works on any Git repository. No setup required.

---

## ✨ What it does

1. **Reads your staged changes** — detects file types (controllers, models, routes, components, migrations...) with built-in presets for Laravel, Next.js, and smart rules for everything else.
2. **Studies your commit history** — figures out your team's style. Conventional Commits? Plain sentences? English? Indonesian? Short subjects? Emoji? It adapts.
3. **Suggests commit messages** — sends a small, redacted diff to an AI service and returns suggestions that sound like they belong in your repo.
4. **Lets you pick, edit, or write your own** — then commits with `git commit`. Optionally pushes too.

```text
◆  commit-in

┌─ repository status ────────────────────────────────┐
│ branch: main                                       │
│ 4 staged file(s)                                   │
│   A  app/Http/Controllers/TaskController.php  controller  +80 -0       │
│   A  app/Models/Task.php                      source      +20 -0       │
│   M  routes/web.php                           route       +2  -1       │
│   M  composer.lock                            deps        +30 -5  ignored for AI  │
│ working tree: 2 staged, 1 modified, 3 untracked    │
│ hints: type=feat, scope=task                        │
│ style: conventional commits, en, subject <= 72 chars│
└─────────────────────────────────────────────────────┘

◆ Choose a commit message:
● feat(task): add task controller and model
○ feat(task): implement task CRUD with controller, model, and routing
○ feat(task): scaffold task module with controller and eloquent model
○ ✏️  Write my own message
○ ⏹  Cancel
```

---

## 📦 Installation

Requires **Node.js 20.12+** and **Git**.

```bash
# Run instantly without installing
npx commit-in

# Or install globally
npm install -g commit-in

# The `ci` shorthand is also available after global install
ci
```

---

## 🚀 Quick start

### 1. Basic usage (offline mode)

No API key needed — commit-in can generate rule-based suggestions locally:

```bash
npx commit-in --offline
```

### 2. With AI suggestions

For AI-powered suggestions, point commit-in at a service:

```bash
# Set once via environment variable
export COMMIT_IN_API_URL=https://your-service.example.com

# Or use the flag directly
npx commit-in --api-url https://your-service.example.com
```

Or save it in `.commitinrc.json` at your project root so you don't type it again:

```json
{ "apiUrl": "https://your-service.example.com" }
```

> **Note:** No API keys live on your machine. The key lives on the service, so the person running the CLI never sees one.

### 3. Commit and push in one go

```bash
npx commit-in --push
```

---

## 📖 Understanding Commit Types

If your repository uses [Conventional Commits](https://www.conventionalcommits.org/), commit-in will automatically follow that style. Here's what each type means:

| Type | When to use | Example |
|---|---|---|
| `feat` | A new feature or functionality for the user | `feat(auth): add Google OAuth login` |
| `fix` | A bug fix | `fix(cart): resolve quantity not updating on click` |
| `refactor` | Code restructuring without changing behavior | `refactor(api): extract validation into middleware` |
| `docs` | Documentation changes only | `docs: update API endpoint examples in README` |
| `test` | Adding or updating tests | `test(auth): add unit tests for login flow` |
| `chore` | Maintenance, dependencies, tooling — no production code | `chore(deps): update axios to v1.7` |
| `ci` | CI/CD pipeline changes (GitHub Actions, etc.) | `ci: add Node 22 to test matrix` |
| `style` | Code style / formatting — no logic change | `style: apply prettier formatting to utils/` |
| `perf` | Performance improvements | `perf(query): add database index for user lookup` |
| `build` | Build system or external dependency changes | `build: switch bundler from webpack to vite` |

### Anatomy of a Conventional Commit

```
feat(auth): add two-factor authentication
│    │       │
│    │       └─ Subject: short description of the change (lowercase, no period)
│    └───────── Scope (optional): what area of the project is affected
└────────────── Type: what kind of change this is
```

commit-in detects whether your repo uses this style by reading your recent commit history. If most of your commits follow the pattern, it will too. You can also force it:

```bash
npx commit-in --force-conventional
```

---

## 🛠 Commands & Flags

### Staging

| Flag | Description |
|---|---|
| `-a, --all` | Stage all tracked changes first (`git add -u`) before suggesting |
| `--stageddonly` | Only use what's already staged — never auto-stage anything |

### Committing

| Flag | Description |
|---|---|
| `-c, --commit` | Skip the final "Commit with this message?" confirmation |
| `-n, --dry-run` | Print the chosen message without actually committing |
| `-p, --print` | Print suggestion subjects to stdout and exit — no prompts, pipe-friendly |
| `--push` | Run `git push` after a successful commit |
| `--no-verify` | Pass `--no-verify` to `git commit` (skip git hooks) |

### Suggestions

| Flag | Description |
|---|---|
| `-y, --yes` | Skip all prompts — automatically pick the first suggestion |
| `--offline` | Use rule-based suggestions only, no AI service needed |
| `--count <n>` | Number of suggestions to ask for (1–5, default: 3) |
| `-t, --type <type>` | Force a commit type (`feat`, `fix`, `refactor`, etc.) |
| `-s, --scope <scope>` | Force a scope (e.g. `auth`, `api`, `ui`) |
| `--body` | Prompt for an optional commit body after picking a subject |
| `--force-conventional` | Force Conventional Commits style even if your history doesn't use it |

### Language

| Flag | Description |
|---|---|
| `--language <lang>` | Force suggestion language: `auto` (default), `en`, or `id` |

### Debugging

| Flag | Description |
|---|---|
| `-e, --echo` | Print the AI prompt and exit — nothing is sent to the model |
| `--show-prompt` | Alias for `--echo` |
| `--full` | With `--echo`, include the full untruncated diff |
| `--verbose` | Print diagnostics: which provider was used, how long it took |
| `--api-url <url>` | Override the configured service URL on the fly |

### General

| Flag | Description |
|---|---|
| `-v, --version` | Print the version number |
| `-h, --help` | Show help |

---

## 🔥 Common Workflows

```bash
# Quick commit — stage everything, pick first suggestion, commit, push
npx commit-in -a -y -c --push

# Preview what the AI sees without making any calls
npx commit-in --echo

# Offline mode — no internet, no API, just smart rules
npx commit-in --offline

The same rule-based engine also kicks in automatically if the AI service is
down or rate limited, so you always get a suggestion — even when the AI can't
answer. Offline suggestions still follow your repo's style and try to name the
affected unit (e.g. `feat(task): add task controller`), but they can't look
inside file contents, so they're more generic than the AI's.

# Force a specific commit type
npx commit-in -t fix

# Print suggestions without any prompts (great for scripts / pipes)
npx commit-in --print

# Force a type and scope
npx commit-in -t feat -s auth

# Get 5 suggestions instead of 3
npx commit-in --count 5

# Dry run — see the message without committing
npx commit-in --dry-run
```

---

## ⚙️ Configuration

commit-in reads `.commitinrc.json` from your project root. Environment variables (`COMMIT_IN_*`) override the file; CLI flags override everything.

```jsonc
{
  // Service URL for AI suggestions
  // "apiUrl": "https://your-service.example.com",

  // Shared secret for authenticated services
  // "apiToken": "your-token",

  // Number of suggestions (1-5)
  // "count": 3,

  // How many recent commits to analyze for style
  // "historyDepth": 50,

  // Max diff size sent to the model (in characters)
  // "maxDiffChars": 12000,

  // Suggestion language: "auto", "en", or "id"
  // "language": "auto",

  // Prompt for a commit body after picking a subject
  // "body": false,

  // Request timeout in milliseconds
  // "timeoutMs": 30000,

  // Max retries on failure (0-3)
  // "maxRetries": 2,

  // AI temperature (0-2, higher = more creative)
  // "temperature": 0.7,

  // Max subject line length
  // "maxSubjectLength": 72,

  // Extra file patterns to ignore (never sent to AI)
  // "ignore": [],

  // Force Conventional Commits even with plain history
  // "forceConventional": false
}
```

### Environment Variables

Every config key has a `COMMIT_IN_` environment variable equivalent:

| Variable | Example |
|---|---|
| `COMMIT_IN_API_URL` | `https://your-service.example.com` |
| `COMMIT_IN_API_TOKEN` | `your-shared-secret` |
| `COMMIT_IN_COUNT` | `5` |
| `COMMIT_IN_LANGUAGE` | `en` |
| `COMMIT_IN_HISTORY_DEPTH` | `50` |
| `COMMIT_IN_MAX_DIFF_CHARS` | `12000` |
| `COMMIT_IN_BODY` | `true` |
| `COMMIT_IN_TIMEOUT_MS` | `30000` |
| `COMMIT_IN_MAX_RETRIES` | `2` |
| `COMMIT_IN_TEMPERATURE` | `0.7` |
| `COMMIT_IN_MAX_SUBJECT_LENGTH` | `72` |
| `COMMIT_IN_IGNORE` | `*.generated.ts,dist/**` |
| `COMMIT_IN_FORCE_CONVENTIONAL` | `true` |

---

## 🔒 Safety & Privacy

commit-in takes your code privacy seriously:

- **Sensitive files are never sent.** Files like `.env`, private keys (`.pem`, `.key`), credentials, and service accounts are flagged. Their content never leaves your machine.
- **Lockfiles, build output, and binaries stay local.** Only meaningful source diffs are included.
- **Redaction pass.** Before anything is sent, a redaction pass strips key-value blocks and obvious secret patterns from the diff.
- **Custom ignore rules.** Add more patterns to the `ignore` config to exclude specific files.

If a sensitive file is staged, commit-in will warn you and let you decide whether to continue (with its content excluded) or abort entirely.

### Exit Codes

| Code | Meaning |
|---|---|
| `0` | Success (committed or dry-run) |
| `1` | Something went wrong |
| `2` | Bad usage (not a repo, bad config, no service URL) |
| `3` | Sensitive files were staged and you chose to abort |
| `130` | Cancelled by user |

---

## 🌐 Self-hosting the AI Service

commit-in ships with a reference server in `server/` that proxies requests to [Groq](https://groq.com). It's one file, zero dependencies:

```bash
GROQ_API_KEY=gsk_... node server/server.mjs
```

Then point your CLI at it:

```bash
export COMMIT_IN_API_URL=http://localhost:8787
npx commit-in
```

The server supports these environment variables:

| Variable | Default | Description |
|---|---|---|
| `GROQ_API_KEY` | *(required)* | Your Groq API key |
| `GROQ_MODEL` | `llama-3.3-70b-versatile` | Model to use for suggestions |
| `COMMIT_IN_API_TOKEN` | *(unset)* | Optional shared secret for authentication |
| `PORT` | `8787` | HTTP port |

Full API documentation in [`server/README.md`](server/README.md).

---

## 🤝 Contributing

```bash
git clone https://github.com/farelaryaduta/commit-in.git
cd commit-in
npm install
npm run dev -- --help      # run from source
npm test                   # 163 tests
npm run typecheck          # type checking
npm run build              # bundle to dist/cli.mjs
```

---

## 📄 License

MIT