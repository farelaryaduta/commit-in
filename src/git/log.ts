import type { CommitInfo } from "../types";
import { requireOk, run } from "./run";

const COMMIT_FORMAT = "%H%x00%s%x00%b%x00";

/**
 * Parse `git log --format=%H%x00%s%x00%b%x00` output.
 * Git appends `\n` after each record. Exported for unit tests.
 */
export function parseLogOutput(text: string): CommitInfo[] {
  const out: CommitInfo[] = [];
  const re = /^([0-9a-f]{40})\x00([^\x00]*)\x00([\s\S]*?)\x00\n?$/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    out.push({ hash: m[1]!, subject: m[2]!.trim(), body: m[3]!.trim() });
  }
  return out;
}

/**
 * Return the `n` most recent commits (`{ hash, subject, body }`), newest
 * first. Never throws on an empty repository (returns `[]`).
 */
export async function getRecentCommits(
  cwd: string,
  n: number,
): Promise<CommitInfo[]> {
  const res = await run(cwd, [
    "log",
    "-n",
    String(n),
    "--format=" + COMMIT_FORMAT,
  ]);
  if (!res.ok) {
    if (res.exitCode === 128 && /does not have any commits/i.test(res.stderr)) {
      return [];
    }
    requireOk(cwd, ["log"], res);
  }
  return parseLogOutput(res.stdout);
}

/** Return the `n` most recent commits that touched any of `paths`. */
export async function getRecentCommitsForPaths(
  cwd: string,
  paths: string[],
  n: number,
): Promise<CommitInfo[]> {
  const res = await run(cwd, [
    "log",
    "-n",
    String(n),
    "--format=" + COMMIT_FORMAT,
    "--",
    ...paths,
  ]);
  if (!res.ok) {
    if (res.exitCode === 128 && /does not have any commits/i.test(res.stderr)) {
      return [];
    }
    requireOk(cwd, ["log"], res);
  }
  return parseLogOutput(res.stdout);
}

/** Current branch name, or `null` when HEAD is detached. */
export async function getCurrentBranch(cwd: string): Promise<string | null> {
  const res = await run(cwd, ["branch", "--show-current"]);
  requireOk(cwd, ["branch", "--show-current"], res);
  const branch = res.stdout.trim();
  return branch === "" ? null : branch;
}