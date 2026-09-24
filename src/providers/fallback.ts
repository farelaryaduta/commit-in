import type { ChangeSummary, CommitType, Suggestion, StyleProfile } from "../types";

const CATEGORY_LABELS: Record<string, string> = {
  controller: "controller",
  model: "model",
  migration: "migration",
  route: "route",
  view: "view",
  page: "page",
  component: "component",
  service: "service",
  config: "config",
  ci: "ci",
  deps: "dependencies",
  docs: "documentation",
  test: "tests",
  style: "styling",
  asset: "assets",
  source: "source",
  other: "files",
};

function andJoin(items: string[]): string {
  if (items.length === 0) return "";
  if (items.length === 1) return items[0]!;
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

function capitalize(s: string): string {
  return s.length === 0 ? s : s[0]!.toUpperCase() + s.slice(1);
}

/**
 * Deterministic rule-based suggestions built from classification output.
 * Used when --offline is passed or the provider fails after retries.
 */
export function fallbackSuggestions(
  summary: ChangeSummary,
  style: StyleProfile,
): Suggestion[] {
  const suggestions: Suggestion[] = [];
  const cats = new Set<string>(summary.files.map((f) => f.category));

  const isOnly = (category: string): boolean =>
    summary.files.length > 0 && [...cats].every((c) => c === category) &&
    !summary.files.some((f) => f.category === "source" || f.category === "other");

  const type = summary.typeLocked
    ? summary.typeHint
    : undefined;

  if (isOnly("docs")) {
    suggestions.push({ subject: style.conventional ? "docs: update documentation" : "update documentation" });
  }
  if (isOnly("test")) {
    const scope = style.conventional && summary.scopeHint ? `(${summary.scopeHint})` : "";
    suggestions.push({ subject: style.conventional ? `test${scope}: add tests` : "add tests" });
  }
  if (isOnly("deps")) {
    suggestions.push({ subject: style.conventional ? "chore(deps): update dependencies" : "update dependencies" });
  }
  if (isOnly("ci")) {
    suggestions.push({ subject: style.conventional ? "ci: update workflows" : "update workflows" });
  }

  const freshSources = summary.files.filter((f) => f.status === "A" && isSourceCategory(f.category));
  if (freshSources.length > 0 && suggestions.length < 2) {
    const labels = andJoin([...new Set(freshSources.map((f) => CATEGORY_LABELS[f.category] ?? f.category))]);
    const scope = style.conventional && summary.scopeHint ? `(${summary.scopeHint})` : "";
    const t: CommitType = type ?? "feat";
    suggestions.push({
      subject: style.conventional ? `${t}${scope}: add ${labels}` : `add ${labels}`,
    });
  }

  if (suggestions.length === 0) {
    const top = summary.files[0]?.path.split("/")[0];
    if (style.conventional) {
      const t: CommitType = type ?? "chore";
      suggestions.push({ subject: `${t}${top ? `: update ${top}` : ": update changes"}` });
    } else {
      suggestions.push({ subject: top ? `update ${top}` : "update changes" });
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

function isSourceCategory(category: string): boolean {
  return [
    "controller",
    "model",
    "migration",
    "route",
    "view",
    "page",
    "component",
    "service",
    "source",
  ].includes(category);
}