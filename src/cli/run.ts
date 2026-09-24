import type { ChangeSummary, CommitType, Suggestion } from "../types";
import { classifyFiles } from "../classify";
import { analyzeStyle, gatherContext } from "../history";
import {
  DEFAULT_PER_FILE_CAP,
  isIgnoredForAI,
  isSensitive,
  redact,
  selectDiffs,
} from "../safety";
import {
  isGitRepo,
  getRepoRoot,
  getStagedFiles,
  getWorkingTreeChanges,
  stageTracked,
  stagePaths,
  getStagedDiffByFile,
  getRecentCommits,
  commit,
  type WorkingTreeFile,
} from "../git";
import { run } from "../git/run";
import { buildPrompt, parseSuggestions } from "../prompt";
import { ProviderError, FakeProvider, DeepSeekProvider } from "../providers";
import type { LLMProvider } from "../providers";
import { loadConfig, type ResolvedConfig } from "../config";
import { CancelError, type Prompts } from "../ui";

export const EXIT_OK = 0;
export const EXIT_ERROR = 1;
export const EXIT_USAGE = 2;
export const EXIT_SENSITIVE = 3;
export const EXIT_CANCEL = 130;

export interface RunOptions {
  stagedOnly: boolean;
  commit: boolean;
  push: boolean;
  dryRun: boolean;
  echo: boolean;
  full: boolean;
  yes: boolean;
  count?: number;
  provider?: "deepseek" | "fake";
  language?: "auto" | "en" | "id";
  type?: CommitType;
  scope?: string;
  model?: string;
  body?: boolean;
  noVerify: boolean;
  forceConventional?: boolean;
}

export interface RunDeps {
  cwd: string;
  prompts: Prompts;
  env: Record<string, string | undefined>;
  out(msg: string): void;
  err(msg: string): void;
  providerOverride?: LLMProvider;
}

const truncate = (s: string, n: number): string =>
  s.length > n ? `${s.slice(0, n - 1)}…` : s;

/**
 * Run the full commit-in flow. Returns a process exit code.
 */
export async function runCli(opts: RunOptions, deps: RunDeps): Promise<number> {
  const { err } = deps;
  try {
    return await execute(opts, deps);
  } catch (e) {
    if (e instanceof CancelError) return EXIT_CANCEL;
    err(`error: ${(e as Error).message}`);
    return EXIT_ERROR;
  }
}

