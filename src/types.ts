export type FileStatus = "A" | "M" | "D" | "R" | "C" | "T";

export interface StagedFile {
  path: string;
  /** Set for renames/copies */
  oldPath?: string;
  status: FileStatus;
  /** `null` for binary files */
  added: number | null;
  deleted: number | null;
  binary: boolean;
}

export type FileCategory =
  | "controller"
  | "model"
  | "migration"
  | "route"
  | "view"
  | "page"
  | "component"
  | "service"
  | "config"
  | "ci"
  | "deps"
  | "docs"
  | "test"
  | "style"
  | "asset"
  | "source"
  | "other";

export type CommitType =
  | "feat"
  | "fix"
  | "refactor"
  | "docs"
  | "test"
  | "chore"
  | "ci"
  | "style"
  | "perf"
  | "build";

export interface ClassifiedFile extends StagedFile {
  category: FileCategory;
  scopeCandidate?: string;
  ignoredForAI: boolean;
  sensitive: boolean;
}

export interface ChangeSummary {
  files: ClassifiedFile[];
  typeHint?: CommitType;
  typeLocked: boolean;
  scopeHint?: string;
  totals: { files: number; added: number; deleted: number };
}

export interface CommitInfo {
  hash: string;
  subject: string;
  body: string;
}

export interface StyleProfile {
  sampleSize: number;
  conventional: boolean;
  typeCounts: Record<string, number>;
  knownScopes: string[];
  language: "en" | "id" | "mixed";
  avgSubjectLength: number;
  p90SubjectLength: number;
  usesEmoji: boolean;
  lowercaseStart: boolean;
  endsWithPeriod: boolean;
  examples: string[];
}

export interface GenerateRequest {
  system: string;
  user: string;
  temperature?: number;
  maxTokens?: number;
  signal?: AbortSignal;
}

export interface Suggestion {
  subject: string;
  body?: string;
}