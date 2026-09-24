import { afterEach, describe, expect, it } from "vitest";
import { FakeProvider } from "../../src/providers/fake";
import { resolveProvider } from "../../src/providers/registry";
import { ProviderError } from "../../src/providers/registry";

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
});

describe("registry", () => {
  afterEach(() => {
    delete process.env.COMMIT_IN_FAKE_SUGGESTIONS;
  });

  it("resolves the fake provider", () => {
    expect(resolveProvider("fake", undefined).name).toBe("fake");
  });

  it("resolves deepseek with a key", () => {
    const p = resolveProvider("deepseek", "sk-x");
    expect(p.name).toBe("deepseek");
  });

  it("restores the ProviderError type from the registry", () => {
    expect(new ProviderError("x", { code: "y" })).toBeInstanceOf(Error);
  });

  it("FakeProvider.fromEnv reads COMMIT_IN_FAKE_SUGGESTIONS", async () => {
    process.env.COMMIT_IN_FAKE_SUGGESTIONS = "feat: one\nfix: two\n";
    const p = FakeProvider.fromEnv();
    expect(await p.generate({ system: "s", user: "u" })).toBe("feat: one\nfix: two");
  });
});