async function execute(opts: RunOptions, deps: RunDeps): Promise<number> {
  const { cwd, prompts, env, out, err } = deps;

  if (!(await isGitRepo(cwd))) {
    err("not a git repository");
    return EXIT_USAGE;
  }
  const root = await getRepoRoot(cwd);

  const loaded = loadConfig(root, env);
  for (const w of loaded.warnings) err(`warning: ${w}`);
  const config = loaded.config;
  if (opts.provider) config.provider = opts.provider;
  if (opts.model) config.model = opts.model;
  if (opts.count !== undefined) config.count = opts.count;
  if (opts.forceConventional) config.forceConventional = true;
  if (opts.language) config.language = opts.language;
  if (opts.body) config.body = true;

  // ---- staged files  ------------------------------------------
  let staged = await getStagedFiles(root);
  if (staged.length === 0) {
    const working: WorkingTreeFile[] = await getWorkingTreeChanges(root);
    if (working.length === 0) {
      err("no changes to commit");
      return EXIT_ERROR;
    }
    if (opts.stagedOnly) {
      err("no staged changes (run git add or drop --stageddonly)");
      return EXIT_USAGE;
    }
    const stageAll =
      opts.yes ||
      (await prompts.confirm({
        message: `No staged changes. Stage all ${working.length} working-tree file(s)?`,
        initialValue: true,
      }));
    if (stageAll) {
      await stageTracked(root);
      staged = await getStagedFiles(root);
    } else {
      const picked = await prompts.multiselect({
        message: "Pick files to stage",
        options: working.map((f) => ({
          value: f.path,
          label: f.path,
          hint: f.staged ? "staged" : f.untracked ? "untracked" : "unstaged",
        })),
      });
      await stagePaths(root, picked);
      staged = await getStagedFiles(root);
    }
    if (staged.length === 0) {
      err("no files staged");
      return EXIT_ERROR;
    }
  }

  // ---- history-driven style  ----------------------------------
  const recent = await getRecentCommits(root, config.historyDepth);
  const style = analyzeStyle(recent);
  style.language = config.language === "auto" ? style.language : config.language;
  if (config.forceConventional) style.conventional = true;

  // ---- classification  ----------------------------------------
  const ignored = (path: string, binary: boolean): boolean =>
    isSensitive(path) || isIgnoredForAI(path, binary, config.ignore);

  const change = await classifyFiles(staged, root, {
    knownScopes: style.knownScopes,
    isIgnoredForAI: (f) => ignored(f.path, f.binary),
  });
  for (const f of change.files) {
    f.sensitive = isSensitive(f.path);
  }

  // ---- type/scope flags override hints ----------------------------------
  if (opts.type) {
    change.typeHint = opts.type;
    change.typeLocked = true;
  }
  if (opts.scope) change.scopeHint = opts.scope;

  // ---- sensitive-file guard (FR-SEC-2) ----------------------------------
  const sensitive = change.files.filter((f) => f.sensitive);
  if (sensitive.length > 0) {
    const names = sensitive.map((f) => f.path).join(", ");
    if (opts.yes) {
      err(`sensitive file(s) staged, aborting: ${names}`);
      return EXIT_SENSITIVE;
    }
    const contin = await prompts.confirm({
      message: `⚠  ${names} looks sensitive. Skip its content and continue?`,
      initialValue: false,
    });
    if (!contin) return EXIT_SENSITIVE;
  }

  // ---- diffs (FR-SEC-1/3) -----------------------------------------------
  const fetchable = change.files.filter((f) => !f.sensitive).map((f) => f.path);
  const rawDiffs = await getStagedDiffByFile(root, fetchable);
  const redacted = new Map<string, string>();
  for (const [path, text] of rawDiffs) redacted.set(path, redact(text));

  const diffSlices = selectDiffs(change.files, redacted, {
    maxDiffChars: config.maxDiffChars,
    perFileCap: DEFAULT_PER_FILE_CAP,
  });

  const context = await gatherContext(root, fetchable);

  // ---- prompt  --------------------------------------------------
  const request = buildPrompt({
    change,
    style,
    diffs: diffSlices,
    context,
    count: config.count,
    maxSubjectLength: config.maxSubjectLength,
  });
  request.temperature = config.temperature;

  // ---- echo mode (FR-CMD-3) ----------------------------------------------
  if (opts.echo) {
    out("── system ──");
    out(request.system);
    out("");
    out("── user ──");
    out(request.user);
    if (opts.full) {
      out("");
      out("── full diff ──");
      if (redacted.size === 0) out("[no diff content]");
      for (const [path, text] of redacted) {
        out(`### ${path}`);
        out(text);
      }
    }
    return EXIT_OK;
  }

  // ---- provider -----------------------------------------------------------
  const provider = resolveProviderFor(config, deps);
  if (provider === null) {
    err(
      "DEEPSEEK_API_KEY is not set.\n" +
        "  Export it (PowerShell: `$env:DEEPSEEK_API_KEY=\"sk-...\"`),\n" +
        "  add it to `.commitinrc.json`, or use `--provider fake` for offline testing.",
    );
    return EXIT_USAGE;
  }
  if (config.apiKeyFromFile && !env.DEEPSEEK_API_KEY) {
    err("warning: API key read from config file — prefer the DEEPSEEK_API_KEY env var");
  }

  // ---- generate + parse ----------------------------------------------------
  let raw: string;
  try {
    raw = await provider.generate(request);
  } catch (e) {
    reportProviderError(err, e);
    return EXIT_ERROR;
  }

  let suggestions = parseSuggestions(raw, style, change.typeHint, config.count);
  if (suggestions.length === 0) {
    const manual = await prompts.text({
      message: "No suggestions parsed. Paste a commit subject (or Enter to abort)",
    });
    if (manual === undefined) return EXIT_CANCEL;
    suggestions = [{ subject: manual }];
  }

  // ---- pick  -------------------------------------------------------
  let chosen: Suggestion;
  if (opts.yes) {
    chosen = suggestions[0]!;
  } else {
    const value = await prompts.select({
      message: "Choose a commit message",
      options: [
        ...suggestions.map((s, i) => ({
          value: `s${i}`,
          label: truncate(s.subject, 72),
          hint: s.body ? truncate(s.body.split("\n")[0]!, 40) : undefined,
        })),
        { value: "custom", label: "✏️  Write my own message" },
        { value: "cancel", label: "⏹  Cancel" },
      ],
    });
    if (value === "cancel") return EXIT_CANCEL;
    if (value === "custom") {
      const subject = await prompts.text({ message: "Commit subject" });
      if (subject === undefined || subject.trim() === "") return EXIT_CANCEL;
      let body: string | undefined;
      if (config.body) {
        const b = await prompts.text({ message: "Body (optional, Enter to skip)" });
        if (b !== undefined && b.trim() !== "") body = b;
      }
      chosen = { subject: subject.trim(), body };
    } else {
      chosen = suggestions[Number(value.slice(1))]!;
    }
  }

  // ---- body (FR-HIST-4) -----------------------------------------------------
  if (config.body && !opts.yes) {
    const b = await prompts.text({ message: "Body (optional, Enter to skip)" });
    if (b !== undefined && b.trim() !== "") chosen.body = b;
  }

  const message = chosen.body ? `${chosen.subject}\n\n${chosen.body.trim()}` : chosen.subject;

  // ---- final gate ---------------------------------------------------------------
  if (opts.dryRun) {
    out("\nCommit message:");
    out("");
    out(message);
    out("\n(dry run — nothing committed)");
    return EXIT_OK;
  }

  if (!opts.commit) {
    const confirmCommit = await prompts.confirm({
      message: "Commit with this message?",
      initialValue: true,
    });
    if (!confirmCommit) return EXIT_OK;
  }

  const hash = await commit(root, message, opts.noVerify);
  out(`✓ committed ${hash} — ${chosen.subject}`);

  if (opts.push) {
    const res = await run(root, ["push"]);
    if (!res.ok) {
      err(`git push failed: ${res.stderr.trim() || res.stdout.trim()}`);
      return EXIT_ERROR;
    }
    out("✓ pushed");
  }

  return EXIT_OK;
}

function resolveProviderFor(
  config: ResolvedConfig,
  deps: RunDeps,
): LLMProvider | null {
  if (deps.providerOverride) return deps.providerOverride;
  if (config.provider === "fake") return new FakeProvider();
  const rawKey = deps.env.DEEPSEEK_API_KEY ?? config.apiKey;
  if (!rawKey) return null;
  return new DeepSeekProvider(rawKey, fetch, {
    model: config.model,
    timeoutMs: config.timeoutMs,
    maxRetries: config.maxRetries,
  });
}

function reportProviderError(err: (msg: string) => void, e: unknown): void {
  if (e instanceof ProviderError) {
    const hints: Record<string, string> = {
      auth: "DeepSeek rejected the API key. Double-check DEEPSEEK_API_KEY.",
      timeout: "The request timed out. Try again in a moment.",
      network: "Network error talking to DeepSeek. Check your connection.",
      http: "DeepSeek returned an error status.",
      empty: "DeepSeek returned an empty completion; try again.",
      parse: "DeepSeek returned malformed JSON.",
    };
    err(`error: ${e.message}`);
    const hint = hints[e.code];
    if (hint) err(`  ${hint}`);
    return;
  }
  err(`error: ${(e as Error).message}`);
}