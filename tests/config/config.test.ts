import { describe, expect, it } from "vitest";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadConfig, ConfigError, findConfigFile } from "../../src/config";
import { DEFAULTS } from "../../src/config";

function tempDir(): { dir: string; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), "commit-in-config-"));
  return { dir, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

describe("loadConfig", () => {
  it("returns defaults in an empty directory", () => {
    const { dir, cleanup } = tempDir();
    try {
      const { config, warnings } = loadConfig(dir, {});
      expect(config).toMatchObject({
        provider: "deepseek",
        count: 3,
        historyDepth: 50,
        maxDiffChars: 12000,
        language: "auto",
        body: false,
        maxSubjectLength: 72,
        apiKey: undefined,
        apiKeyFromFile: false,
      });
      expect(warnings).toEqual([]);
    } finally {
      cleanup();
    }
  });

  it("loads values from .commitinrc.json", () => {
    const { dir, cleanup } = tempDir();
    try {
      writeFileSync(
        join(dir, ".commitinrc.json"),
        JSON.stringify({ provider: "fake", count: 2, ignore: ["coverage/**"], apiKey: "sk-file" }),
      );
      const { config } = loadConfig(dir, {});
      expect(config.provider).toBe("fake");
      expect(config.count).toBe(2);
      expect(config.ignore).toEqual(["coverage/**"]);
      expect(config.apiKey).toBe("sk-file");
      expect(config.apiKeyFromFile).toBe(true);
    } finally {
      cleanup();
    }
  });

  it("lets environment overrides win over the config file", () => {
    const { dir, cleanup } = tempDir();
    try {
      writeFileSync(join(dir, ".commitinrc.json"), JSON.stringify({ count: 2, provider: "fake" }));
      const { config } = loadConfig(dir, { COMMIT_IN_COUNT: "5", DEEPSEEK_API_KEY: "sk-env" });
      expect(config.count).toBe(5);
      expect(config.provider).toBe("fake");
      expect(config.apiKey).toBe("sk-env");
    } finally {
      cleanup();
    }
  });

  it("prefers env key over file key but still flags the file", () => {
    const { dir, cleanup } = tempDir();
    try {
      writeFileSync(join(dir, ".commitinrc.json"), JSON.stringify({ apiKey: "sk-file" }));
      const { config, warnings } = loadConfig(dir, { DEEPSEEK_API_KEY: "sk-env" });
      expect(config.apiKey).toBe("sk-env");
      expect(config.apiKeyFromFile).toBe(true);
      expect(warnings).toEqual([]);
    } finally {
      cleanup();
    }
  });

  it("throws ConfigError on invalid JSON", () => {
    const { dir, cleanup } = tempDir();
    try {
      writeFileSync(join(dir, ".commitinrc.json"), "not json{");
      expect(() => loadConfig(dir, {})).toThrow(ConfigError);
      expect(() => loadConfig(dir, {})).toThrow("not valid JSON");
    } finally {
      cleanup();
    }
  });

  it("throws ConfigError listing invalid fields", () => {
    const { dir, cleanup } = tempDir();
    try {
      writeFileSync(
        join(dir, ".commitinrc.json"),
        JSON.stringify({ count: 99, provider: "wat" }),
      );
      try {
        loadConfig(dir, {});
        expect.unreachable("should have thrown");
      } catch (err) {
        expect(err).toBeInstanceOf(ConfigError);
        const msg = (err as Error).message;
        expect(msg).toContain("count");
        expect(msg).toContain("provider");
      }
    } finally {
      cleanup();
    }
  });

  it("warns about invalid env values without failing", () => {
    const { dir, cleanup } = tempDir();
    try {
      const { config, warnings } = loadConfig(dir, {
        COMMIT_IN_COUNT: "abc",
        COMMIT_IN_PROVIDER: "bogus",
      });
      expect(config.count).toBe(DEFAULTS.count);
      expect(config.provider).toBe(DEFAULTS.provider);
      expect(warnings.length).toBe(2);
    } finally {
      cleanup();
    }
  });

  it("parses env booleans and numbers", () => {
    const { dir, cleanup } = tempDir();
    try {
      const { config } = loadConfig(dir, {
        COMMIT_IN_BODY: "1",
        COMMIT_IN_FORCE_CONVENTIONAL: "true",
        COMMIT_IN_TEMPERATURE: "0.3",
        COMMIT_IN_MAX_RETRIES: "1",
        COMMIT_IN_TIMEOUT_MS: "15000",
      });
      expect(config.body).toBe(true);
      expect(config.forceConventional).toBe(true);
      expect(config.temperature).toBe(0.3);
      expect(config.maxRetries).toBe(1);
      expect(config.timeoutMs).toBe(15000);
    } finally {
      cleanup();
    }
  });

  it("finds config only in the given directory", () => {
    const { dir, cleanup } = tempDir();
    try {
      expect(findConfigFile(dir)).toBeUndefined();
      writeFileSync(join(dir, "commitinrc.json"), "{}");
      expect(findConfigFile(dir)).toBe(join(dir, "commitinrc.json"));
    } finally {
      cleanup();
    }
  });

  it("tolerates unknown keys in the config file", () => {
    const { dir, cleanup } = tempDir();
    try {
      writeFileSync(join(dir, ".commitinrc.json"), JSON.stringify({ futureKey: 1 }));
      const { config } = loadConfig(dir, {});
      expect(config.provider).toBe("deepseek");
    } finally {
      cleanup();
    }
  });
});