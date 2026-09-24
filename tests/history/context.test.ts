import { describe, expect, it } from "vitest";
import { gatherContext, CONTEXT_COMMIT_DEPTH } from "../../src/history/context";
import { TempRepo } from "../helpers/temp-repo";

describe("gatherContext", () => {
  it("returns per-path commit history and branch", async () => {
    const repo = await TempRepo.init();
    try {
      repo.writeFile("src/order.ts", "first\n");
      await repo.addAll();
      await repo.commit("feat: add order module");
      repo.writeFile("src/order.ts", "first\nsecond\n");
      await repo.addAll();
      await repo.commit("fix: handle empty order");
      repo.writeFile("README.md", "readme\n");
      await repo.addAll();
      await repo.commit("docs: add readme");

      const ctx = await gatherContext(repo.dir, ["src/order.ts"]);
      expect(ctx.commits).toHaveLength(2);
      expect(ctx.commits[0]!.subject).toBe("fix: handle empty order");
      expect(ctx.commits[1]!.subject).toBe("feat: add order module");
      expect(ctx.branch).toBeTruthy();
    } finally {
      repo.cleanup();
    }
  });

  it("caps per-path history at the history depth", () => {
    expect(CONTEXT_COMMIT_DEPTH).toBe(5);
  });

  it("is empty when no commits touch the paths", async () => {
    const repo = await TempRepo.init();
    try {
      repo.writeFile("src/order.ts", "hi\n");
      await repo.addAll();
      await repo.commit("feat: add order");
      const ctx = await gatherContext(repo.dir, ["README.md"]);
      expect(ctx.commits).toEqual([]);
    } finally {
      repo.cleanup();
    }
  });
});