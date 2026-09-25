<p align="center">
  <h1 align="center">commitin</h1>
  <p align="center">
    AI-powered commit messages that match your repository's style.
    <br />
    <a href="https://www.npmjs.com/package/commitin"><strong>View on npm »</strong></a>
  </p>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/commitin">
    <img src="https://img.shields.io/npm/v/commitin?color=%237c3aed&label=npm" alt="npm version" />
  </a>
  <a href="https://www.npmjs.com/package/commitin">
    <img src="https://img.shields.io/npm/dm/commitin?color=%2310b981" alt="npm downloads" />
  </a>
  <a href="https://github.com/farelaryaduta/commit-in/blob/main/LICENSE">
    <img src="https://img.shields.io/npm/l/commitin?color=%233b82f6" alt="license" />
  </a>
  <img src="https://img.shields.io/node/v/commitin?color=%23f59e0b" alt="node version" />
</p>

---

Stop staring at your staged files wondering what to write. **commitin** reads your diff, studies how your repo writes its commit history, and suggests messages that actually belong there. You pick one (or write your own), and it commits for you.

```bash
npx commitin
```

That's it. Works on any Git repository. No setup required.

---

## What it does!

1. **Reads your staged changes** — detects file types (controllers, models, routes, components, migrations...) with built-in presets for Laravel, Next.js, and smart rules for everything else.
2. **Studies your commit history** — figures out your team's style. Conventional Commits? Plain sentences? English? Indonesian? Short subjects? Emoji? It adapts.
3. **Suggests commit messages** — sends a small, redacted diff to an AI service and returns suggestions that sound like they belong in your repo.
4. **Lets you pick, edit, or write your own** — then commits with `git commit`. Optionally pushes too.

```text
◆  commitin

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
○ Write my own message
○ Cancel
```

---

## Commit and push in one go

```bash
npx commitin --push
```

---

## Understanding Commit Types

If your repository uses [Conventional Commits](https://www.conventionalcommits.org/), commitin will automatically follow that style. Here's what each type means:

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

commitin detects whether your repo uses this style by reading your recent commit history. If most of your commits follow the pattern, it will too. You can also force it:

```bash
npx commitin --force-conventional
```

---

## Commands & Flags

### Staging

| Flag | Description |
|---|---|
| `-a, --all` | Stage all tracked changes first (`git add -u`) before suggesting |
| `--stageddonly` | Only use what's already staged — never auto-stage anything |

### Committing

| Flag | Description |
|---|---|
| `-c, --commit` | Skip the final "Commit with this message?" confirmation |
| `-p, --print` | Print suggestion subjects to stdout and exit — no prompts, pipe-friendly |
| `--push` | Run `git push` after a successful commit |
| `--no-verify` | Pass `--no-verify` to `git commit` (skip git hooks) |

### Suggestions

| Flag | Description |
|---|---|
| `-y, --yes` | Skip all prompts — automatically pick the first suggestion |
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

## Workflows

```bash
# Quick commit — stage everything, pick first suggestion, commit, push
npx commitin -a -y -c --push

# Preview what the AI sees without making any calls
npx commitin --echo

# Offline mode — no internet, no API, just smart rules
npx commitin --offline

The same rule-based engine also kicks in automatically if the AI service is
down or rate limited, so you always get a suggestion — even when the AI can't
answer. Offline suggestions still follow your repo's style and try to name the
affected unit (e.g. `feat(task): add task controller`), but they can't look
inside file contents, so they're more generic than the AI's.

# Force a specific commit type
npx commitin -t fix

# Print suggestions without any prompts (great for scripts / pipes)
npx commitin --print

# Force a type and scope
npx commitin -t feat -s auth

# Get 5 suggestions instead of 3
npx commitin --count 5

# Dry run — see the message without committing
npx commitin --dry-run
```

---
