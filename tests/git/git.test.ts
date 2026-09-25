import { afterEach, describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { TempRepo } from "../helpers/temp-repo";
import {
  commit,
  getCurrentBranch,
  getRecentCommits,
  getRecentCommitsForPaths,
  getRepoRoot,
  getStagedDiff,
  getStagedFiles,
  getWorkingTreeChanges,
  isGitRepo,
  stagePaths,
  stageTracked,
  stageAllChanges,
} from "../../src/git";

const repos: TempRepo[] = [];

async function makeRepo(): Promise<TempRepo> {
  const repo = await TempRepo.init();
  repos.push(repo);
  return repo;
}

afterEach(() => {
  for (const repo of repos.splice(0)) {
    repo.cleanup();
  }
});

describe("repo detection", () => {
  it("isGitRepo returns true inside a work tree", async () => {
    const repo = await makeRepo();
    expect(await isGitRepo(repo.dir)).toBe(true);
  });

  it("isGitRepo returns false outside a repository", async () => {
    const outside = mkdtempSync(join(tmpdir(), "commitnow-outside-"));
    try {
      expect(await isGitRepo(outside)).toBe(false);
    } finally {
      rmSync(outside, { recursive: true, force: true });
    }
  });

  it("getRepoRoot returns the repository root", async () => {
    const repo = await makeRepo();
    const nested = join(repo.dir, "a", "b");
    mkdirSync(nested, { recursive: true });
    const root = await getRepoRoot(nested);
    expect(root.replace(/\\/g, "/")).toBe(repo.dir.replace(/\\/g, "/"));
  });
});

describe("getStagedFiles", () => {
  it("handles added, modified, deleted, rename, binary, and Unicode paths", async () => {
    const repo = await makeRepo();
    const PNG_1 = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d]);
    const PNG_2 = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0e]);
    repo.writeFile("keep.txt", "version one\n");
    repo.writeFile("bin/logo.png", PNG_1);
    await repo.addAll();
    await repo.commit("init");

    repo.writeFile("bin/logo.png", PNG_2);
    repo.writeFile("new file ⚡.ts", "export const a = 1;\n");
    repo.writeFile("renamed.txt", "version one\n");
    rmSync(join(repo.dir, "keep.txt"));
    await repo.addAll();

    const files = await getStagedFiles(repo.dir);
    const byPath = new Map(files.map((f) => [f.path, f]));

    expect(byPath.get("new file ⚡.ts")).toMatchObject({
      status: "A",
      added: 1,
      deleted: 0,
      binary: false,
    });
    expect(byPath.get("bin/logo.png")).toMatchObject({
      status: "M",
      binary: true,
      added: null,
      deleted: null,
    });
    const renamed = byPath.get("renamed.txt");
    expect(renamed).toBeDefined();
    expect(renamed!.status).toBe("R");
    expect(files.find((f) => f.path === "renamed.txt")!.oldPath).toBe(
      "keep.txt",
    );
  });

  it("returns nothing when nothing is staged", async () => {
    const repo = await makeRepo();
    repo.writeFile("keep.txt", "v1");
    await repo.addAll();
    await repo.commit("init");
    expect(await getStagedFiles(repo.dir)).toEqual([]);
  });
});

describe("getStagedDiff", () => {
  it("returns the staged diff and can limit by path", async () => {
    const repo = await makeRepo();
    repo.writeFile("a.txt", "one\n");
    repo.writeFile("b.txt", "two\n");
    await repo.addAll();
    await repo.commit("init");
    repo.writeFile("a.txt", "ONE\n");
    repo.writeFile("b.txt", "TWO\n");
    await repo.addAll();

    const full = await getStagedDiff(repo.dir);
    expect(full).toContain("a.txt");
    expect(full).toContain("b.txt");

    const limited = await getStagedDiff(repo.dir, ["b.txt"]);
    expect(limited).toContain("b.txt");
    expect(limited).not.toContain("a.txt");
  });
});

