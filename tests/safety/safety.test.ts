import { describe, expect, it } from "vitest";
import { redact } from "../../src/safety/redact";
import { isIgnoredForAI, globMatches, globToRegExp } from "../../src/safety/ignore";
import { isSensitive, sensitiveReason } from "../../src/safety/sensitive";
import { selectDiffs, truncateDiff } from "../../src/safety/budget";
import type { ClassifiedFile } from "../../src/types";

describe("redact", () => {
  it("redacts private key blocks", () => {
    const block =
      "-----BEGIN PRIVATE KEY-----\nMIIEvwIBADANBgkqhkiG\n-----END PRIVATE KEY-----\n";
    expect(redact(block)).toBe("[REDACTED]\n");
  });

  it("redacts AWS access key ids", () => {
    expect(redact("key= AKIAIOSFODNN7EXAMPLE here")).toContain("[REDACTED]");
  });

  it("redacts provider-style tokens", () => {
    expect(redact("sk-abcdefghijklmnopqrstuvwxyz123")).toContain("[REDACTED]");
    expect(redact("ghp_abcdefghijklmnopqrstuvwxyz1234567")).toContain("[REDACTED]");
  });

  it("redacts secret assignments but keeps the key name", () => {
    expect(redact("password=hunter2hunter2")).toBe("password=[REDACTED]");
    expect(redact("API_KEY = \"superSecretValue12\"")).toBe(
      "API_KEY = [REDACTED]",
    );
    expect(redact("token: 'averylongtokenvalue'")).toBe("token: [REDACTED]");
  });

  it("does NOT redact the word 'password' in prose", () => {
    const prose = "the admin password is set in the settings page";
    expect(redact(prose)).toBe(prose);
  });

  it("does NOT redact short values or plain variable references", () => {
    expect(redact("token = 123")).toBe("token = 123");
    expect(redact("use the tokenizer")).toBe("use the tokenizer");
  });

  it("is a pure function", () => {
    const input = "password=xsecret123456\npassword=xsecret123456";
    expect(redact(input)).toBe(redact(input));
  });
});

describe("ignore", () => {
  it("ignores lockfiles, minified/map files, build dirs, and vendor", () => {
    expect(isIgnoredForAI("package-lock.json", false)).toBe(true);
    expect(isIgnoredForAI("app.min.js", false)).toBe(true);
    expect(isIgnoredForAI("app.js.map", false)).toBe(true);
    expect(isIgnoredForAI("dist/bundle.js", false)).toBe(true);
    expect(isIgnoredForAI(".next/server/app.js", false)).toBe(true);
    expect(isIgnoredForAI("vendor/autoload.php", false)).toBe(true);
    expect(isIgnoredForAI("node_modules/x/index.js", false)).toBe(true);
  });

  it("ignores binary files regardless of path", () => {
    expect(isIgnoredForAI("src/data.bin", true)).toBe(true);
  });

  it("does not ignore normal source files", () => {
    expect(isIgnoredForAI("src/order.ts", false)).toBe(false);
    expect(isIgnoredForAI("Dockerfile", false)).toBe(false);
  });

  it("honours extra glob patterns from config", () => {
    expect(isIgnoredForAI("coverage/x.json", false, ["coverage/**"])).toBe(true);
    expect(isIgnoredForAI("src/fixtures/seed.json", false, ["**/fixtures/**"])).toBe(true);
    expect(isIgnoredForAI("notes.patch", false, ["*.patch"])).toBe(true);
  });
});

describe("glob matches", () => {
  it("compiles globs with **, *, and dir prefixes", () => {
    expect(globToRegExp("coverage/**").test("coverage/a/b.json")).toBe(true);
    expect(globToRegExp("*.lock").test("yarn.lock")).toBe(true);
    expect(globMatches("coverage/", "coverage/x/lcov.info")).toBe(true);
    expect(globMatches("*.patch", "root.patch")).toBe(true);
    expect(globMatches("**/fixtures/**", "src/fixtures/seed.json")).toBe(true);
    expect(globMatches("build/", "src/index.ts")).toBe(false);
  });
});

describe("sensitive paths", () => {
  it("flags env files except the documented examples", () => {
    expect(isSensitive(".env")).toBe(true);
    expect(isSensitive(".env.production")).toBe(true);
    expect(isSensitive(".env.example")).toBe(false);
    expect(isSensitive(".env.sample")).toBe(false);
    expect(isSensitive(".env.template")).toBe(false);
  });

  it("flags keys and credential files", () => {
    expect(isSensitive("keys/server.pem")).toBe(true);
    expect(isSensitive("id_rsa")).toBe(true);
    expect(isSensitive("id_ed25519.pub")).toBe(true);
    expect(isSensitive("config/credentials.json")).toBe(true);
    expect(isSensitive("secrets.yaml")).toBe(true);
    expect(isSensitive("serviceAccount-foo.json")).toBe(true);
  });

  it("provides a reason", () => {
    expect(sensitiveReason("config/credentials.json")).toContain("credentials");
    expect(sensitiveReason("src/app.ts")).toBeUndefined();
  });
});

describe("diff budget", () => {
  function cf(path: string, category: ClassifiedFile["category"], ignored = false): ClassifiedFile {
    return {
      path,
      status: "M",
      added: 1,
      deleted: 1,
      binary: false,
      category,
      ignoredForAI: ignored,
      sensitive: false,
    };
  }

  it("truncates at a line boundary with a marker", () => {
    const r = truncateDiff("a".repeat(4000), 1000);
    expect(r.truncated).toBe(true);
    expect(r.text).toMatch(/\[\.\.\. truncated \d+ lines \.\.\.\]$/);
  });

  it("keeps short text untouched", () => {
    const r = truncateDiff("short", 1000);
    expect(r).toEqual({ text: "short", truncated: false });
  });

  it("prioritises source files and drops over-budget files", () => {
    const textFor = (n: number) => "x".repeat(n);
    const files = [
      cf("docs/readme.md", "docs"),
      cf("src/order.ts", "source"),
    ];
    const docsDiff = "same line\n".repeat(500);
    const diffs = new Map([
      ["docs/readme.md", docsDiff],
      ["src/order.ts", textFor(200)],
    ]);
    const picked = selectDiffs(files, diffs, { maxDiffChars: 1000, perFileCap: 2000 });
    expect(picked.map((p) => p.path)).toEqual(["src/order.ts"]);
  });

  it("skips ignored and sensitive files", () => {
    const files = [
      cf("src/order.ts", "source", true),
      cf("secrets.txt", "source", false),
    ];
    files[1]!.sensitive = true;
    const picked = selectDiffs(files, new Map([["src/order.ts", "x"], ["secrets.txt", "y"]]));
    expect(picked).toEqual([]);
  });
});