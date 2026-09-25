import type { ChangeSummary, ClassifiedFile, CommitType, FileCategory, Suggestion, StyleProfile } from "../types";

/** Suffixes stripped from type-ish file names, longest first. */
const CLASS_SUFFIXES = [
  "Controller",
  "Component",
  "Handler",
  "Service",
  "Request",
  "Response",
  "Resource",
  "Factory",
  "Seeder",
  "Provider",
  "Middleware",
  "Repository",
  "Migration",
  "ViewModel",
  "View",
  "Feature",
  "Spec",
  "Test",
];

const SOURCE_CATEGORIES: FileCategory[] = [
  "controller",
  "component",
  "page",
  "view",
  "service",
  "model",
  "migration",
  "route",
  "source",
];

const CATEGORY_LABEL: Partial<Record<FileCategory, string>> = {
  controller: "controller",
  component: "component",
  page: "page",
  view: "view",
  service: "service",
  model: "model",
  migration: "migration",
  route: "route",
};

function andJoin(items: string[]): string {
  if (items.length === 0) return "";
  if (items.length === 1) return items[0]!;
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

function stemOf(path: string): string {
  const base = path.split("/").pop() ?? "";
  return base.replace(/\.[^/.]+$/, "").replace(/\./g, " ").trim();
}

function stripSuffixes(name: string): string {
  for (const suffix of CLASS_SUFFIXES) {
    if (name.toLowerCase().endsWith(suffix.toLowerCase()) && name.length > suffix.length) {
      return name.slice(0, -suffix.length);
    }
  }
  return name;
}

/** A noun worth putting in a subject (length >= 2, alphabetic). */
function niceNoun(raw: string | undefined): string | undefined {
  if (raw === undefined) return undefined;
  const clean = raw.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  if (clean.length < 2 || !/[a-z]/i.test(clean)) return undefined;
  return clean;
}

/** Most frequent stripped stem across files, or undefined. */
function nounFromFiles(files: ClassifiedFile[]): string | undefined {
  const counts = new Map<string, number>();
  for (const f of files) {
    const noun = niceNoun(stripSuffixes(stemOf(f.path)));
    if (noun === undefined) continue;
    counts.set(noun, (counts.get(noun) ?? 0) + 1);
  }
  let best: string | undefined;
  let bestCount = 0;
  let tie = false;
  for (const [noun, count] of counts) {
    if (count > bestCount) {
      best = noun;
      bestCount = count;
      tie = false;
    } else if (count === bestCount) {
      tie = true;
    }
  }
  return tie ? undefined : best;
}

/** Categories of the most relevant files, most important first. */
function coreCategories(files: ClassifiedFile[]): FileCategory[] {
  const present = new Set(files.map((f) => f.category));
  return SOURCE_CATEGORIES.filter((c) => present.has(c));
}

/**
 * Build a subject object like "task controller", "orders migration",
 * "task controller and task model", "old", or "source files". Returns
 * undefined when there is nothing meaningful to say about the change.
 */
function objectPhrase(summary: ChangeSummary): string | undefined {
  const scope = niceNoun(summary.scopeHint);
  const labels = coreCategories(summary.files)
    .map((c) => CATEGORY_LABEL[c])
    .filter((l): l is string => l !== undefined);

  if (scope !== undefined && labels.length > 0) {
    return [
      `${scope} ${labels[0]!}`,
      ...labels.slice(1).map((l) => `${scope} ${l}`),
    ]
      .slice(0, 2)
      .reduce((acc, part, i) => (i === 0 ? part : `${acc} and ${part}`), "");
  }

  const noun = nounFromFiles(summary.files);
  if (noun !== undefined) return noun;

  if (labels.length > 0) {
    return labels.length > 1 ? andJoin(labels) : labels[0]!;
  }

  const hasSource = summary.files.some(
    (f) => f.category === "source" || SOURCE_CATEGORIES.includes(f.category),
  );
  if (hasSource && summary.files.length > 1) {
    return "source files";
  }
  return undefined;
}

function inferType(summary: ChangeSummary):
  | { type: CommitType; verb: string; remove?: boolean }
  | undefined {
  if (summary.typeLocked && summary.typeHint !== undefined) {
    return { type: summary.typeHint, verb: "update" };
  }

  const hasNewSource = summary.files.some(
    (f) => f.status === "A" && (f.category === "source" || SOURCE_CATEGORIES.includes(f.category)),
  );
  const hasRemoval = summary.files.some((f) => f.status === "D");

  if (hasRemoval && !hasNewSource) {
    return { type: "chore", verb: "remove", remove: true };
  }
  if (hasNewSource) {
    return { type: "feat", verb: "add" };
  }
  return undefined;
}

/**
 * Deterministic rule-based suggestions built from classification output.
 * Used when --offline is passed or the provider is unavailable/rate limited.
 */
export function fallbackSuggestions(
  summary: ChangeSummary,
  style: StyleProfile,
): Suggestion[] {
  const suggestions: Suggestion[] = [];
  const prefix = (type: CommitType, scope?: string): string =>
    style.conventional
      ? `${type}${scope !== undefined ? `(${scope})` : ""}: `
      : "";

  const only = (categories: FileCategory[]): boolean =>
    summary.files.length > 0 &&
    summary.files.every((f) => categories.includes(f.category));

  if (only(["docs"])) {
    const noun = niceNoun(nounFromFiles(summary.files)) ?? "documentation";
    suggestions.push({ subject: `${prefix("docs")}update ${noun}` });
  }
  if (only(["test"])) {
    const noun = nounFromFiles(summary.files);
    const scope = niceNoun(summary.scopeHint);
    const phrase = noun !== undefined ? `add ${noun} tests` : "add tests";
    suggestions.push({ subject: `${prefix("test", scope)}${phrase}` });
  }
  if (only(["deps"])) {
    suggestions.push({
      subject: style.conventional ? "chore(deps): update dependencies" : "update dependencies",
    });
  }
  if (only(["ci"])) {
    suggestions.push({
      subject: style.conventional ? "ci: update workflows" : "update workflows",
    });
  }

  if (suggestions.length === 0) {
    const intent = inferType(summary);
    const scope = niceNoun(summary.scopeHint);
    const phrases: string[] = [];

    const phrase = objectPhrase(summary);
    if (intent?.remove) {
      if (phrase !== undefined) phrases.push(`${intent.verb} ${phrase}`);
    } else if (phrase !== undefined) {
      phrases.push(`${intent?.verb ?? "update"} ${phrase}`);
    }

    if (phrases.length === 0) {
      const top = summary.files[0]?.path.split("/")[0];
      phrases.push(`update ${top ?? "changes"}`);
    }

    const type: CommitType = intent?.type ?? "chore";
    const object = phrases[0]?.split(" ").slice(1).join(" ") ?? "";
    const prefixScope =
      scope !== undefined && scope !== object && object !== ""
        ? scope
        : undefined;
    for (const phrase of phrases) {
      suggestions.push({ subject: `${prefix(type, prefixScope)}${phrase}` });
    }
  }

  return suggestions
    .filter((s, i, arr) => arr.findIndex((x) => x.subject === s.subject) === i)
    .map((s) => ({
      subject:
        style.conventional || style.lowercaseStart
          ? s.subject
          : capitalize(s.subject),
    }));
}

function capitalize(s: string): string {
  return s.length === 0 ? s : s[0]!.toUpperCase() + s.slice(1);
}