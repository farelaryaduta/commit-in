#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { Command } from "commander";

function readVersion(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  const pkgPath = join(here, "..", "package.json");
  const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as { version: string };
  return pkg.version;
}

export function createProgram(): Command {
  return new Command()
    .name("commit-in")
    .description("AI commit message suggestions for your staged changes")
    .version(readVersion(), "-v, --version");
}

export function main(argv: string[]): void {
  createProgram().parse(argv);
}

const isDirectRun =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectRun) {
  main(process.argv);
}