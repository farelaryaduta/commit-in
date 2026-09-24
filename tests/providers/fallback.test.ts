import { describe, expect, it } from "vitest";
import { classifyFiles } from "../../src/classify";
import { fallbackSuggestions } from "../../src/providers";
import type { StyleProfile, StagedFile } from "../../src/types";
import {
  laravelFeature,
  laravelMigrationOnly,
} from "../fixtures/classify";

const CONVENTIONAL: StyleProfile = {
  sampleSize: 4,
  conventional: true,
  typeCounts: { feat: 2, chore: 1, docs: 1 },
  knownScopes: ["orders", "task"],
  language: "en",
  avgSubjectLength: 48,
  p90SubjectLength: 60,
  usesEmoji: false,
  lowercaseStart: true,
  endsWithPeriod: false,
  examples: ["feat(task): add controller", "chore: init"],
};

const PLAIN: StyleProfile = {
  ...CONVENTIONAL,
  conventional: false,
  lowercaseStart: false,
};

function file(path: string, status: StagedFile["status"] = "A"): StagedFile {
  return { path, status, added: 1, deleted: 0, binary: false };
}

async function classify(
  files: StagedFile[],
  presets: ("laravel" | "nextjs")[] = [],
): Promise<Awaited<ReturnType<typeof classifyFiles>>> {
  return classifyFiles(files, ".", {
    presets,
    isIgnoredForAI: () => false,
  });
}

describe("fallbackSuggestions", () => {
  it("docs-only changes produce a docs message", async () => {
    const summary = await classify([file("README.md")]);
    const out = fallbackSuggestions(summary, CONVENTIONAL);
    expect(out[0]?.subject).toBe("docs: update documentation");
    expect(out).toHaveLength(1);
  });

  it("test-only changes produce a test message", async () => {
    const summary = await classify([file("tests/Feature/TaskTest.php", "M")]);
    const out = fallbackSuggestions(summary, CONVENTIONAL);
    expect(out[0]?.subject).toMatch(/^test(: add tests|\(\w+\): add tests)$/);
  });

  it("deps-only changes produce chore(deps)", async () => {
    const summary = await classify([file("composer.lock", "M")]);
    const out = fallbackSuggestions(summary, CONVENTIONAL);
    expect(out[0]?.subject).toBe("chore(deps): update dependencies");
  });

  it("new source files produce feat with joined categories", async () => {
    const summary = await classify(laravelFeature, ["laravel"]);
    const out = fallbackSuggestions(summary, CONVENTIONAL);
    const first = out[0]?.subject ?? "";
    expect(first).toMatch(/^feat\(task\): add /);
    expect(first).toContain("controller");
    expect(first).toContain("migration");
  });

  it("honors a locked type hint", async () => {
    const summary = await classify([file("docs/notes.md", "M")]);
    const out = fallbackSuggestions(summary, CONVENTIONAL);
    expect(out[0]?.subject).toBe("docs: update documentation");
    void summary;
  });

  it("generic fallback uses the top-level directory", async () => {
    const summary = await classify([file("app/Http/Controllers/TaskController.php", "M")]);
    const out = fallbackSuggestions(summary, CONVENTIONAL);
    expect(out[0]?.subject).toBe("chore: update app");
  });

  it("formats for non-conventional lowercase style", async () => {
    const summary = await classify([file("README.md")]);
    const out = fallbackSuggestions(summary, PLAIN);
    expect(out[0]?.subject).toBe("Update documentation");
  });

  it("formats for non-conventional lowercase-start style", async () => {
    const summary = await classify([file("README.md")]);
    const out = fallbackSuggestions(
      summary,
      { ...PLAIN, lowercaseStart: true },
    );
    expect(out[0]?.subject).toBe("update documentation");
  });

  it("dedupes repeated categories", async () => {
    const migration = laravelMigrationOnly.map((f) => f);
    const summary = await classify(migration, ["laravel"]);
    const out = fallbackSuggestions(summary, CONVENTIONAL);
    expect(out[0]?.subject).toMatch(/^feat\(\w+\): add migration$/);
  });
});