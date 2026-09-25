import type { FileCategory } from "../types";

/** Suffixes stripped from class-like names, longest first. */
const CLASS_SUFFIXES = [
  "Controller",
  "Service",
  "Request",
  "Resource",
  "Factory",
  "Seeder",
  "Test",
];

/** Top-level "source roots": scope is derived from the directory below one. */
const SOURCE_ROOTS = new Set([
  "app",
  "src",
  "lib",
  "utils",
  "services",
  "routes",
  "components",
  "views",
  "resources",
  "database",
  "config",
  "prisma",
  "tests",
]);

function isGroupOrDynamic(segment: string): boolean {
  return /^\(.+\)$/.test(segment) || /^\[.+\]$/.test(segment);
}

function toScope(name: string): string {
  return name.toLowerCase();
}

/** Last non-group, non-dynamic directory segment of a path. */
function lastDirectory(parts: string[]): string | undefined {
  for (let i = parts.length - 1; i >= 0; i -= 1) {
    const seg = parts[i]!;
    if (isGroupOrDynamic(seg)) continue;
    return seg;
  }
  return undefined;
}

/**
 * Infer a scope candidate for a single staged file path.
 * Returns `undefined` when no meaningful candidate exists.
 */
export function inferScopeFromPath(
  path: string,
  category: FileCategory,
): string | undefined {
  const parts = path.split("/");

  const stem = (parts[parts.length - 1] ?? "").replace(/\.[^/.]+$/, "");

  if (category === "migration") {
    const m = /_(\w+)_table\.php$/.exec(path);
    if (m) {
      const name = m[1]!.split("_").filter(Boolean).pop() ?? "";
      return toScope(name);
    }
  }

  for (const suffix of CLASS_SUFFIXES) {
    if (stem !== "" && stem.endsWith(suffix) && stem.length > suffix.length) {
      return toScope(stem.slice(0, -suffix.length));
    }
  }

  if (category === "page") {
    // Drop the leading "app" segment and the file itself; route groups and
    // dynamic segments (segments in parens/brackets) are not scopes.
    const dir = lastDirectory(parts.slice(1, -1));
    return dir !== undefined ? toScope(dir) : undefined;
  }

  const NO_SCOPE: Set<FileCategory> = new Set([
    "docs",
    "deps",
    "asset",
    "style",
    "ci",
    "config",
  ]);
  if (NO_SCOPE.has(category)) {
    return undefined;
  }

  if (/^app\/Models\//.test(path) && stem !== "") {
    return toScope(stem);
  }

  const first = parts[0];
  if (first !== undefined && SOURCE_ROOTS.has(first)) {
    if (parts.length >= 3) {
      const below = lastDirectory(parts.slice(1, -1));
      if (below !== undefined) return toScope(below);
    }
    return undefined;
  }
  if (first !== undefined && !isGroupOrDynamic(first) && parts.length >= 2) {
    return toScope(first);
  }
  return undefined;
}

/** Pick the most frequent candidate, or `undefined` on a tie. */
export function pickScope(
  candidates: Array<string | undefined>,
): string | undefined {
  const counts = new Map<string, number>();
  let best: string | undefined;
  let bestCount = 0;
  let tie = false;
  for (const cand of candidates) {
    if (cand === undefined) continue;
    const count = (counts.get(cand) ?? 0) + 1;
    counts.set(cand, count);
    if (count > bestCount) {
      best = cand;
      bestCount = count;
      tie = false;
    } else if (count === bestCount && cand !== best) {
      tie = true;
    }
  }
  if (tie) {
    const tied = [...counts.entries()].filter(([, c]) => c === bestCount);
    const byLength = [...tied.map(([v]) => v)].sort((a, b) => a.length - b.length);
    const shortest = byLength[0];
    const narrower = byLength.slice(1);
    // A tie where one candidate is a prefix of all others ("cart" vs
    // "cartItem") has a broader scope — prefer the shorter one.
    if (
      shortest !== undefined &&
      narrower.every((v) => v.startsWith(shortest!))
    ) {
      return shortest;
    }
    return undefined;
  }
  return best;
}

/** Prefer a known scope spelling that matches or contains the candidate. */
export function reconcileWithKnownScopes(
  candidate: string | undefined,
  knownScopes: string[],
): string | undefined {
  if (candidate === undefined) return undefined;
  const lower = candidate.toLowerCase();
  for (const known of knownScopes) {
    const kLower = known.toLowerCase();
    if (kLower === lower || kLower.includes(lower)) {
      return known;
    }
  }
  return candidate;
}