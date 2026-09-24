import { describe, expect, it } from "vitest";
import { buildPrompt } from "../../src/prompt/build";
import type { ChangeSummary, StyleProfile } from "../../src/types";
import type { RepoContext } from "../../src/history";
import type { DiffSlice } from "../../src/safety";

const STYLE: StyleProfile = {
  sampleSize: 10,
  conventional: true,
  typeCounts: { feat: 4, fix: 3 },
  knownScopes: ["api", "orders"],
  language: "en",
  avgSubjectLength: 40,
  p90SubjectLength: 60,
  usesEmoji: false,
  lowercaseStart: true,
  endsWithPeriod: false,
  examples: ["feat(api): add login endpoint"],
};

const CHANGE: ChangeSummary = {
  files: [
    {
      path: "src/order.ts",
      status: "M",
      added: 2,
      deleted: 1,
      binary: false,
      category: "source",
      ignoredForAI: false,
      sensitive: false,
    },
    {
      path: "database/migrations/2026_01_01_create_orders_table.php",
      status: "A",
      added: 20,
      deleted: 0,
      binary: false,
      category: "migration",
      scopeCandidate: "orders",
      ignoredForAI: false,
      sensitive: false,
    },
  ],
  typeHint: "feat",
  typeLocked: false,
  scopeHint: "orders",
  totals: { files: 2, added: 22, deleted: 1 },
};

const DIFFS: DiffSlice[] = [
  { path: "src/order.ts", text: "@@ -1,2 +1,3 @@\n+export const x = 1;\n", truncated: false },
];

const CONTEXT: RepoContext = {
  commits: [{ hash: "a".repeat(40), subject: "fix(orders): sort totals", body: "" }],
  branch: "main",
};

describe("buildPrompt", () => {
  const req = buildPrompt({ change: CHANGE, style: STYLE, diffs: DIFFS, context: CONTEXT, count: 3 });

  it("keeps the system message directive-based", () => {
    expect(req.system).toContain("suggest 3 commit message options");
    expect(req.system).toContain("numbered markdown list");
  });

  it("includes staged file inventory with change counts", () => {
    expect(req.user).toContain("- src/order.ts (modified, +2 -1)");
    expect(req.user).toContain("- database/migrations/2026_01_01_create_orders_table.php (added, +20 -0)");
  });

  it("includes the diff text under its own section", () => {
    expect(req.user).toContain("## Unified diff");
    expect(req.user).toContain("### src/order.ts");
  });

  it("includes repo context, examples, and per-path history", () => {
    expect(req.user).toContain("feat(api): add login endpoint");
    expect(req.user).toContain("- fix(orders): sort totals");
    expect(req.user).toContain("- Branch: main");
    expect(req.user).toContain("- Known scopes: api, orders");
  });

  it("includes classification hints", () => {
    expect(req.user).toContain("Suggested type: feat");
    expect(req.user).toContain("Suggested scope: orders");
  });

  it("never repeats recent commits verbatim is enforced", () => {
    expect(req.user).toContain("never repeat verbatim");
  });

  it("emits the totals footer", () => {
    expect(req.user).toContain("Total diff: 2 files, +22 -1.");
  });

  it("marks a truncated diff entry", () => {
    const r = buildPrompt({
      change: CHANGE,
      style: STYLE,
      diffs: [{ path: "src/big.ts", text: "x", truncated: true }],
      context: CONTEXT,
      count: 3,
    });
    expect(r.user).toContain("### src/big.ts (truncated)");
  });

  it("handles non-conventional style", () => {
    const plain = buildPrompt({
      change: { ...CHANGE, typeHint: undefined, scopeHint: undefined },
      style: { ...STYLE, conventional: false },
      diffs: DIFFS,
      context: { ...CONTEXT, commits: [] },
      count: 3,
    });
    expect(plain.user).toContain("plain subject");
    expect(plain.user).not.toContain("suggested scope");
  });
});