#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { Command } from "commander";
import { runCli, EXIT_OK, EXIT_ERROR, type RunOptions } from "./cli/run";
import { clackPrompts } from "./ui";

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
    .option("-c, --commit", "skip the final confirmation and run git commit")
    .option("-n, --dry-run", "print the chosen message without committing")
    .option("--push", "run git push after a successful commit")
    .option("-e, --echo", "print the model prompt and exit without calling the model")
    .option("--full", "with --echo, also print the full (untruncated) diff")
    .option("-y, --yes", "skip all prompts; pick the first suggestion")
    .option("-t, --type <type>", "force a conventional commit type", [
      "feat", "fix", "refactor", "docs", "test", "chore", "ci", "style", "perf", "build",
    ])
    .option("-s, --scope <scope>", "force a conventional commit scope")
    .option("--count <count>", "number of suggestions to request (1-5)", "3")
    .option("--provider <provider>", "model provider", ["deepseek", "fake"])
    .option("--model <model>", "override the model identifier")
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
    commit: Boolean(opts.commit),
    push: Boolean(opts.push),
    dryRun: Boolean(opts.dryRun),
    echo: Boolean(opts.echo),
    full: Boolean(opts.full),
    yes: Boolean(opts.yes),
    noVerify: !opts.noVerify,
    provider: opts.provider as "deepseek" | "fake" | undefined,
    model: opts.model as string | undefined,
    type: opts.type as RunOptions["type"],
    scope: opts.scope as string | undefined,
    forceConventional: Boolean(opts.forceConventional),
  };
  const count = Number(opts.count);
  if (Number.isInteger(count) && count >= 1 && count <= 5) runOptions.count = count;

  runCli(runOptions, {
    cwd: process.cwd(),
    prompts: clackPrompts,
    env: process.env,
    out: (m) => process.stdout.write(`${m}\n`),
    err: (m) => process.stderr.write(`${m}\n`),
  })
    .then((code) => {
      process.exitCode = code;
    })
    .catch((e) => {
      process.stderr.write(`error: ${(e as Error).message}\n`);
      process.exitCode = EXIT_ERROR;
    });
}

const isDirectRun =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectRun) {
  main(process.argv);
}