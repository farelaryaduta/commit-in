import type { ClassifiedFile, FileCategory } from "../types";

export interface DiffSlice {
  path: string;
  text: string;
  truncated: boolean;
}

export const DEFAULT_MAX_DIFF_CHARS = 12_000;
export const DEFAULT_PER_FILE_CAP = 2_000;

/** Priority order for spending the diff budget: source first, then tests, config, docs, rest. */
const PRIORITY: Record<FileCategory, number> = {
  source: 0,
  controller: 0,
  model: 0,
  migration: 0,
  route: 0,
  view: 0,
  page: 0,
  component: 0,
  service: 0,
  test: 1,
  config: 2,
  docs: 3,
  deps: 4,
  style: 4,
  asset: 4,
  ci: 4,
  other: 4,
};

/** Truncate diff text to `capChars`, ending on a line boundary with a marker. */
export function truncateDiff(
  text: string,
  capChars: number,
): { text: string; truncated: boolean } {
  if (text.length <= capChars) {
    return { text, truncated: false };
  }
  const lines = text.split("\n");
  const kept: string[] = [];
  let length = 0;
  for (const line of lines) {
    const cost = line.length + 1;
    if (length + cost > capChars) break;
    kept.push(line);
    length += cost;
  }
  const dropped = lines.length - kept.length;
  const truncatedText = `${kept.join("\n")}\n[... truncated ${dropped} lines ...]`;
  return { text: truncatedText, truncated: true };
}

export interface DiffBudgetOptions {
  maxDiffChars?: number;
  perFileCap?: number;
}

/**
 * Select which diffs to include in the prompt under the character budget.
 * Files are prioritized (source first), each is truncated to the per-file
 * cap, and a file whose slice would overflow the total budget is dropped.
 */
export function selectDiffs(
  files: ClassifiedFile[],
  diffTexts: Map<string, string>,
  options: DiffBudgetOptions = {},
): DiffSlice[] {
  const maxDiffChars = options.maxDiffChars ?? DEFAULT_MAX_DIFF_CHARS;
  const perFileCap = options.perFileCap ?? DEFAULT_PER_FILE_CAP;

  const eligible = files
    .filter((f) => !f.ignoredForAI && !f.sensitive && diffTexts.has(f.path))
    .sort(
      (a, b) => PRIORITY[a.category] - PRIORITY[b.category],
    );

  const out: DiffSlice[] = [];
  let used = 0;
  for (const f of eligible) {
    const raw = diffTexts.get(f.path)!;
    const { text, truncated } = truncateDiff(raw, perFileCap);
    if (used + text.length > maxDiffChars) break;
    out.push({ path: f.path, text, truncated });
    used += text.length;
  }
  return out;
}