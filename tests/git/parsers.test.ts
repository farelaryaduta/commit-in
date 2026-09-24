import { describe, expect, it } from "vitest";
import { parseNameStatus, parseNumstat } from "../../src/git/staged";
import { parsePorcelain } from "../../src/git/commit";
import { parseLogOutput } from "../../src/git/log";

function b(s: string): Buffer {
  return Buffer.from(s, "utf8");
}

describe("parseNameStatus", () => {
  it("parses added/modified/deleted with tab handling", () => {
    const out = parseNameStatus(b("A\0a.ts\0M\0b.ts\0D\0c.ts\0"));
    expect(out).toEqual([
      { status: "A", path: "a.ts" },
      { status: "M", path: "b.ts" },
      { status: "D", path: "c.ts" },
    ]);
  });

  it("parses renames with oldPath and score suffix", () => {
    const out = parseNameStatus(b("R100\0old/name space.ts\0new dir/name2.ts\0"));
    expect(out).toEqual([
      { status: "R", oldPath: "old/name space.ts", path: "new dir/name2.ts" },
    ]);
  });

  it("handles Unicode paths", () => {
    const out = parseNameStatus(b("A\0héllo wörld 👋.txt\0"));
    expect(out).toEqual([{ status: "A", path: "héllo wörld 👋.txt" }]);
  });

  it("recognises type-changed (T) and copied (C) files", () => {
    const out = parseNameStatus(b("T\0x\0C100\0src/a.ts\0src/b.ts\0"));
    expect(out).toEqual([
      { status: "T", path: "x" },
      { status: "C", oldPath: "src/a.ts", path: "src/b.ts" },
    ]);
  });
});

describe("parseNumstat", () => {
  it("parses added/deleted counts", () => {
    const out = parseNumstat(b("1\t0\ta.ts\x0012\t3\tb.ts\x00"));
    expect(out).toEqual([
      { added: 1, deleted: 0, path: "a.ts" },
      { added: 12, deleted: 3, path: "b.ts" },
    ]);
  });

  it("marks binary files with null counts", () => {
    const out = parseNumstat(b("-\t-\timg.png\0"));
    expect(out).toEqual([
      { added: null, deleted: null, path: "img.png" },
    ]);
  });

  it("parses rename records with empty third column", () => {
    const out = parseNumstat(b("0\t0\t\0old file.ts\0new file.ts\0"));
    expect(out).toEqual([
      { added: 0, deleted: 0, oldPath: "old file.ts", path: "new file.ts" },
    ]);
  });
});

describe("parsePorcelain", () => {
  it("distinguishes staged, modified, and untracked files", () => {
    const out = parsePorcelain(b("M  staged.ts\0 M modified.ts\0?? untracked.txt\0"));
    expect(out).toEqual([
      { path: "staged.ts", staged: true, untracked: false, status: "M " },
      { path: "modified.ts", staged: false, untracked: false, status: " M" },
      { path: "untracked.txt", staged: false, untracked: true, status: "??" },
    ]);
  });

  it("parses staged renames with the old path token", () => {
    const out = parsePorcelain(b("R  new name.ts\0old name.ts\0"));
    expect(out).toEqual([
      {
        path: "new name.ts",
        oldPath: "old name.ts",
        staged: true,
        untracked: false,
        status: "R ",
      },
    ]);
  });
});

describe("parseLogOutput", () => {
  it("parses hash/subject/body records separated by NUL and newline", () => {
    const text =
      "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\u0000fix: parse n\u0000body line\nsecond\u0000\n" +
      "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb\u0000init\u0000\u0000\n";
    const out = parseLogOutput(text);
    expect(out).toEqual([
      {
        hash: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        subject: "fix: parse n",
        body: "body line\nsecond",
      },
      {
        hash: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
        subject: "init",
        body: "",
      },
    ]);
  });
});