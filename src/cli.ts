#!/usr/bin/env node
import { realpathSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { Command } from "commander";
import { intro, note } from "@clack/prompts";
import pc from "picocolors";
import { runCli, EXIT_OK, EXIT_USAGE, EXIT_ERROR, type RunOptions } from "./cli/run";
import { clackPrompts, statusPanel, type StatusView, type Colors } from "./ui";

const TYPES = [
  "feat", "fix", "refactor", "docs", "test", "chore", "ci", "style", "perf", "build",
] as const;
const LANGUAGES = ["auto", "en", "id"] as const;
const COMMIT_TYPES = new Set<string>(TYPES);

const uiColors: Colors = {
  bold: (s) => pc.bold(s),
  dim: (s) => pc.dim(s),
  red: (s) => pc.red(s),
  green: (s) => pc.green(s),
  yellow: (s) => pc.yellow(s),
  cyan: (s) => pc.cyan(s),
};

function renderStatus(view: StatusView): void {
  if (!process.stdout.isTTY) {
    for (const line of statusPanel(view)) process.stdout.write(`${line}\n`);
    return;
  }
  intro(`${pc.bold("commit-in")} ${pc.dim(`v${readVersion()}`)}`);
  const lines = statusPanel(view, uiColors);
  note(lines.join("\n"), "repository status");
}

function readVersion(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  const pkgPath = join(here, "..", "package.json");
  const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as { version: string };
  return pkg.version;
}

export function createProgram(): Command {
  return new Command()
    .name("commit-in")
    .description("Suggest and run git commit messages based on your staged changes")
    .version(readVersion(), "-v, --version")
    .option(
      "--stageddonly",
      "only use pre-staged files; never auto-stage working-tree changes",
    )
    .option("-a, --all", "stage all tracked working-tree changes first (git add -u)")
    .option("-c, --commit", "skip the final confirmation and run git commit")
    .option("-n, --dry-run", "print the chosen message without committing")
    .option("-p, --print", "print suggestion subjects to stdout and exit (no prompts)")
    .option("--push", "run git push after a successful commit")
    .option("-e, --echo", "print the model prompt and exit without calling the model")
    .option("--show-prompt", "alias for --echo")
    .option("--full", "with --echo, also print the full (untruncated) diff")
    .option("-y, --yes", "skip all prompts; pick the first suggestion")
    .option("--offline", "skip the service and use rule-based suggestions")
    .option("--verbose", "print diagnostics (source, latency)")
    .option("-t, --type <type>", "force a conventional commit type")
    .option("-s, --scope <scope>", "force a conventional commit scope")
    .option("--count <count>", "number of suggestions to request (1-5)", "3")
    .option("--api-url <url>", "override the default commit-in service URL")
    .option("--language <language>", "force suggestion language")
    .option("--body", "capture an optional body after selecting a suggestion")
    .option("--force-conventional", "force Conventional Commits style even with plain history")
    .option("--no-verify", "pass --no-verify to git commit")
    .helpOption("-h, --help", "display help for command");
}

export function parseOptions(argv: string[]): Command {
  return createProgram().parse(argv);
}

export function main(argv: string[]): void {
  const program = createProgram();
  program.parse(argv);
  const opts = program.opts<Record<string, unknown>>();

  const runOptions: RunOptions = {
    stagedOnly: Boolean(opts.stageddonly),
    all: Boolean(opts.all),
    commit: Boolean(opts.commit),
    push: Boolean(opts.push),
    dryRun: Boolean(opts.dryRun),
    echo: Boolean(opts.echo) || Boolean(opts.showPrompt),
    full: Boolean(opts.full),
    yes: Boolean(opts.yes),
    offline: Boolean(opts.offline),
    verbose: Boolean(opts.verbose),
    print: Boolean(opts.print),
    noVerify: !opts.noVerify,
    apiUrl: opts.apiUrl as string | undefined,
    language: opts.language as RunOptions["language"],
    body: Boolean(opts.body),
    type: opts.type as RunOptions["type"],
    scope: opts.scope as string | undefined,
    forceConventional: Boolean(opts.forceConventional),
  };
  const count = Number(opts.count);
  if (Number.isInteger(count) && count >= 1 && count <= 5) runOptions.count = count;

  if (
    runOptions.type !== undefined &&
    !COMMIT_TYPES.has(runOptions.type)
  ) {
    process.stderr.write(
      `error: invalid commit type "${runOptions.type}" (expected one of: ${TYPES.join(", ")})\n`,
    );
    process.exitCode = EXIT_USAGE;
    return;
  }
  if (
    runOptions.language !== undefined &&
    !LANGUAGES.includes(runOptions.language)
  ) {
    process.stderr.write(
      `error: invalid language "${runOptions.language}" (expected one of: ${LANGUAGES.join(", ")})\n`,
    );
    process.exitCode = EXIT_USAGE;
    return;
  }

  runCli(runOptions, {
    cwd: process.cwd(),
    prompts: clackPrompts,
    env: process.env,
    out: (m) => process.stdout.write(`${m}\n`),
    err: (m) => process.stderr.write(`${m}\n`),
    render: renderStatus,
  })
    .then((code) => {
      process.exitCode = code;
    })
    .catch((e) => {
      process.stderr.write(`error: ${(e as Error).message}\n`);
      process.exitCode = EXIT_ERROR;
    });
}

// Resolve junctions/symlinks (Windows global installs use junctions) so the
// entry check still matches after Node realpaths the module URL.
const entry = process.argv[1];
const isDirectRun =
  entry !== undefined &&
  import.meta.url === pathToFileURL(realpathSync(entry)).href;

if (isDirectRun) {
  main(process.argv);
}