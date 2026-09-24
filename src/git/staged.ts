import type { FileStatus, StagedFile } from "../types";
import { requireOk, run, runBuffer } from "./run";
import type { CommandResult } from "./run";

export interface RawNameStatusEntry {
  status: FileStatus;
  path: string;
  oldPath?: string;
}

export interface RawNumstatEntry {
  added: number | null;
  deleted: number | null;
  path: string;
  oldPath?: string;
}

/** Parse `git diff --name-status -z` output. Exported for unit tests. */
export function parseNameStatus(buf: Buffer): RawNameStatusEntry[] {
  const VALID = new Set(["A", "M", "D", "R", "C", "T"]);
  const parts = splitNz(buf);
  const out: RawNameStatusEntry[] = [];
  const entries: Array<[string, string[]]> = [];
  for (let i = 0; i < parts.length; ) {
    const code = parts[i]!;
    i += 1;
    const status = code[0] as FileStatus;
    if (!VALID.has(status)) {
      continue;
    }
    if (status === "R" || status === "C") {
      const oldPath = parts[i]!;
      const newPath = parts[i + 1]!;
      i += 2;
      entries.push([status, [oldPath, newPath]]);
    } else {
      entries.push([status, [parts[i]!]]);
      i += 1;
    }
  }
  for (const [status, paths] of entries) {
    const path = paths[paths.length - 1]!;
    const entry: RawNameStatusEntry = {
      status: status as FileStatus,
      path,
    };
    if (paths.length > 1) {
      entry.oldPath = paths[0];
    }
    out.push(entry);
  }
  return out;
}

/** Parse `git diff --numstat -z` output. Exported for unit tests. */
export function parseNumstat(buf: Buffer): RawNumstatEntry[] {
  const parts = splitNz(buf);
  const out: RawNumstatEntry[] = [];
  const entries: Array<[number | null, number | null, string[]]> = [];
  for (let i = 0; i < parts.length; ) {
    const head = parts[i]!;
    i += 1;
    const fields = head.split("\t");
    if (fields.length < 2) {
      continue;
    }
    const toCount = (s: string): number | null => {
      if (s === "-") return null;
      const n = Number(s);
      return Number.isNaN(n) ? null : n;
    };
    const added = toCount(fields[0]!);
    const deleted = toCount(fields[1]!);
    const path = fields.slice(2).join("\t");
    if (path === "") {
      const oldPath = parts[i]!;
      const newPath = parts[i + 1]!;
      i += 2;
      entries.push([added, deleted, [oldPath, newPath]]);
    } else {
      entries.push([added, deleted, [path]]);
    }
  }
  for (const [added, deleted, paths] of entries) {
    const entry: RawNumstatEntry = {
      added,
      deleted,
      path: paths[paths.length - 1]!,
    };
    if (paths.length > 1) {
      entry.oldPath = paths[0];
    }
    out.push(entry);
  }
  return out;
}

function splitNz(buf: Buffer): string[] {
  const text = buf.toString("utf8");
  const parts = text.split("\0");
  if (parts.length > 0 && parts[parts.length - 1] === "") {
    parts.pop();
  }
  return parts;
}

function toStagedFile(ns: RawNameStatusEntry): StagedFile {
  return {
    path: ns.path,
    status: ns.status,
    oldPath: ns.oldPath,
    added: null,
    deleted: null,
    binary: false,
  };
}

/**
 * Read the currently staged files.
 *
 * Runs `git diff --staged --name-status -z` and `git diff --staged --numstat -z`
 * and zips the two by index (identical file order).
 */
export async function getStagedFiles(cwd: string): Promise<StagedFile[]> {
  const nsRes = await runBuffer(cwd, [
    "diff",
    "--staged",
    "--name-status",
    "-z",
  ]);
  requireOk(cwd, ["diff", "--staged", "--name-status", "-z"], nsRes);

  const numRes = await runBuffer(cwd, ["diff", "--staged", "--numstat", "-z"]);
  requireOk(cwd, ["diff", "--staged", "--numstat", "-z"], numRes);

  const ns = parseNameStatus(nsRes.stdout);
  const num = parseNumstat(numRes.stdout);

  return ns.map((entry, i) => {
    const file = toStagedFile(entry);
    const numstat = num[i];
    if (numstat && numstat.path === entry.path) {
      file.added = numstat.added;
      file.deleted = numstat.deleted;
      file.binary = numstat.added === null || numstat.deleted === null;
    }
    return file;
  });
}

/** Whether `cwd` lives inside a Git work tree. */
export async function isGitRepo(cwd: string): Promise<boolean> {
  const res = await run(cwd, ["rev-parse", "--is-inside-work-tree"]);
  return res.ok && res.stdout.trim() === "true";
}

/** Absolute path of the repository root (throws if not a repo). */
export async function getRepoRoot(cwd: string): Promise<string> {
  const res = await run(cwd, ["rev-parse", "--show-toplevel"]);
  requireOk(cwd, ["rev-parse", "--show-toplevel"], res);
  return res.stdout.trim();
}

/**
 * Unified diff of the staged changes, optionally limited to `paths`.
 * Throw on failure.
 */
export async function getStagedDiff(
  cwd: string,
  paths?: string[],
): Promise<string> {
  const args = ["diff", "--staged", "--no-ext-diff", "--no-color"];
  if (paths && paths.length > 0) {
    args.push("--", ...paths);
  }
  const res: CommandResult = await run(cwd, args);
  requireOk(cwd, args, res);
  return res.stdout;
}

/**
 * Per-file unified diffs keyed by path (binary files come back empty).
 * Fetches files in parallel; missing files are simply not present.
 */
export async function getStagedDiffByFile(
  cwd: string,
  paths: string[],
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  await Promise.all(
    paths.map(async (path) => {
      const res = await run(cwd, [
        "diff",
        "--staged",
        "--no-ext-diff",
        "--no-color",
        "--",
        path,
      ]);
      if (res.ok) out.set(path, res.stdout);
    }),
  );
  return out;
}