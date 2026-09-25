import { describe, expect, it } from "vitest";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadConfig, ConfigError, findConfigFile } from "../../src/config";
import { DEFAULTS } from "../../src/config";

function tempDir(): { dir: string; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), "gitcomm-config-"));
  return { dir, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

describe("loadConfig", () => {
  it("returns defaults in an empty directory", () => {
    const { dir, cleanup } = tempDir();
    try {
      const { config, warnings } = loadConfig(dir, {});
      expect(config).toMatchObject({
        count: 3,
        historyDepth: 50,
        maxDiffChars: 12000,
        language: "auto",
        body: false,
        maxSubjectLength: 72,
      });
      expect(config.apiUrl).toBeUndefined();
      expect(config.apiToken).toBeUndefined();
      expect(warnings).toEqual([]);
    } finally {
      cleanup();
    }
  });

  it("loads values from .gitcommrc.json", () => {
    const { dir, cleanup } = tempDir();
    try {
      writeFileSync(
        join(dir, ".gitcommrc.json"),
        JSON.stringify({
          apiUrl: "https://ci.example.com",
          apiToken: "secret-token",
          count: 2,
          ignore: ["coverage/**"],
        }),
      );
      const { config } = loadConfig(dir, {});
      expect(config.apiUrl).toBe("https://ci.example.com");
      expect(config.apiToken).toBe("secret-token");
      expect(config.count).toBe(2);
      expect(config.ignore).toEqual(["coverage/**"]);
    } finally {
      cleanup();
    }
  });

  it("lets environment overrides win over the config file", () => {
    const { dir, cleanup } = tempDir();
    try {
      writeFileSync(
        join(dir, ".gitcommrc.json"),
        JSON.stringify({ count: 2, apiUrl: "https://file.example.com" }),
      );
      const { config } = loadConfig(dir, {
        COMMIT_IN_COUNT: "5",
        COMMIT_IN_API_URL: "https://env.example.com",
      });
      expect(config.count).toBe(5);
      expect(config.apiUrl).toBe("https://env.example.com");
    } finally {
      cleanup();
    }
  });

  it("reads the optional service token from the environment", () => {
    const { dir, cleanup } = tempDir();
    try {
      const { config } = loadConfig(dir, { COMMIT_IN_API_TOKEN: "tok" });
      expect(config.apiToken).toBe("tok");
    } finally {
      cleanup();
    }
  });

  it("throws ConfigError on invalid JSON", () => {
    const { dir, cleanup } = tempDir();
    try {
      writeFileSync(join(dir, ".gitcommrc.json"), "not json{");
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
        join(dir, ".gitcommrc.json"),
        JSON.stringify({ count: 99, apiUrl: "not-a-url" }),
      );
      try {
        loadConfig(dir, {});
        expect.unreachable("should have thrown");
      } catch (err) {
        expect(err).toBeInstanceOf(ConfigError);
        const msg = (err as Error).message;
        expect(msg).toContain("count");
        expect(msg).toContain("apiUrl");
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
        COMMIT_IN_API_URL: "not-a-url",
      });
      expect(config.count).toBe(DEFAULTS.count);
      expect(config.apiUrl).toBeUndefined();
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
      writeFileSync(join(dir, "gitcommrc.json"), "{}");
      expect(findConfigFile(dir)).toBe(join(dir, "gitcommrc.json"));
    } finally {
      cleanup();
    }
  });

  it("tolerates unknown keys in the config file", () => {
    const { dir, cleanup } = tempDir();
    try {
      writeFileSync(join(dir, ".gitcommrc.json"), JSON.stringify({ futureKey: 1 }));
      const { config } = loadConfig(dir, {});
      expect(config.apiUrl).toBeUndefined();
    } finally {
      cleanup();
    }
  });
});