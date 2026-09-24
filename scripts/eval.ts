/**
 * Real-model evaluation harness.
 *
 * Runs the full prompt assembly + DeepSeek call against the current repo's
 * staged changes and prints parsed suggestions as JSON for human review.
 *
 * Usage:
 *   DEEPSEEK_API_KEY=sk-... npm run eval
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { classifyFiles } from "../src/classify";
import { analyzeStyle, gatherContext } from "../src/history";
import {
  DEFAULT_PER_FILE_CAP,
  isIgnoredForAI,
  isSensitive,
  redact,
  selectDiffs,
} from "../src/safety";
import {
  getRepoRoot,
  getStagedFiles,
  getStagedDiffByFile,
  getRecentCommits,
} from "../src/git";
import { buildPrompt, parseSuggestions } from "../src/prompt";
import { DeepSeekProvider } from "../src/providers";
import {
  DEFAULT_MAX_RETRIES,
  DEFAULT_TIMEOUT_MS,
} from "../src/providers";
import { loadConfig } from "../src/config";

function version(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  const pkg = JSON.parse(
    readFileSync(join(here, "..", "package.json"), "utf8"),
  ) as { version: string };
  return pkg.version;
}

const cwd = process.cwd();

const root = await getRepoRoot(cwd);
const env: Record<string, string | undefined> = { ...process.env };
const config = loadConfig(root, env).config;
const apiKey = env.DEEPSEEK_API_KEY ?? config.apiKey;

if (!apiKey) {
  console.error("eval: DEEPSEEK_API_KEY is not set");
  process.exit(1);
}

const staged = await getStagedFiles(root);
if (staged.length === 0) {
  console.error("eval: no staged changes in", root);
  process.exit(1);
}

const recent = await getRecentCommits(root, config.historyDepth);
const style = analyzeStyle(recent);
style.language = config.language === "auto" ? style.language : config.language;

const change = await classifyFiles(staged, root, {
  knownScopes: style.knownScopes,
  isIgnoredForAI: (f) => isSensitive(f.path) || isIgnoredForAI(f.path, f.binary, config.ignore),
});
for (const f of change.files) f.sensitive = isSensitive(f.path);

const fetchable = change.files.filter((f) => !f.sensitive).map((f) => f.path);
const rawDiffs = await getStagedDiffByFile(root, fetchable);
const redacted = new Map<string, string>();
for (const [path, text] of rawDiffs) redacted.set(path, redact(text));

const diffs = selectDiffs(change.files, redacted, {
  maxDiffChars: config.maxDiffChars,
  perFileCap: DEFAULT_PER_FILE_CAP,
});

const context = await gatherContext(root, fetchable);
const request = buildPrompt({
  change,
  style,
  diffs,
  context,
  count: config.count,
  maxSubjectLength: config.maxSubjectLength,
});
request.temperature = config.temperature;

const provider = new DeepSeekProvider(apiKey, fetch, {
  model: config.model,
  timeoutMs: config.timeoutMs,
  maxRetries: config.maxRetries,
  thinkingDisabled: true,
});

console.log(`commit-in eval v${version()} | provider deepseek | files ${change.totals.files}`);
const raw = await provider.generate(request);
const suggestions = parseSuggestions(raw, style, change.typeHint, config.count);
console.log(JSON.stringify({ suggestions, style, requestLen: request.user.length }, null, 2));

const used = Object.values(style.typeCounts).reduce((a, b) => a + b, 0) || 0;
if (!style.conventional || used < 5) {
  console.warn("eval: fewer than 5 usable conventional commits — style is from fallback defaults");
}