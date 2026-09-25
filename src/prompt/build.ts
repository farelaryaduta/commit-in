import type { ChangeSummary, GenerateRequest, StyleProfile } from "../types";
import type { RepoContext } from "../history";
import type { DiffSlice } from "../safety";

export interface BuildPromptInput {
  change: ChangeSummary;
  style: StyleProfile;
  diffs: DiffSlice[];
  context: RepoContext;
  count?: number;
  /** Hard subject-length cap (from CLU/config), overrides p90. */
  maxSubjectLength?: number;
}

const bullet = (s: string): string => `- ${s}`;

const wantSubject = (length: number): string =>
  `{type}({scope}): {subject${
    length > 0 ? `, at most ${length} chars` : ""
  }}`;

function diffSection(diffs: DiffSlice[]): string[] {
  if (diffs.length === 0) return ["[no diff text selected]"];
  const out: string[] = [];
  for (const d of diffs) {
    out.push(`### ${d.path}` + (d.truncated ? " (truncated)" : ""));
    out.push(d.text);
  }
  return out;
}

function contextSection(input: BuildPromptInput): string[] {
  const { style, context } = input;
  const out = [
    `- Branch: ${context.branch ?? "(detached)"}`,
    `- Commit style: ${style.conventional ? "conventional" : "plain"}`,
    `- Language: ${style.language}`,
  ];
  if (style.conventional && Object.keys(style.typeCounts).length > 0) {
    const freqs = Object.entries(style.typeCounts)
      .sort((a, b) => b[1] - a[1])
      .map(([t, n]) => `${t} ${n}`)
      .join(", ");
    out.push(`- Type frequencies: ${freqs}`);
  }
  if (style.knownScopes.length > 0) {
    out.push(`- Known scopes: ${style.knownScopes.join(", ")}`);
  }
  out.push(
    `- Subject style: avg ${style.avgSubjectLength}; p90 ${style.p90SubjectLength}; ` +
      (style.lowercaseStart ? "lowercase start; " : "") +
      (style.endsWithPeriod ? "trailing period ok" : "no trailing period") +
      (style.usesEmoji ? "; emoji style" : ""),
  );
  if (style.examples.length > 0) {
    out.push(`- Example commits:`);
    for (const ex of style.examples) out.push(`  - ${ex}`);
  }
  if (context.commits.length > 0) {
    out.push(`- Recent commits touching the same files (never repeat verbatim):`);
    for (const c of context.commits) out.push(`  - ${c.subject}`);
  }
  return out;
}

function classificationSection(input: BuildPromptInput): string[] {
  const { change } = input;
  if (!change.typeHint && !change.scopeHint) return [];
  const parts: string[] = [];
  if (change.typeHint) {
    parts.push(
      bullet(
        `Suggested type: ${change.typeHint} (${
          change.typeLocked ? "required" : "default, change if clearly better"
        })`,
      ),
    );
  }
  if (change.scopeHint) {
    parts.push(bullet(`Suggested scope: ${change.scopeHint} (optional)`));
  }
  return parts;
}

function constraintSection(input: BuildPromptInput): string[] {
  const { style } = input;
  const maxLen = input.maxSubjectLength ?? Math.max(style.p90SubjectLength, 0);
  const out = [
    bullet(`Return exactly ${input.count ?? 3} options as a numbered list.`),
    bullet(
      style.conventional
        ? `Use Conventional Commits: first line ${wantSubject(maxLen)}.`
        : `First line: plain subject, at most ${maxLen > 0 ? maxLen : 72} chars.`,
    ),
    bullet(style.lowercaseStart ? "Start subjects with a lowercase letter." : "Casing follows repo history."),
    bullet(style.endsWithPeriod ? "Repo history ends subjects with a period; stay consistent." : "Do not end subjects with a period."),
    bullet(style.usesEmoji ? "Match the repo's emoji usage in subjects." : "Do not use emojis."),
    bullet("A subject may be followed by indented body lines when the change needs explanation."),
    bullet("Never mention file paths or content absent from the diff."),
    bullet("Write subjects that describe the change's purpose, not the diff's mechanics."),
    bullet("Avoid filler like \"add lines\" or \"update file\" when a more meaningful subject exists."),
    bullet("A subject must make sense to someone who never sees the diff."),
    bullet("NEVER repeat a recent commit subject verbatim."),
  ];
  return out;
}

/** Build the system + user prompt for the provider. Returns a GenerateRequest. */
export function buildPrompt(input: BuildPromptInput): GenerateRequest {
  const count = input.count ?? 3;

  const system = [
    "You are a git commit message assistant integrated into a CLI.",
    `Given the staged changes below, suggest ${count} commit message options.`,
    "Return ONLY a numbered markdown list, one option per line, with no preamble or commentary.",
    "If the repo uses Conventional Commits, every subject must match: type(optional scope): subject.",
    "Do not invent file names or code that is not present in the diff.",
    "If the diff text is empty, return exactly: NO_SUGGESTIONS",
  ].join("\n");

  const user = [
    "## Staged files",
    ...input.change.files.map((f) =>
      bullet(
        `${f.path} (${f.status === "A" ? "added" : f.status === "D" ? "deleted" : f.status === "R" ? "renamed" : "modified"}${
          f.status === "R" && f.oldPath ? ` from ${f.oldPath}` : ""
        }${f.added !== null ? `, +${f.added}` : ""}${f.deleted !== null ? ` -${f.deleted}` : ""})`,
      ),
    ),
    "",
    "## Unified diff (truncated)",
    ...diffSection(input.diffs),
    "",
    "## Repo context",
    ...contextSection(input),
    "",
    "## Classification",
    ...(classificationSection(input).length > 0
      ? classificationSection(input)
      : [bullet("(no strong hints; classify from the diff yourself)")]),
    "",
    "## Constraints",
    ...constraintSection(input),
    "",
    `Total diff: ${input.change.totals.files} files, +${input.change.totals.added} -${input.change.totals.deleted}.`,
  ].join("\n");

  return { system, user, temperature: 0.7, maxTokens: 250 };
}