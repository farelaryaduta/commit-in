import { describe, expect, it } from "vitest";
import { analyzeStyle } from "../../src/history/style";
import type { CommitInfo } from "../../src/types";

function commit(subject: string, hash = "a".repeat(40), body = ""): CommitInfo {
  return { hash, subject, body };
}

describe("analyzeStyle", () => {
  it("detects Conventional Commits, scopes, and language", () => {
    const commits = [
      commit("feat(api): add login endpoint"),
      commit("feat(api): add refresh endpoint"),
      commit("fix(api): handle empty token"),
      commit("fix(orders): sort by price"),
      commit("docs: update readme"),
      commit("test(api): cover login flow"),
      commit("refactor(orders): extract totals"),
      commit("perf(api): cache lookups"),
    ];
    const s = analyzeStyle(commits);
    expect(s.conventional).toBe(true);
    expect(s.language).toBe("en");
    expect(s.knownScopes).toContain("api");
    expect(s.knownScopes).toContain("orders");
    expect(s.typeCounts["feat"]).toBe(2);
    expect(s.examples.length).toBeLessThanOrEqual(8);
    expect(s.sampleSize).toBe(8);
    expect(s.lowercaseStart).toBe(true);
  });

  it("ignores merge commits when detecting style", () => {
    const commits = [
      commit("feat(api): add endpoint"),
      commit("fix(api): null guard"),
      commit("Merge branch 'main' into dev"),
      commit("feat(ui): button"),
      commit("fix(ui): spacing"),
      commit("docs: readme"),
      commit("chore: lint"),
      commit("Merge pull request #1"),
    ];
    const s = analyzeStyle(commits);
    expect(s.sampleSize).toBe(6);
    expect(s.conventional).toBe(true);
  });

  it("detects non-conventional repos", () => {
    const commits = [
      commit("Add login endpoint"),
      commit("Fix token bug"),
      commit("Refactor orders query"),
      commit("Update readme"),
      commit("Cover login with tests"),
      commit("Rewrite image loader"),
    ];
    const s = analyzeStyle(commits);
    expect(s.conventional).toBe(false);
    expect(s.sampleSize).toBe(6);
  });

  it("detects Indonesian history", () => {
    const commits = [
      commit("feat: menambahkan halaman login"),
      commit("feat: membuat halaman profil"),
      commit("fix: memperbaiki bug pesanan"),
      commit("fix: mengubah logika diskon"),
      commit("chore: memperbarui dependensi"),
      commit("docs: memperbarui panduan"),
    ];
    const s = analyzeStyle(commits);
    expect(s.language).toBe("id");
  });

  it("flags emoji style when frequent", () => {
    const commits = [
      commit("✨ add user avatars"),
      commit("🚀 speed up queries"),
      commit("✏️ typo in header"),
      commit("fix(ui): spacing"),
      commit("docs: readme"),
      commit("chore: lint"),
    ];
    const s = analyzeStyle(commits);
    expect(s.usesEmoji).toBe(true);
  });

  it("falls back to safe defaults below 5 commits", () => {
    const s = analyzeStyle([commit("Add stuff"), commit("Fix thing")]);
    expect(s.sampleSize).toBe(2);
    expect(s.conventional).toBe(true);
    expect(s.language).toBe("en");
    expect(s.examples).toEqual([]);
    expect(s.p90SubjectLength).toBe(72);
  });

  it("detects trailing periods", () => {
    const commits = [
      commit("feat: add login."),
      commit("feat: add logout."),
      commit("fix: handle empty."),
      commit("docs: readme."),
      commit("chore: lint."),
      commit("test: cover login."),
    ];
    expect(analyzeStyle(commits).endsWithPeriod).toBe(true);
  });

  it("returns empty knownScopes when no scopes used", () => {
    const commits = [
      commit("feat: add login"),
      commit("fix: handle empty"),
      commit("docs: readme"),
      commit("chore: lint"),
      commit("test: cover login"),
      commit("perf: cache"),
    ];
    expect(analyzeStyle(commits).knownScopes).toEqual([]);
  });

  it("keeps examples within 8 and without duplicates", () => {
    const commits = Array.from({ length: 20 }, (_, i) =>
      commit(`feat: change number ${i}`),
    );
    const s = analyzeStyle(commits);
    expect(s.examples.length).toBeLessThanOrEqual(8);
    expect(new Set(s.examples).size).toBe(s.examples.length);
  });
});