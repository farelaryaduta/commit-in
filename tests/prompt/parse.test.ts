import { describe, expect, it } from "vitest";
import { parseSuggestions, isSlop, NO_SUGGESTIONS } from "../../src/prompt/parse";
import type { StyleProfile } from "../../src/types";

const CONV: StyleProfile = {
  sampleSize: 10,
  conventional: true,
  typeCounts: { feat: 4, fix: 3, docs: 1 },
  knownScopes: ["api", "orders"],
  language: "en",
  avgSubjectLength: 40,
  p90SubjectLength: 60,
  usesEmoji: false,
  lowercaseStart: true,
  endsWithPeriod: false,
  examples: [],
};

describe("parseSuggestions", () => {
  it("strips accidental markdown decorations from subjects", () => {
    const raw = ["1. **feat(api): add login**", "2. __fix(ui): spacing__"].join("\n");
    expect(parseSuggestions(raw).map((s) => s.subject)).toEqual([
      "feat(api): add login",
      "fix(ui): spacing",
    ]);
  });

  it("parses a bare JSON array", () => {
    const raw = JSON.stringify([
      { subject: "feat(api): add login", body: "adds token refresh" },
      { subject: "fix(ui): spacing" },
    ]);
    expect(parseSuggestions(raw)).toEqual([
      { subject: "feat(api): add login", body: "adds token refresh" },
      { subject: "fix(ui): spacing" },
    ]);
  });

  it("parses a fenced JSON array", () => {
    const raw = "```json\n" + JSON.stringify([{ subject: "feat: x" }]) + "\n```";
    expect(parseSuggestions(raw)).toEqual([{ subject: "feat: x" }]);
  });

  it("parses numbered and bullet lists with indented bodies", () => {
    const raw = [
      "1. feat(api): add login",
      "   refresh flow",
      "2. fix(ui): spacing",
      "- docs: readme",
    ].join("\n");
    expect(parseSuggestions(raw)).toEqual([
      { subject: "feat(api): add login", body: "refresh flow" },
      { subject: "fix(ui): spacing" },
      { subject: "docs: readme" },
    ]);
  });

  it("dedupes and caps the result", () => {
    const raw = ["1. feat: a", "2. feat: a", "3. feat: b", "4. feat: c", "5. feat: d", "6. feat: e"].join("\n");
    const out = parseSuggestions(raw, undefined, undefined, 3);
    expect(out).toHaveLength(3);
    expect(new Set(out.map((s) => s.subject)).size).toBe(3);
  });

  it("enforces Conventional Commits when the repo is conventional", () => {
    const out = parseSuggestions(["1. add login", "2. fix: guard null"].join("\n"), CONV, "feat");
    expect(out[0]!.subject).toBe("feat: add login");
    expect(out[1]!.subject).toBe("fix: guard null");
  });

  it("injects the type hint as fallback type for plain subjects", () => {
    const out = parseSuggestions(["1. add login", "2. sort totals"].join("\n"), CONV, "feat");
    expect(out[0]!.subject).toBe("feat: add login");
    expect(out[1]!.subject).toBe("feat: sort totals");
  });

  it("handles a single bare line", () => {
    expect(parseSuggestions("fix: everything")).toEqual([{ subject: "fix: everything" }]);
  });

  it("returns [] for empty/NO_SUGGESTIONS output", () => {
    expect(parseSuggestions("")).toEqual([]);
    expect(parseSuggestions("  ")).toEqual([]);
    expect(parseSuggestions(`Here you go:\n${NO_SUGGESTIONS}\n`)).toEqual([]);
  });

  it("ignores prose preamble before a list", () => {
    const raw = "Here are the options:\n1. feat: a\n2. fix: b\n";
    const out = parseSuggestions(raw);
    expect(out.map((s) => s.subject)).toEqual(["feat: a", "fix: b"]);
  });

  it("drops invalid JSON array items but keeps valid ones", () => {
    const raw = JSON.stringify([
      { subject: "feat: ok" },
      { body: "no subject" },
      42,
      null,
    ]);
    expect(parseSuggestions(raw)).toEqual([{ subject: "feat: ok" }]);
  });
});

describe("isSlop", () => {
  it("flags empty and vagueness-only subjects", () => {
    expect(isSlop("")).toBe(true);
    expect(isSlop("fix bugs")).toBe(true);
    expect(isSlop("chore: update deps")).toBe(true);
    expect(isSlop("misc changes")).toBe(true);
    expect(isSlop("wip")).toBe(true);
    expect(isSlop("feat: add stuff")).toBe(true);
  });

  it("accepts subjects that name a concrete unit", () => {
    expect(isSlop("feat(cart): add coupon model")).toBe(false);
    expect(isSlop("fix: guard null in checkout")).toBe(false);
    expect(isSlop("fix: add login controller")).toBe(false);
    expect(isSlop("docs: update readme")).toBe(false);
  });
});