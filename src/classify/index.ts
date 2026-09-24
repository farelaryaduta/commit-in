import { existsSync } from "node:fs";
import { join } from "node:path";
import type {
  ChangeSummary,
  ClassifiedFile,
  CommitType,
  StagedFile,
} from "../types";
import {
  fallbackCategory,
  matchGeneric,
  matchPreset,
  type MatchResult,
} from "./rules";
import type { Rule } from "./rules";
import { laravelRules } from "./presets/laravel";
import { nextjsRules } from "./presets/nextjs";
import {
  inferScopeFromPath,
  pickScope,
  reconcileWithKnownScopes,
} from "./scope";

export type ActivePreset = "laravel" | "nextjs";

export interface ClassifyOptions {
  /** Force presets; defaults to auto-detection via marker files. */
  presets?: ActivePreset[];
  /** Whether a file's diff content must never reach the model. */
  isIgnoredForAI?: (file: StagedFile) => boolean;
  /** Commit scopes seen in the repo history, to prefer their spelling. */
  knownScopes?: string[];
}

const PRESET_RULES: Record<ActivePreset, Rule[]> = {
  laravel: laravelRules,
  nextjs: nextjsRules,
};

/** Detect active presets from marker files at the repo root. */
export async function detectPresets(repoRoot: string): Promise<ActivePreset[]> {
  const found: ActivePreset[] = [];
  if (existsSync(join(repoRoot, "artisan"))) {
    found.push("laravel");
  }
  if (
    ["next.config.js", "next.config.mjs", "next.config.ts"].some((f) =>
      existsSync(join(repoRoot, f)),
    )
  ) {
    found.push("nextjs");
  }
  return found;
}

function defaultIgnoredForAI(file: StagedFile): boolean {
  return file.binary;
}

function classifyPath(path: string, rules: Rule[]): MatchResult | null {
  const preset = matchPreset(path, rules);
  if (preset !== null) return preset;
  return matchGeneric(path);
}

function totalStats(
  files: ClassifiedFile[],
): { files: number; added: number; deleted: number } {
  let added = 0;
  let deleted = 0;
  for (const f of files) {
    added += f.added ?? 0;
    deleted += f.deleted ?? 0;
  }
  return { files: files.length, added, deleted };
}

function inferTypeAndScope(
  files: ClassifiedFile[],
  ignoredForAI: (file: StagedFile) => boolean,
  knownScopes: string[],
): { typeHint?: CommitType; typeLocked: boolean; scopeHint?: string } {
  const relevant = files.filter((f) => !ignoredForAI(f));
  if (relevant.length === 0) {
    return { typeLocked: false };
  }

  const allAre = (category: string): boolean =>
    relevant.every((f) => f.category === category);

  if (allAre("docs")) {
    return { typeHint: "docs", typeLocked: true };
  }
  if (allAre("test")) {
    return { typeHint: "test", typeLocked: true };
  }
  if (allAre("deps")) {
    return { typeHint: "chore", typeLocked: true, scopeHint: "deps" };
  }
  if (allAre("ci")) {
    return { typeHint: "ci", typeLocked: true };
  }
  if (allAre("config")) {
    return { typeHint: "chore", typeLocked: false };
  }

  const candidates = relevant.map((f) => f.scopeCandidate);
  const scopeHint = reconcileWithKnownScopes(
    pickScope(candidates),
    knownScopes,
  );

  const sourceCategories = new Set([
    "controller",
    "model",
    "migration",
    "route",
    "view",
    "page",
    "component",
    "service",
  ]);
  const hasSource = relevant.some((f) => sourceCategories.has(f.category));
  const addedRatio =
    relevant.filter((f) => f.status === "A").length / relevant.length;
  if (hasSource && addedRatio >= 0.5) {
    return { typeHint: "feat", typeLocked: false, scopeHint };
  }

  return { typeLocked: false, scopeHint };
}

/**
 * Classify staged files and produce a `ChangeSummary` with type/scope hints.
 */
export async function classifyFiles(
  files: StagedFile[],
  repoRoot: string,
  options: ClassifyOptions = {},
): Promise<ChangeSummary> {
  const active = options.presets ?? (await detectPresets(repoRoot));
  const rules: Rule[] = [];
  for (const preset of active) {
    rules.push(...PRESET_RULES[preset]);
  }

  const knownScopes = options.knownScopes ?? [];
  const ignoredForAI =
    options.isIgnoredForAI ?? defaultIgnoredForAI;

  const classified: ClassifiedFile[] = files.map((f) => {
    const kept = { ...f };
    const match = classifyPath(f.path, rules);
    const category = match?.category ?? fallbackCategory(f.path);
    const result: ClassifiedFile = {
      ...kept,
      category,
      ignoredForAI: ignoredForAI(f),
      sensitive: false,
    };
    const scopeCandidate = inferScopeFromPath(f.path, category);
    if (scopeCandidate !== undefined) {
      result.scopeCandidate = scopeCandidate;
    }
    return result;
  });

  const { typeHint, typeLocked, scopeHint } = inferTypeAndScope(
    classified,
    ignoredForAI,
    knownScopes,
  );

  const summary: ChangeSummary = {
    files: classified,
    typeLocked,
    totals: totalStats(classified),
  };
  if (typeHint !== undefined) summary.typeHint = typeHint;
  if (scopeHint !== undefined) summary.scopeHint = scopeHint;
  return summary;
}