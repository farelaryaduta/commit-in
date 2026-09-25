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
  stageAllChanges,
  stagePaths,
  getStagedDiffByFile,
  getRecentCommits,
  getCurrentBranch,
  commit,
  type WorkingTreeFile,
} from "../git";
import { run } from "../git/run";
import { buildPrompt, isSlop, parseSuggestions } from "../prompt";
import {
  DEFAULT_API_URL,
  ProviderError,
  RemoteProvider,
  fallbackSuggestions,
} from "../providers";
import type { LLMProvider } from "../providers";
import { loadConfig, type ResolvedConfig } from "../config";
import { CancelError, statusPanel, type Prompts, type StatusView } from "../ui";
import pc from "picocolors";

export const EXIT_OK = 0;
export const EXIT_ERROR = 1;
export const EXIT_USAGE = 2;
export const EXIT_SENSITIVE = 3;
export const EXIT_CANCEL = 130;

export interface RunOptions {
  stagedOnly: boolean;
  all: boolean;
  commit: boolean;
  push: boolean;
  dryRun: boolean;
  echo: boolean;
  full: boolean;
  yes: boolean;
  offline: boolean;
  verbose: boolean;
  print: boolean;
  count?: number;
  apiUrl?: string;
  language?: "auto" | "en" | "id";
  type?: CommitType;
  scope?: string;
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
  /** Renders the welcome/status dashboard. Defaults to plain text via `out`. */
  render?(view: StatusView): void;
}

const truncate = (s: string, n: number): string =>
  s.length > n ? `${s.slice(0, n - 1)}…` : s;

