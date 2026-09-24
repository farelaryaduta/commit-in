import type { CommitInfo } from "../types";
import { getCurrentBranch, getRecentCommitsForPaths } from "../git";

/** cap on per-file commit context. */
export const CONTEXT_COMMIT_DEPTH = 5;

export interface RepoContext {
  /** Up to 5 recent commits touching the staged paths, newest first. */
  commits: CommitInfo[];
  /** Current branch name, or null when detached. */
  branch: string | null;
}

/** Gather repo context (recent per-path commits and branch) for the prompt. */
export async function gatherContext(
  cwd: string,
  paths: string[],
): Promise<RepoContext> {
  const [commits, branch] = await Promise.all([
    getRecentCommitsForPaths(cwd, paths, CONTEXT_COMMIT_DEPTH),
    getCurrentBranch(cwd),
  ]);
  return { commits, branch };
}