describe("history", () => {
  it("returns empty commits for a fresh repository", async () => {
    const repo = await makeRepo();
    expect(await getRecentCommits(repo.dir, 50)).toEqual([]);
  });

  it("returns commits newest first with subject and body", async () => {
    const repo = await makeRepo();
    repo.writeFile("f.txt", "1");
    await repo.addAll();
    await repo.commit("first");
    repo.writeFile("f.txt", "2");
    await repo.addAll();
    await repo.commit("second");

    const commits = await getRecentCommits(repo.dir, 10);
    expect(commits).toHaveLength(2);
    expect(commits[0]!.subject).toBe("second");
    expect(commits[1]!.subject).toBe("first");
    expect(commits[0]!.hash).toMatch(/^[0-9a-f]{40}$/);

    repo.writeFile("f.txt", "3");
    await repo.addAll();
    const withBody = await commit(repo.dir, "feat(x): body commit\n\nDetails here.\n");
    expect(withBody).toMatch(/^[0-9a-f]{7,}$/);
    const after = await getRecentCommits(repo.dir, 1);
    expect(after[0]!.subject).toBe("feat(x): body commit");
    expect(after[0]!.body).toContain("Details here.");
  });

  it("filters commits by paths", async () => {
    const repo = await makeRepo();
    repo.writeFile("a.txt", "1");
    await repo.addAll();
    await repo.commit("add a");
    repo.writeFile("b.txt", "1");
    await repo.addAll();
    await repo.commit("add b");

    const hits = await getRecentCommitsForPaths(repo.dir, ["b.txt"], 10);
    expect(hits).toHaveLength(1);
    expect(hits[0]!.subject).toBe("add b");
  });
});

describe("branches", () => {
  it("returns the current branch name", async () => {
    const repo = await makeRepo();
    expect(await getCurrentBranch(repo.dir)).toBe("master");
  });

  it("returns null on a detached HEAD", async () => {
    const repo = await makeRepo();
    repo.writeFile("f.txt", "1");
    await repo.addAll();
    await repo.commit("first");
    await repo.git(["checkout", "-q", "--detach", "HEAD"]);
    expect(await getCurrentBranch(repo.dir)).toBeNull();
  });
});

describe("commit", () => {
  it("creates a commit with the given message and returns a short hash", async () => {
    const repo = await makeRepo();
    repo.writeFile("f.txt", "1");
    await repo.addAll();

    const hash = await commit(repo.dir, "test: something\n\ndetails");
    expect(hash).toMatch(/^[0-9a-f]{7,}$/);

    const log = await getRecentCommits(repo.dir, 1);
    expect(log[0]!.subject).toBe("test: something");
  });

  it("surfaces git stderr when the commit fails", async () => {
    const repo = await makeRepo();
    repo.writeFile("f.txt", "1");
    await repo.addAll();
    await repo.commit("first");
    await expect(commit(repo.dir, "second")).rejects.toThrow(/nothing to commit|no changes added/i);
  });
});

describe("staging helpers", () => {
  it("stageTracked stages tracked changes only", async () => {
    const repo = await makeRepo();
    repo.writeFile("t.txt", "1");
    repo.writeFile("u.txt", "1");
    await repo.addAll();
    await repo.commit("init");
    repo.writeFile("t.txt", "2");
    repo.writeFile("untracked-new.txt", "1");

    await stageTracked(repo.dir);
    const staged = await getStagedFiles(repo.dir);
    expect(staged.map((f) => f.path)).toEqual(["t.txt"]);
  });

  it("stageAllChanges stages tracked changes and untracked files", async () => {
    const repo = await makeRepo();
    repo.writeFile("t.txt", "1");
    await repo.addAll();
    await repo.commit("init");
    repo.writeFile("t.txt", "2");
    repo.writeFile("untracked-new.txt", "1");

    await stageAllChanges(repo.dir);
    const staged = await getStagedFiles(repo.dir);
    expect(staged.map((f) => f.path).sort()).toEqual(["t.txt", "untracked-new.txt"]);
  });

  it("stagePaths stages only the listed paths", async () => {
    const repo = await makeRepo();
    repo.writeFile("a.txt", "1");
    repo.writeFile("b.txt", "1");
    await stagePaths(repo.dir, ["a.txt"]);
    const staged = await getStagedFiles(repo.dir);
    expect(staged.map((f) => f.path)).toEqual(["a.txt"]);
  });
});

describe("getWorkingTreeChanges", () => {
  it("reports staged, modified, and untracked files", async () => {
    const repo = await makeRepo();
    repo.writeFile("tracked.txt", "1");
    await repo.addAll();
    await repo.commit("init");

    repo.writeFile("tracked.txt", "2");
    repo.writeFile("untracked.txt", "x");
    repo.writeFile("staged.txt", "s");
    await repo.add("staged.txt");

    const changes = await getWorkingTreeChanges(repo.dir);
    const byPath = new Map(changes.map((c) => [c.path, c]));
    expect(byPath.get("tracked.txt")).toMatchObject({ staged: false, untracked: false });
    expect(byPath.get("untracked.txt")).toMatchObject({ untracked: true });
    expect(byPath.get("staged.txt")).toMatchObject({ staged: true });
  });
});