/**
 * Run the full gitcomm flow. Returns a process exit code.
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
  if (opts.apiUrl) config.apiUrl = opts.apiUrl;
  if (opts.count !== undefined) config.count = opts.count;
  if (opts.forceConventional) config.forceConventional = true;
  if (opts.language) config.language = opts.language;
  if (opts.body) config.body = true;

  // ---- staged files  ------------------------------------------
  let staged = await getStagedFiles(root);
  if (opts.all) {
    await stageTracked(root);
    staged = await getStagedFiles(root);
  }
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
      await stageAllChanges(root);
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

  // ---- welcome dashboard (git-status style) ------------------------------
  const workingList = await getWorkingTreeChanges(root);
  const working = {
    staged: workingList.filter((f) => f.staged).length,
    unstaged: workingList.filter(
      (f) => !f.untracked && f.status.length > 1 && f.status[1] !== " ",
    ).length,
    untracked: workingList.filter((f) => f.untracked).length,
  };
  const branch = await getCurrentBranch(root);
  const render = deps.render ?? ((view: StatusView) => {
    for (const line of statusPanel(view)) out(line);
  });
  if (!opts.print) {
    render({
      root,
      branch,
      files: change.files,
      working,
      typeHint: change.typeHint,
      typeLocked: change.typeLocked,
      scopeHint: change.scopeHint,
      style: {
        conventional: style.conventional,
        language: style.language,
        p90SubjectLength: style.p90SubjectLength,
      },
    });
  }

  // ---- sensitive-file guard (FR-SEC-2) ----------------------------------
  const sensitive = change.files.filter((f) => f.sensitive);
  if (sensitive.length > 0) {
    const names = sensitive.map((f) => f.path).join(", ");
    if (opts.yes) {
      err(`sensitive file(s) staged, aborting: ${names}`);
      return EXIT_SENSITIVE;
    }
    const contin = await prompts.confirm({
      message: `${names} looks sensitive — skip its content and continue?`,
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
  const started = Date.now();
  const provider = opts.offline ? null : resolveProviderFor(config, deps);

  // ---- generate + parse ----------------------------------------------------
  let raw: string | undefined;
  if (!opts.offline && provider) {
    try {
      raw = await provider.generate(request);
    } catch (e) {
      reportProviderError(err, e);
      err("warning: provider failed — using rule-based suggestions");
    }
  }

  if (opts.verbose) {
    const latency = Date.now() - started;
    err(
      `verbose: provider=${opts.offline ? "offline" : provider?.name ?? "-"} latency=${latency}ms`,
    );
  }

  let suggestions: Suggestion[];
  if (!raw) {
    suggestions = fallbackSuggestions(change, style);
  } else {
    suggestions = parseSuggestions(raw, style, change.typeHint, config.count);
  }

  // ---- slop retry (one nudge, then keep whatever the model gives us) --------
  const vague = suggestions.filter((s) => isSlop(s.subject)).length;
  if (!opts.offline && suggestions.length > 0 && vague >= Math.ceil(suggestions.length / 2)) {
    const nudge =
      "\n\nSome previous subjects were too vague and did not name anything that changed (e.g. \"fix bugs\"). " +
      `Name the concrete unit in EVERY subject — the thing that was built, fixed, or moved — ` +
      `e.g. "feat(cart): add coupon model". Keep subjects under ${config.maxSubjectLength} chars, ` +
      "lowercase after the colon, no trailing period.";
    try {
      const raw2 = await provider!.generate({ ...request, user: request.user + nudge });
      suggestions = parseSuggestions(raw2, style, change.typeHint, config.count);
    } catch {
      // keep the first (vague) attempt; provider is busy flaking out
    }
  }

  // ---- print mode: subjects to stdout, no prompts ---------------------------
  if (opts.print) {
    if (suggestions.length === 0) {
      err("no usable suggestions from the AI service");
      return EXIT_ERROR;
    }
    for (const s of suggestions) out(s.subject);
    return EXIT_OK;
  }

  if (suggestions.length === 0) {
    const manual = await prompts.text({
      message: "No usable suggestions. Paste a commit subject (or Enter to abort)",
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
          label: colorizeType(truncate(s.subject, 72)),
          hint: s.body ? truncate(s.body.split("\n")[0]!, 40) : undefined,
        })),
        { value: "custom", label: "Write my own message", hint: "type a subject yourself" },
        { value: "cancel", label: "Cancel", hint: "abort" },
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
  out(`[${branch ?? "HEAD"} ${hash.slice(0, 7)}] ${colorizeType(chosen.subject)}`);

  if (opts.push) {
    const res = await run(root, ["push"]);
    if (!res.ok) {
      err(`git push failed: ${res.stderr.trim() || res.stdout.trim()}`);
      return EXIT_ERROR;
    }
    out("pushed");
  }

  return EXIT_OK;
}

function resolveProviderFor(
  config: ResolvedConfig,
  deps: RunDeps,
): LLMProvider {
  if (deps.providerOverride) return deps.providerOverride;
  return new RemoteProvider({
    apiUrl: config.apiUrl ?? DEFAULT_API_URL,
    apiToken: config.apiToken,
    timeoutMs: config.timeoutMs,
    maxRetries: config.maxRetries,
  });
}

function reportProviderError(err: (msg: string) => void, e: unknown): void {
  if (e instanceof ProviderError) {
    const hints: Record<string, string> = {
      auth: "The service rejected the request. Check COMMIT_IN_API_TOKEN.",
      rate_limit:
        "The service is rate limited. Try again in a moment, or commit in smaller batches.",
      timeout: "The request timed out. Try again in a moment.",
      network: "Network error talking to the gitcomm service. Check your connection.",
      http: "The gitcomm service returned an error status.",
      empty: "The service returned an empty completion; try again.",
      parse: "The service returned malformed data.",
    };
    err(`error: ${e.message}`);
    const hint = hints[e.code];
    if (hint) err(`  ${hint}`);
    return;
  }
  err(`error: ${(e as Error).message}`);
}

const TYPE_COLORS: Record<string, (s: string) => string> = {
  feat: pc.green,
  fix: pc.red,
  refactor: pc.yellow,
  perf: pc.yellow,
  docs: pc.blue,
  test: pc.magenta,
  style: pc.cyan,
  ci: pc.cyan,
  build: pc.cyan,
  chore: pc.dim,
};

/** Colorize a conventional subject by its type prefix (select list only). */
function colorizeType(subject: string): string {
  const m = /^([\w-]+)/.exec(subject);
  const color = m ? TYPE_COLORS[m[1]!] : undefined;
  return color ? color(subject) : subject;
}