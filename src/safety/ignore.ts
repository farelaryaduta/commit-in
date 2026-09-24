/** Default paths never sent to the model (as path patterns). */
export const DEFAULT_IGNORE_PATTERNS: RegExp[] = [
  /(?:^|\/)(package-lock\.json|yarn\.lock|pnpm-lock\.yaml|composer\.lock|poetry\.lock|uv\.lock|Cargo\.lock|Pipfile\.lock)$/,
  /\.min\.(js|css)$/,
  /\.map$/,
  /(?:^|\/)dist\//,
  /(?:^|\/)build\//,
  /(?:^|\/)\.next\//,
  /(?:^|\/)public\/build\//,
  /(?:^|\/)vendor\//,
  /(?:^|\/)node_modules\//,
  /(?:^|\/)\.git\//,
];

/** Escape regex special characters. */
function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Convert a glob pattern to a RegExp. Supports `**` (any path segments),
 * `*` (within a segment), and `?`. Backslashes are normalized.
 */
export function globToRegExp(pattern: string): RegExp {
  const src = pattern.replace(/\\/g, "/");
  let re = "^";
  for (let i = 0; i < src.length; i += 1) {
    const c = src[i]!;
    if (c === "*") {
      if (src[i + 1] === "*") {
        re += ".*";
        i += 1;
        if (src[i + 1] === "/") {
          re += "\\/";
          i += 1;
        }
      } else {
        re += "[^/]*";
      }
    } else if (c === "?") {
      re += "[^/]";
    } else {
      re += escapeRegex(c);
    }
  }
  re += "$";
  return new RegExp(re);
}

/**
 * Whether `path` matches a user config glob. A pattern ending in `/` matches
 * a directory prefix; a pattern without `/` is also matched against the
 * basename.
 */
export function globMatches(pattern: string, path: string): boolean {
  const normalized = path.replace(/\\/g, "/");
  const dirPrefix = pattern.endsWith("/") || pattern.endsWith("\\");
  const p = pattern.replace(/\\/g, "/").replace(/\/$/, "");

  const re = globToRegExp(p);
  if (re.test(normalized)) return true;
  if (dirPrefix && normalized.startsWith(p + "/")) return true;
  if (!p.includes("/")) {
    const base = normalized.split("/").pop() ?? "";
    if (re.test(base)) return true;
  }
  return false;
}

/** Whether a file's diff content must be kept away from the provider. */
export function isIgnoredForAI(
  path: string,
  binary: boolean,
  extraGlobs: string[] = [],
): boolean {
  if (binary) return true;
  if (DEFAULT_IGNORE_PATTERNS.some((re) => re.test(path))) return true;
  return extraGlobs.some((g) => globMatches(g, path));
}