# commit-in

A command-line tool that writes your git commit message for you, so you don't
have to.

You change some code, stage it, run `commit-in`, and it reads what you did,
reads how this repository has been committing, and suggests a few messages
that fit. You pick one (or edit it), hit enter, and it commits.

```bash
npx commit-in
```

No install, no API keys, nothing to set up. It works in any Git repository
and it pushes commits to GitHub when you tell it to.

---

## What it does

Every repository ends up with its own commit style. Some use
`feat(users): add password reset`, some just write sentences ("Fixes login bug
on Safari"), some are written in Indonesian, some end everything with emoji.
commit-in notices that.

Four steps, all automatic:

1. Look at what's staged and what kind of files they are (controllers, models,
   routes, migrations... it knows Laravel and Next.js, and guesses decently for
   everything else).
2. Read recent commit history to figure out the *style*: what prefixes you use,
   whether you write English or Indonesian, how long your subjects are.
3. Put a small redacted diff together with that style guide and ask a hosted
   model for suggestions.
4. Show you the options. Pick one, tweak it, or type your own. Done.

The model key lives on a server, never on your machine, so there's nothing for
you to configure or leak.

---

## Getting started

Requires **Node.js 20.12+** and Git.

```bash
# run it straight from the internet, nothing to install
npx commit-in

# or install it once (it's also available as `ci`)
npm install -g commit-in
ci
```

That's it. It talks to a public commit-in service by default. If you self-host
your own service instead, point it there once:

```bash
export COMMIT_IN_API_URL=https://your-service.example
```

---

## What a session looks like

```text
  ┌─ repository status ────────────────────────┐
  │ branch: main                               │
  │ 4 staged file(s)                           │
  │   A  app/Http/Controllers/TaskController.php  controller  +80 -0
  │   A  app/Models/Task.php                      source      +20 -0
  │   M  routes/web.php                           route       +2  -1
  │   M  composer.lock                            deps        +30 -5  ignored for AI
  │ working tree: 2 staged, 1 modified, 3 untracked
  │ style: conventional commits, en, subject <= 72 chars
  └─────────────────────────────────────────────┘

  Choose a commit message:
  ▸ feat(task): add task controller and model
    feat(task): wire task routes
    chore(task): add task scaffolding
```

Sensitive files (`.env`, private keys) get flagged in that panel, but their
contents never leave your machine.

---

## Understanding the suggestions

Most suggestions look like `type(scope): subject`. The parts:

| Part | What it is |
| --- | --- |
| `type` | What kind of change this is (see below) |
| `scope` | Which part of the app it touches — commit-in usually takes this from the file names (`app.ts` → `app`) |
| `subject` | A short summary that fits on one line |

The classic Conventional Commits types, and when commit-in reaches for them:

| Type | What it means |
| --- | --- |
| `feat` | A new feature. Something users can now do that they couldn't before. |
| `fix` | A bug fix. Something that was broken and now works. |
| `refactor` | Code moved around or rewritten, behavior unchanged. No new feature, no bug fixed. |
| `docs` | Documentation only: README, comments, guides. |
| `style` | Formatting: whitespace, lints, missing semicolons. Doesn't affect behavior. |
| `test` | Adding or changing tests. |
| `build` | Build system, dependencies, package managers, bundlers. |
| `ci` | CI/CD configuration: pipelines, workflows, deployment scripts. |
| `perf` | Performance improvements. |
| `chore` | Housekeeping: tasks, config tweaks, version bumps. Nothing user-facing. |
| `revert` | Undoing a previous commit. |

These prefixes aren't mandatory. If the repository never uses them, commit-in
matches the style it sees and skips the `type(...)` part entirely.

### Why the subject is short

Commit-in learns from your history, including how long your subjects usually
are. That's deliberate: a subject is the headline, not the whole story. When a
change needs more explaining, commit-in will offer to append a body.

---

## Commands

Everyday:

| Command | What it does |
| --- | --- |
| `npx commit-in` | Suggest and commit, asking before anything is committed |
| `npx commit-in -n` | Dry run: print the message, don't commit anything |
| `npx commit-in -y` | Skip the questions, take the first suggestion and go |
| `npx commit-in --push` | Commit and then `git push` |
| `npx commit-in -a` | Stage all tracked changes first, then run |
| `npx commit-in --stageddonly` | Only look at what's already staged, never auto-stage |
| `npx commit-in --offline` | Suggestions from rules, no network needed |

Making it think differently:

| Command | What it does |
| --- | --- |
| `npx commit-in -t fix` | Force the type to `fix` |
| `npx commit-in -s orders` | Force the scope to `orders` |
| `npx commit-in --count 5` | Ask for 5 options instead of 3 |
| `npx commit-in --body` | Offer to add a body after you pick a subject |
| `npx commit-in --language id` | Suggestions in Indonesian |
| `npx commit-in --force-conventional` | Use Conventional Commits even if this repo doesn't |

Looking under the hood:

| Command | What it does |
| --- | --- |
| `npx commit-in -e` | Print the prompt sent to the model, then stop |
| `npx commit-in --verbose` | Show where suggestions came from and how long it took |
| `npx commit-in -h` | Full list of options |

---

## Configuration

You don't need it. The default behaviour is a reasonable starting point and the
command works the moment you run it. If you want to change things for a
project, commit-in reads a `.commitinrc.json` in the current folder:

```jsonc
{
  "count": 3,            // suggestions per run (1-5)
  "language": "auto",    // auto, en, id
  "body": false,         // offer a body after picking a subject
  "forceConventional": false,
  "ignore": ["coverage/**"]   // extra paths never sent to the model
}
```

Environment variables (`COMMIT_IN_*`) override the file, and flags override
everything.

Exit codes: `0` committed or dry-run, `1` something went wrong, `2` bad usage
(not a git repo or bad config), `3` sensitive files were staged and it stopped,
`130` you cancelled.

---

## Safety

- `.env`, private keys, and credential-looking files are flagged; their contents
  are never sent. commit-in stops entirely if you stage them, unless you say no.
- Lockfiles, minified assets, build output, and binaries never leave your
  machine. `ignore` in the config adds more paths.
- A redaction pass scrubs obvious secret formats from any diff before it goes
  out.

---

## Host your own service

The published tool points at a public commit-in service. If you'd rather your
diffs not leave your network (or you want full control of the model), the
reference service is in `server/` and deploys to Cloudflare Workers with
`npm run deploy`. More in [`server/README.md`](server/README.md).

---

## License

MIT