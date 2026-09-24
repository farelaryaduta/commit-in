import type { CommitInfo, StyleProfile } from "../types";

const CONVENTIONAL_RE = /^[\w-]+(?:\([^)]+\))?!?: .+/;
const MIN_SAMPLE = 5;

function typeOf(subject: string): string | undefined {
  const m = /^([\w-]+)(?:\([^)]+\))?!?:/.exec(subject);
  return m ? m[1]!.toLowerCase() : undefined;
}

/** Subject minus its conventional prefix (e.g. "feat(api): add users" -> "add users"). */
function stem(subject: string): string {
  const m = /^[\w-]+(?:\([^)]+\))?!?:\s*(.*)$/.exec(subject);
  return m ? m[1]! : subject;
}

function hasEmoji(s: string): boolean {
  return (
    /[\p{Extended_Pictographic}\u{1F300}-\u{1F5FF}\u{2600}-\u{27BF}\u{FE0F}\u{2764}]/u.test(s) ||
    /:[a-z0-9_+-]+:/i.test(s)
  );
}

const ID_STOPWORDS = new Set([
  "yang", "dan", "untuk", "dengan", "menambahkan", "menambah", "perbaikan",
  "memperbaiki", "tambah", "menghapus", "hapus", "mengubah", "ubah", "merubah",
  "fitur", "di", "ke", "dari", "pada", "agar", "membuat", "memperbarui",
  "memperbaharui", "melakukan",
]);

const EN_STOPWORDS = new Set([
  "add", "fix", "update", "remove", "with", "for", "feat", "in", "of", "to",
  "make", "change", "changes", "and", "the", "improve", "improves",
  "implement", "support", "refactor",
]);

function detectLanguage(subjects: string[]): StyleProfile["language"] {
  let id = 0;
  let en = 0;
  for (const s of subjects) {
    const words = s.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
    for (const w of words) {
      if (ID_STOPWORDS.has(w)) id += 1;
      else if (EN_STOPWORDS.has(w)) en += 1;
    }
  }
  if (id === 0 && en === 0) return "en";
  if (id > en) return "id";
  if (en > id) return "en";
  return "mixed";
}

function buildKnownScopes(usable: CommitInfo[]): string[] {
  const counts = new Map<string, number>();
  const SUBJECT_RE = /^[\w-]+\(([^)]+)\)/;
  for (const c of usable) {
    const m = SUBJECT_RE.exec(c.subject);
    if (m) {
      const scope = m[1]!.trim();
      if (scope !== "") counts.set(scope, (counts.get(scope) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 30)
    .map(([scope]) => scope);
}

function pickExamples(usable: CommitInfo[]): string[] {
  const out: string[] = [];
  const seenTypes = new Set<string>();
  for (const c of usable) {
    if (out.length >= 8) break;
    const t = typeOf(c.subject) ?? "plain";
    if (!seenTypes.has(t)) {
      seenTypes.add(t);
      out.push(c.subject);
    }
  }
  if (out.length < 8) {
    for (const c of usable) {
      if (out.length >= 8) break;
      if (!out.includes(c.subject)) out.push(c.subject);
    }
  }
  return out.slice(0, 8);
}

function fallbackProfile(sampleSize: number): StyleProfile {
  return {
    sampleSize,
    conventional: true,
    typeCounts: {},
    knownScopes: [],
    language: "en",
    avgSubjectLength: 0,
    p90SubjectLength: 72,
    usesEmoji: false,
    lowercaseStart: true,
    endsWithPeriod: false,
    examples: [],
  };
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * p) - 1));
  return sorted[idx]!;
}

/**
 * Infer a repository's commit-message style from recent history.
 * Merge and revert commits are ignored. Falls back to safe defaults when
 * there are fewer than 5 usable commits.
 */
export function analyzeStyle(commits: CommitInfo[]): StyleProfile {
  const usable = commits.filter(
    (c) => !/^Merge /.test(c.subject) && !/^Revert /.test(c.subject),
  );
  const sampleSize = usable.length;
  if (sampleSize < MIN_SAMPLE) return fallbackProfile(sampleSize);

  const conventionalSubjects = usable.filter((c) => CONVENTIONAL_RE.test(c.subject));
  const conventional = conventionalSubjects.length / sampleSize >= 0.6;

  const typeCounts: Record<string, number> = {};
  for (const c of usable) {
    const t = typeOf(c.subject);
    if (t) typeCounts[t] = (typeCounts[t] ?? 0) + 1;
  }

  const lengths = usable.map((c) => c.subject.length).sort((a, b) => a - b);
  const avg = Math.round(lengths.reduce((a, b) => a + b, 0) / lengths.length);
  const p90 = percentile(lengths, 0.9);

  const stemmed = usable.map((c) => stem(c.subject)).filter((s) => s.length > 0);
  const lowerCount = stemmed.filter((s) => /^\p{Ll}/u.test(s)).length;
  const lowercaseStart = stemmed.length > 0 && lowerCount / stemmed.length >= 0.7;

  const periodCount = usable.filter((c) => /[.!?]$/.test(c.subject)).length;
  const endsWithPeriod = periodCount / sampleSize >= 0.3;

  const emojiCount = usable.filter((c) => hasEmoji(c.subject)).length;
  const usesEmoji = emojiCount / sampleSize >= 0.3;

  return {
    sampleSize,
    conventional,
    typeCounts,
    knownScopes: buildKnownScopes(usable),
    language: detectLanguage(usable.map((c) => c.subject)),
    avgSubjectLength: avg,
    p90SubjectLength: p90,
    usesEmoji,
    lowercaseStart,
    endsWithPeriod,
    examples: pickExamples(usable),
  };
}