import { execa } from "execa";
import { requireOk, run } from "./run";

/** Run `git commit -F -` with the message on stdin. Never uses `--no-verify`. */
export async function commit(
  cwd: string,
  message: string,
  noVerify = false,
): Promise<string> {
  const args = noVerify
    ? ["commit", "-F", "-", "--no-verify"]
    : ["commit", "-F", "-"];
  const res = await execa("git", args, {
    cwd,
    input: message,
    reject: false,
    stripFinalNewline: false,
  });
  if (res.exitCode !== 0) {
    throw new Error(
      `git commit failed (exit ${res.exitCode}): ${res.stderr.trim() || res.stdout.trim()}`,
    );
  }
  const hashRes = await run(cwd, ["rev-parse", "--short", "HEAD"]);
  requireOk(cwd, ["rev-parse", "--short", "HEAD"], hashRes);
  return hashRes.stdout.trim();
}

/** Stage all tracked modifications and deletions (`git add -u`). */
export async function stageTracked(cwd: string): Promise<void> {
  const res = await run(cwd, ["add", "-u"]);
  requireOk(cwd, ["add", "-u"], res);
}

/** Stage the given paths (`git add -- <paths>`). */
export async function stagePaths(cwd: string, paths: string[]): Promise<void> {
  if (paths.length === 0) {
    return;
  }
  const res = await run(cwd, ["add", "--", ...paths]);
  requireOk(cwd, ["add", "--", ...paths], res);
}

export interface WorkingTreeFile {
  path: string;
  oldPath?: string;
  /** Present in the index (staged). */
  staged: boolean;
  /** Untracked file. */
  untracked: boolean;
  status: string;
}

/** Parse `git status --porcelain=v1 -z` output. Exported for unit tests. */
export function parsePorcelain(buf: Buffer): WorkingTreeFile[] {
  const text = buf.toString("utf8");
  const parts = text.split("\0");
  if (parts.length > 0 && parts[parts.length - 1] === "") {
    parts.pop();
  }
  const out: WorkingTreeFile[] = [];
  for (let i = 0; i < parts.length; ) {
    const token = parts[i]!;
    i += 1;
    const x = token[0] ?? " ";
    const y = token[1] ?? " ";
    const path = token.slice(3);
    const file: WorkingTreeFile = {
      path,
      staged: x !== " " && x !== "?",
      untracked: x === "?" && y === "?",
      status: `${x}${y}`,
    };
    if ((x === "R" || x === "C")) {
      file.oldPath = parts[i]!;
      i += 1;
    }
    out.push(file);
  }
  return out;
}

/**
 * Return modified, deleted, and untracked files via
 * `git status --porcelain=v1 -z`. Includes files staged in the index.
 */
export async function getWorkingTreeChanges(
  cwd: string,
): Promise<WorkingTreeFile[]> {
  const res = await run(cwd, ["status", "--porcelain=v1", "-z"]);
  requireOk(cwd, ["status", "--porcelain=v1", "-z"], res);
  const stdout = res.stdout;
  const buf = Buffer.isBuffer(stdout) ? stdout : Buffer.from(stdout);
  return parsePorcelain(buf);
}