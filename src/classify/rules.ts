import type { CommitType, FileCategory } from "../types";

export interface Rule {
  match: RegExp;
  category: FileCategory;
  typeHint?: CommitType;
}

export interface MatchResult {
  category: FileCategory;
  typeHint?: CommitType;
}

/** Source code file extensions used as a generic fallback. */
const SOURCE_RE =
  /\.(js|mjs|cjs|jsx|ts|mts|cts|tsx|vue|svelte|php|py|rb|go|rs|java|kt|swift|c|cpp|cc|h|hpp|cs|scala|ex|exs|erl|hs|sql|sh|zsh)$/;

export function isSourceFile(path: string): boolean {
  return SOURCE_RE.test(path);
}

/** Ordered generic rules; the first match wins. */
export const genericRules: Rule[] = [
  { match: /\.(md|mdx|rst|txt)$/i, category: "docs", typeHint: "docs" },
  { match: /^docs\//i, category: "docs", typeHint: "docs" },
  {
    match: /\.(test|spec)\.[jt]sx?$/i,
    category: "test",
    typeHint: "test",
  },
  { match: /^tests?\/|(^|\/)__tests__\//, category: "test", typeHint: "test" },
  {
    match: /(?:^|\/)(package\.json|composer\.json|requirements\.txt|pyproject\.toml|go\.mod)$/,
    category: "deps",
    typeHint: "chore",
  },
  {
    match: /(?:^|\/)(package-lock\.json|yarn\.lock|pnpm-lock\.yaml|composer\.lock|poetry\.lock|uv\.lock|Pipfile\.lock|Cargo\.lock)$/,
    category: "deps",
    typeHint: "chore",
  },
  { match: /^\.github\/workflows\//, category: "ci", typeHint: "ci" },
  { match: /\.gitlab-ci\.ya?ml$/, category: "ci", typeHint: "ci" },
  { match: /^\.circleci\//, category: "ci", typeHint: "ci" },
  { match: /(?:^|\/)Dockerfile(?:\.\w+)?$/, category: "config", typeHint: "build" },
  {
    match: /docker-compose.*\.ya?ml$/,
    category: "config",
    typeHint: "build",
  },
  { match: /\.(css|scss|sass|less)$/i, category: "style" },
  {
    match: /\.(png|jpe?g|gif|svg|webp|avif|ico|bmp|mp4|webm|mkv|mov|mp3|wav|ogg|flac|woff2?|ttf|otf|eot|pdf)$/i,
    category: "asset",
  },
  { match: /\.map$/, category: "asset" },
  {
    match:
      /(?:^|\/)(jest|vitest|vite|eslint|babel|rollup|webpack|postcss|tailwind|prettier|stylelint|husky)\.config\.(js|mjs|cjs|ts|json|ya?ml)$/i,
    category: "config",
    typeHint: "chore",
  },
  { match: /\.config\.(js|mjs|cjs|ts|json|ya?ml)$/i, category: "config", typeHint: "chore" },
  { match: /(?:^|\/)(tsconfig|jsconfig)[^/]*\.json$/, category: "config", typeHint: "chore" },
  {
    match: /\.(eslintrc|babelrc|prettierrc)(\.(json|ya?ml|js))?$/,
    category: "config",
    typeHint: "chore",
  },
];

function applyRules(path: string, rules: Rule[]): MatchResult | null {
  for (const rule of rules) {
    if (rule.match.test(path)) {
      const result: MatchResult = { category: rule.category };
      if (rule.typeHint !== undefined) {
        result.typeHint = rule.typeHint;
      }
      return result;
    }
  }
  return null;
}

/** Match a path against the generic rules. */
export function matchGeneric(path: string): MatchResult | null {
  return applyRules(path, genericRules);
}

/** Match a path against a preset's rules, if any. */
export function matchPreset(
  path: string,
  rules: Rule[],
): MatchResult | null {
  return applyRules(path, rules);
}

/** Final fallback for paths no rule matched. */
export function fallbackCategory(path: string): FileCategory {
  return isSourceFile(path) ? "source" : "other";
}