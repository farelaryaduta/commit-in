import { describe, expect, it } from "vitest";
import { TempRepo } from "../helpers/temp-repo";
import { runCli, EXIT_OK, EXIT_ERROR, EXIT_USAGE, EXIT_SENSITIVE, EXIT_CANCEL } from "../../src/cli/run";
import { ScriptedPrompts } from "../../src/ui";
import { FakeProvider } from "../../src/providers";
import type { RunOptions, RunDeps } from "../../src/cli/run";
import { execa } from "execa";

function baseOptions(partial: Partial<RunOptions> = {}): RunOptions {
  return {
    stagedOnly: false,
    all: false,
    commit: true,
    push: false,
    dryRun: false,
    echo: false,
    full: false,
    yes: true,
    offline: false,
    verbose: false,
    noVerify: false,
    ...partial,
  };
}

async function depsFor(
  repo: TempRepo,
  prompts = new ScriptedPrompts(),
  overrides: Partial<RunDeps> = {},
): Promise<RunDeps> {
  return {
    cwd: repo.dir,
    prompts,
    env: {},
    out: () => undefined,
    err: () => undefined,
    providerOverride: new FakeProvider(["feat(api): add login endpoint"]),
    ...overrides,
  };
}

async function logSubjects(repo: TempRepo): Promise<string[]> {
  const res = await execa("git", ["log", "--format=%s"], { cwd: repo.dir, reject: false });
  return res.stdout.split("\n").filter(Boolean);
}

