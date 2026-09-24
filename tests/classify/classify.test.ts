import { describe, expect, it } from "vitest";
import { classifyFiles, detectPresets } from "../../src/classify";
import { TempRepo } from "../helpers/temp-repo";
import {
  depsOnly,
  docsOnly,
  laravelFeature,
  laravelMigrationOnly,
  mixedFixRefactor,
  nextjsFeature,
  testsOnly,
} from "../fixtures/classify";
import type { StagedFile } from "../../src/types";

describe("classifyFiles", () => {
  it.each([
    ["laravel feature", laravelFeature, ["laravel"]],
    ["nextjs feature", nextjsFeature, ["nextjs"]],
  ] as [string, StagedFile[], ("laravel" | "nextjs")[]][])(

    "classifies %s", async (_name, files, presets) => {
    const summary = await classifyFiles(files, "/repo", { presets });
    expect(summary.files.every((f) => f.category !== "other")).toBe(true);
  });

  it("classifies a Laravel feature and infers feat(task)", async () => {
    const summary = await classifyFiles(laravelFeature, "/repo", { presets: ["laravel"] });
    expect(summary.files.map((f) => [f.path, f.category])).toEqual([
      ["app/Http/Controllers/TaskController.php", "controller"],
      ["app/Models/Task.php", "model"],
      ["database/migrations/2026_09_24_create_tasks_table.php", "migration"],
      ["routes/web.php", "route"],
    ]);
    expect(summary.typeHint).toBe("feat");
    expect(summary.typeLocked).toBe(false);
    expect(summary.scopeHint).toBe("task");
    expect(summary.totals.files).toBe(4);
  });

  it("infers chore(deps) locked for a migration-only deps change", async () => {
    const summary = await classifyFiles(depsOnly, "/repo", { presets: [] });
    expect(summary.typeHint).toBe("chore");
    expect(summary.typeLocked).toBe(true);
    expect(summary.scopeHint).toBe("deps");
    expect(summary.files[0]).toMatchObject({ category: "deps" });
  });

  it("infers docs locked for docs-only changes", async () => {
    const summary = await classifyFiles(docsOnly, "/repo", { presets: [] });
    expect(summary.typeHint).toBe("docs");
    expect(summary.typeLocked).toBe(true);
  });

  it("infers test locked for tests-only changes", async () => {
    const summary = await classifyFiles(testsOnly, "/repo", { presets: [] });
    expect(summary.typeHint).toBe("test");
    expect(summary.typeLocked).toBe(true);
  });

  it("infers no type hint for mixed non-additive source changes", async () => {
    const summary = await classifyFiles(mixedFixRefactor, "/repo", { presets: [] });
    expect(summary.typeHint).toBeUndefined();
    expect(summary.typeLocked).toBe(false);
    expect(summary.scopeHint).toBeUndefined();
  });

  it("honours a custom isIgnoredForAI predicate for type inference", async () => {
    const summary = await classifyFiles(depsOnly, "/repo", {
      presets: [],
      isIgnoredForAI: () => true,
    });
    expect(summary.typeHint).toBeUndefined();
    expect(summary.typeLocked).toBe(false);
  });

  it("detects a migration-only Laravel change as feat", async () => {
    const summary = await classifyFiles(laravelMigrationOnly, "/repo", {
      presets: ["laravel"],
    });
    expect(summary.typeHint).toBe("feat");
    expect(summary.scopeHint).toBe("tasks");
  });
});

describe("detectPresets", () => {
  it("detects Laravel via artisan and Next.js via next.config", async () => {
    const repo = await TempRepo.init();
    try {
      repo.writeFile("artisan", "");
      expect(await detectPresets(repo.dir)).toContain("laravel");

      repo.writeFile("artisan", "");
      repo.writeFile("next.config.mjs", "");
      const detected = await detectPresets(repo.dir);
      expect(detected).toContain("laravel");
      expect(detected).toContain("nextjs");
    } finally {
      repo.cleanup();
    }
  });

  it("returns nothing when no marker files exist", async () => {
    const repo = await TempRepo.init();
    try {
      expect(await detectPresets(repo.dir)).toEqual([]);
    } finally {
      repo.cleanup();
    }
  });
});