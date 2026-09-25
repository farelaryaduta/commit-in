import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  ConfigFileSchema,
  DEFAULTS,
  formatSchemaErrors,
  type ConfigFile,
  type ResolvedConfig,
} from "./schema";

export const CONFIG_FILENAMES = [".commitnowrc.json", "commitnowrc.json"] as const;

export class ConfigError extends Error {}

/** Resolve `.commitnowrc.json` in `cwd` (no upward search), if present. */
export function findConfigFile(cwd: string): string | undefined {
  for (const name of CONFIG_FILENAMES) {
    const p = join(cwd, name);
    if (existsSync(p)) return p;
  }
  return undefined;
}

function parseBool(value: string | undefined): boolean | undefined {
  if (value === undefined) return undefined;
  return value === "1" || value.toLowerCase() === "true";
}

type IntOrInvalid = number | "invalid" | undefined;

function readInt(
  env: Record<string, string | undefined>,
  key: string,
): IntOrInvalid {
  const value = env[key];
  if (value === undefined) return undefined;
  const n = Number(value);
  return Number.isInteger(n) ? n : "invalid";
}

function warnInvalid(
  warnings: string[],
  key: string,
  value: string | undefined,
  expected: string,
): void {
  warnings.push(`COMMIT_IN_${key}='${value}' is invalid (expected ${expected})`);
}

function envOverrides(
  env: Record<string, string | undefined>,
  warnings: string[],
): Partial<ResolvedConfig> {
  const out: Partial<ResolvedConfig> = {};

  const apiUrl = env.COMMIT_IN_API_URL;
  if (apiUrl !== undefined) {
    if (/^https?:\/\//i.test(apiUrl)) out.apiUrl = apiUrl;
    else warnInvalid(warnings, "API_URL", apiUrl, "an http(s) URL");
  }

  const apiToken = env.COMMIT_IN_API_TOKEN;
  if (apiToken !== undefined) {
    if (apiToken.trim() !== "") out.apiToken = apiToken;
    else warnInvalid(warnings, "API_TOKEN", apiToken, "a non-empty string");
  }

  const count = readInt(env, "COMMIT_IN_COUNT");
  if (count === "invalid") warnInvalid(warnings, "COUNT", env.COMMIT_IN_COUNT, "integer 1..5");
  else if (count !== undefined && !(count >= 1 && count <= 5)) {
    warnInvalid(warnings, "COUNT", env.COMMIT_IN_COUNT, "integer 1..5");
  } else if (count !== undefined) out.count = count;

  const historyDepth = readInt(env, "COMMIT_IN_HISTORY_DEPTH");
  if (historyDepth === "invalid")
    warnInvalid(warnings, "HISTORY_DEPTH", env.COMMIT_IN_HISTORY_DEPTH, "integer 1..200");
  else if (historyDepth !== undefined && !(historyDepth >= 1 && historyDepth <= 200)) {
    warnInvalid(warnings, "HISTORY_DEPTH", env.COMMIT_IN_HISTORY_DEPTH, "integer 1..200");
  } else if (historyDepth !== undefined) out.historyDepth = historyDepth;

  const maxDiffChars = readInt(env, "COMMIT_IN_MAX_DIFF_CHARS");
  if (maxDiffChars === "invalid")
    warnInvalid(warnings, "MAX_DIFF_CHARS", env.COMMIT_IN_MAX_DIFF_CHARS, "integer >= 0");
  else if (maxDiffChars !== undefined && maxDiffChars < 0) {
    warnInvalid(warnings, "MAX_DIFF_CHARS", env.COMMIT_IN_MAX_DIFF_CHARS, "integer >= 0");
  } else if (maxDiffChars !== undefined) out.maxDiffChars = maxDiffChars;

  const language = env.COMMIT_IN_LANGUAGE;
  if (language !== undefined) {
    if (language === "auto" || language === "en" || language === "id") out.language = language;
    else warnInvalid(warnings, "LANGUAGE", language, "auto|en|id");
  }

  const body = parseBool(env.COMMIT_IN_BODY);
  if (body !== undefined) out.body = body;

  const timeoutMs = readInt(env, "COMMIT_IN_TIMEOUT_MS");
  if (timeoutMs === "invalid")
    warnInvalid(warnings, "TIMEOUT_MS", env.COMMIT_IN_TIMEOUT_MS, "integer >= 1000");
  else if (timeoutMs !== undefined && timeoutMs < 1000) {
    warnInvalid(warnings, "TIMEOUT_MS", env.COMMIT_IN_TIMEOUT_MS, "integer >= 1000");
  } else if (timeoutMs !== undefined) out.timeoutMs = timeoutMs;

  const maxRetries = readInt(env, "COMMIT_IN_MAX_RETRIES");
  if (maxRetries === "invalid")
    warnInvalid(warnings, "MAX_RETRIES", env.COMMIT_IN_MAX_RETRIES, "integer 0..3");
  else if (maxRetries !== undefined && !(maxRetries >= 0 && maxRetries <= 3)) {
    warnInvalid(warnings, "MAX_RETRIES", env.COMMIT_IN_MAX_RETRIES, "integer 0..3");
  } else if (maxRetries !== undefined) out.maxRetries = maxRetries;

  const temperature = env.COMMIT_IN_TEMPERATURE;
  if (temperature !== undefined) {
    const t = Number(temperature);
    if (Number.isFinite(t) && t >= 0 && t <= 2) out.temperature = t;
    else warnInvalid(warnings, "TEMPERATURE", temperature, "number 0..2");
  }

  const maxSubjectLength = readInt(env, "COMMIT_IN_MAX_SUBJECT_LENGTH");
  if (maxSubjectLength === "invalid" || maxSubjectLength === undefined) {
    // tolerate but ignore non-integers silently
  } else if (maxSubjectLength !== undefined) out.maxSubjectLength = maxSubjectLength;

  const ignore = env.COMMIT_IN_IGNORE;
  if (ignore !== undefined) out.ignore = ignore.split(",").map((s) => s.trim()).filter(Boolean);

  const forceConventional = parseBool(env.COMMIT_IN_FORCE_CONVENTIONAL);
  if (forceConventional !== undefined) out.forceConventional = forceConventional;

  return out;
}

export interface LoadResult {
  config: ResolvedConfig;
  warnings: string[];
}

/**
 * Load and merge config from defaults + `.commitnowrc.json` + environment.
 * Throws ConfigError on an unreadable or schema-invalid config file.
 */
export function loadConfig(
  cwd: string,
  env: Record<string, string | undefined> = process.env,
): LoadResult {
  const warnings: string[] = [];
  const filePath = findConfigFile(cwd);
  let file: ConfigFile = {};

  if (filePath) {
    let raw: string;
    try {
      raw = readFileSync(filePath, "utf8");
    } catch (err) {
      throw new ConfigError(`cannot read ${filePath}: ${(err as Error).message}`);
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new ConfigError(`${filePath} is not valid JSON`);
    }
    const result = ConfigFileSchema.safeParse(parsed);
    if (!result.success) {
      throw new ConfigError(
        `${filePath} has invalid values:\n  - ${formatSchemaErrors(result.error).join("\n  - ")}`,
      );
    }
    file = result.data;
  }

  const merged: ResolvedConfig = { ...DEFAULTS, ...file };

  const fromEnv = envOverrides(env, warnings);
  Object.assign(merged, fromEnv);

  return { config: merged, warnings };
}