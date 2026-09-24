import { describe, expect, it } from "vitest";
import { statusPanel, identityColors } from "../../src/ui";
import type { StatusView } from "../../src/ui";
import type { StagedFile } from "../../src/types";

function file(
  path: string,
  status: StagedFile["status"] = "A",
  added = 1,
  deleted = 0,
) {
  return {
    path,
    status,
    added,
    deleted,
    binary: false,
    oldPath: undefined,
  };
}

const view: StatusView = {
  root: "D:/work/repo",
  branch: "main",
  files: [
    { ...file("app/Models/Task.php"), category: "source" as const, ignoredForAI: false, sensitive: false },
    { ...file("routes/web.php", "M", 2, 1), category: "route" as const, ignoredForAI: false, sensitive: false },
    { ...file("composer.lock", "M", 30, 5), category: "deps" as const, ignoredForAI: true, sensitive: false },
    { ...file(".env", "A", 1, 0), category: "config" as const, ignoredForAI: true, sensitive: true },
  ],
  working: { staged: 2, unstaged: 1, untracked: 3 },
  typeHint: "feat",
  typeLocked: false,
  scopeHint: "task",
  style: { conventional: true, language: "id", p90SubjectLength: 64 },
};

describe("statusPanel", () => {
  it("renders staged files with status, category, and numstat", () => {
    const lines = statusPanel(view, identityColors);
    const joined = lines.join("\n");
    expect(joined).toContain("4 staged file(s)");
    expect(joined).toContain("A  app/Models/Task.php source");
    expect(joined).toContain("+1 -0");
    expect(joined).toContain("M  routes/web.php");
    expect(joined).toContain("+2 -1");
  });

  it("flags files ignored for AI and sensitive files", () => {
    const joined = statusPanel(view, identityColors).join("\n");
    expect(joined).toContain("composer.lock");
    expect(joined).toContain("ignored for AI");
    expect(joined).toContain("sensitive");
  });

  it("summarizes the working tree", () => {
    const joined = statusPanel(view, identityColors).join("\n");
    expect(joined).toContain("working tree: 2 staged, 1 modified (not staged), 3 untracked");
  });

  it("shows hints and detected style", () => {
    const joined = statusPanel(view, identityColors).join("\n");
    expect(joined).toContain("hints: type=feat, scope=task");
    expect(joined).toContain("style: conventional commits, id, subject <= 64 chars");
  });

  it("handles a repo with no staged files", () => {
    const lines = statusPanel({ ...view, files: [] }, identityColors);
    expect(lines.join("\n")).toContain("no staged files");
  });

  it("renders rename sources and binary files", () => {
    const binary = statusPanel(
      {
        ...view,
        files: [
          {
            ...file("logo.png", "R", 0, 0),
            oldPath: "old/logo.png",
            binary: true,
            added: null,
            deleted: null,
            category: "asset" as const,
            ignoredForAI: true,
            sensitive: false,
          },
        ],
      },
      identityColors,
    );
    expect(binary.join("\n")).toContain("old/logo.png -> logo.png");
    expect(binary.join("\n")).toContain("binary");
  });
});