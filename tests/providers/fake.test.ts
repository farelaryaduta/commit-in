import { afterEach, describe, expect, it } from "vitest";
import { FakeProvider } from "../../src/providers/fake";

describe("FakeProvider", () => {
  it("returns canned suggestions", async () => {
    const p = new FakeProvider(["feat(api): add login", "fix(ui): spacing"]);
    const out = await p.generate({ system: "s", user: "u" });
    expect(out).toBe("feat(api): add login\nfix(ui): spacing");
  });

  it("uses defaults when no suggestions given", async () => {
    const p = new FakeProvider();
    const out = await p.generate({ system: "s", user: "u" });
    expect(out).toContain("feat");
  });

  afterEach(() => {
    delete process.env.COMMIT_IN_FAKE_SUGGESTIONS;
  });

  it("FakeProvider.fromEnv reads COMMIT_IN_FAKE_SUGGESTIONS", async () => {
    process.env.COMMIT_IN_FAKE_SUGGESTIONS = "feat: one\nfix: two\n";
    const p = FakeProvider.fromEnv();
    expect(await p.generate({ system: "s", user: "u" })).toBe("feat: one\nfix: two");
  });
});