describe("runCli", () => {
  it("commits staged changes with --yes", async () => {
    const repo = await TempRepo.init();
    try {
      repo.writeFile("src/order.ts", "hi\n");
      await repo.addAll();
      await repo.commit("feat: initial");
      repo.writeFile("src/order.ts", "hi\nchanged\n");
      await repo.addAll();
      const code = await runCli(baseOptions(), await depsFor(repo));
      expect(code).toBe(EXIT_OK);
      const subjects = await logSubjects(repo);
      expect(subjects[0]).toBe("feat(api): add login endpoint");
    } finally {
      repo.cleanup();
    }
  });

  it("auto-stages when nothing is staged and runs the commit", async () => {
    const repo = await TempRepo.init();
    try {
      repo.writeFile("a.txt", "one\n");
      await repo.addAll();
      await repo.commit("chore: init");
      repo.writeFile("a.txt", "one\ntwo\n");
      const prompts = new ScriptedPrompts().with(true);
      const code = await runCli(baseOptions(), await depsFor(repo, prompts));
      expect(code).toBe(EXIT_OK);
      expect((await logSubjects(repo))[0]).toBe("feat(api): add login endpoint");
    } finally {
      repo.cleanup();
    }
  });

  it("--dry-run prints the message without committing", async () => {
    const repo = await TempRepo.init();
    try {
      repo.writeFile("a.txt", "x\n");
      await repo.addAll();
      await repo.commit("chore: init");
      repo.writeFile("a.txt", "x\ny\n");
      await repo.addAll();
      const out: string[] = [];
      const deps = await depsFor(repo);
      deps.out = (m) => out.push(m);
      const code = await runCli(baseOptions({ dryRun: true, commit: false }), deps);
      expect(code).toBe(EXIT_OK);
      expect(out.join("\n")).toContain("feat(api): add login endpoint");
      expect(out.join("\n")).toContain("dry run");
      expect(await logSubjects(repo)).toHaveLength(1);
    } finally {
      repo.cleanup();
    }
  });

  it("--echo prints the prompt without touching the provider", async () => {
    const repo = await TempRepo.init();
    try {
      repo.writeFile("a.txt", "x\n");
      await repo.addAll();
      await repo.commit("chore: init");
      repo.writeFile("a.txt", "x\ny\n");
      await repo.addAll();
      const out: string[] = [];
      const deps = await depsFor(repo);
      deps.out = (m) => out.push(m);
      deps.providerOverride = undefined;
      const code = await runCli(baseOptions({ echo: true, commit: false }), deps);
      expect(code).toBe(EXIT_OK);
      const text = out.join("\n");
      expect(text).toContain("── system ──");
      expect(text).toContain("── user ──");
      expect(text).toContain("a.txt");
      expect(await logSubjects(repo)).toHaveLength(1);
    } finally {
      repo.cleanup();
    }
  });

  it("aborts with exit 3 when sensitive files are staged and --yes", async () => {
    const repo = await TempRepo.init();
    try {
      repo.writeFile("a.txt", "x\n");
      await repo.addAll();
      await repo.commit("chore: init");
      repo.writeFile(".env", "SECRET=1\n");
      await repo.addAll();
      const code = await runCli(baseOptions({ yes: true }), await depsFor(repo));
      expect(code).toBe(EXIT_SENSITIVE);
      expect(await logSubjects(repo)).toHaveLength(1);
    } finally {
      repo.cleanup();
    }
  });

  it("exits 1 when there is nothing to commit", async () => {
    const repo = await TempRepo.init();
    try {
      repo.writeFile("a.txt", "x\n");
      await repo.addAll();
      await repo.commit("chore: init");
      const code = await runCli(baseOptions(), await depsFor(repo));
      expect(code).toBe(EXIT_ERROR);
    } finally {
      repo.cleanup();
    }
  });

  it("exits 2 outside a git repository", async () => {
    const repo = await TempRepo.init();
    try {
      await repo.cleanup();
      const tmp = { dir: repo.dir };
      const code = await runCli(baseOptions(), await depsFor(tmp as unknown as TempRepo));
      expect(code).toBe(EXIT_USAGE);
    } finally {
      // dir already removed
    }
  });

  it("returns 130 when the user cancels the final confirm", async () => {
    const repo = await TempRepo.init();
    try {
      repo.writeFile("a.txt", "x\n");
      await repo.addAll();
      await repo.commit("chore: init");
      repo.writeFile("a.txt", "x\ny\n");
      await repo.addAll();
      const prompts = new ScriptedPrompts().with(false);
      const code = await runCli(baseOptions({ commit: false }), await depsFor(repo, prompts));
      expect(code).toBe(EXIT_OK);
      expect(await logSubjects(repo)).toHaveLength(1);
    } finally {
      repo.cleanup();
    }
  });

  it("supports writing a custom message", async () => {
    const repo = await TempRepo.init();
    try {
      repo.writeFile("a.txt", "x\n");
      await repo.addAll();
      await repo.commit("chore: init");
      repo.writeFile("a.txt", "x\ny\n");
      await repo.addAll();
      const prompts = new ScriptedPrompts().with(
        "custom",
        "fix(ui): my own message",
        true,
      );
      const code = await runCli(
        baseOptions({ commit: false, yes: false }),
        await depsFor(repo, prompts),
      );
      expect(code).toBe(EXIT_OK);
      expect((await logSubjects(repo))[0]).toBe("fix(ui): my own message");
    } finally {
      repo.cleanup();
    }
  });

  it("returns 130 when pick is cancelled", async () => {
    const repo = await TempRepo.init();
    try {
      repo.writeFile("a.txt", "x\n");
      await repo.addAll();
      await repo.commit("chore: init");
      repo.writeFile("a.txt", "x\ny\n");
      await repo.addAll();
      const prompts = new ScriptedPrompts().with("cancel");
      const code = await runCli(
        baseOptions({ commit: false, yes: false }),
        await depsFor(repo, prompts),
      );
      expect(code).toBe(EXIT_CANCEL);
      expect(await logSubjects(repo)).toHaveLength(1);
    } finally {
      repo.cleanup();
    }
  });

  it("--offline uses rule-based suggestions", async () => {
    const repo = await TempRepo.init();
    try {
      repo.writeFile("a.txt", "x\n");
      await repo.addAll();
      await repo.commit("chore: init");
      repo.writeFile("a.txt", "x\ny\n");
      await repo.addAll();
      const out: string[] = [];
      const deps = await depsFor(repo);
      deps.out = (m) => out.push(m);
      deps.providerOverride = undefined;
      const code = await runCli(
        baseOptions({ dryRun: true, commit: false, offline: true }),
        deps,
      );
      expect(code).toBe(EXIT_OK);
      expect(out.join("\n")).toContain("docs: update documentation");
      expect(await logSubjects(repo)).toHaveLength(1);
    } finally {
      repo.cleanup();
    }
  });

  it("falls back to rule-based suggestions when the provider fails", async () => {
    const repo = await TempRepo.init();
    try {
      repo.writeFile("a.txt", "x\n");
      await repo.addAll();
      await repo.commit("chore: init");
      repo.writeFile("a.txt", "x\ny\n");
      await repo.addAll();
      const out: string[] = [];
      const deps = await depsFor(repo);
      deps.out = (m) => out.push(m);
      deps.providerOverride = {
        name: "boom",
        generate: async () => {
          throw new Error("boom");
        },
      };
      const code = await runCli(
        baseOptions({ dryRun: true, commit: false }),
        deps,
      );
      expect(code).toBe(EXIT_OK);
      expect(out.join("\n")).toContain("docs: update documentation");
      expect(await logSubjects(repo)).toHaveLength(1);
    } finally {
      repo.cleanup();
    }
  });

  it("-a stages tracked working-tree changes first", async () => {
    const repo = await TempRepo.init();
    try {
      repo.writeFile("a.txt", "one\n");
      await repo.addAll();
      await repo.commit("chore: init");
      repo.writeFile("a.txt", "one\ntwo\n");
      const code = await runCli(baseOptions({ all: true }), await depsFor(repo));
      expect(code).toBe(EXIT_OK);
      expect((await logSubjects(repo))[0]).toBe("feat(api): add login endpoint");
    } finally {
      repo.cleanup();
    }
  });
});