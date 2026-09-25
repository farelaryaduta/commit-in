import type { Suggestion, StyleProfile } from "../types";

export const NO_SUGGESTIONS = "NO_SUGGESTIONS";

const BULLET_RE = /^\s*(?:[-*]|\d+[.)])\s+(.+)$/;

/** Strip accidental markdown decorations someone might wrap a subject in. */
function cleanSubject(s: string): string {
  return s
    .replace(/^(?:\*\*|__|[`*_])+/, "")
    .replace(/(?:\*\*|__|[`*_])+$/, "")
    .trim();
}

function isUsable(s: Suggestion): boolean {
  return typeof s.subject === "string" && s.subject.trim() !== "";
}

function dedupe(list: Suggestion[]): Suggestion[] {
  const seen = new Set<string>();
  return list.filter((s) => {
    const key = s.subject.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** Ensure each subject matches the repo's Conventional Commits style. */
function enforceConventional(
  list: Suggestion[],
  style: StyleProfile,
  typeHint: string | undefined,
): Suggestion[] {
  const CONVENTIONAL_RE = /^[\w-]+(?:\([^)]+\))?!?: .+/;
  const fallbackType = typeHint ?? Object.entries(style.typeCounts).sort((a, b) => b[1] - a[1])[0]?.[0];
  if (!fallbackType) return list;
  return list.map((s) => {
    if (CONVENTIONAL_RE.test(s.subject)) return s;
    const fixed = `${fallbackType}: ${s.subject.replace(/^:/, "").trim()}`;
    return { ...s, subject: fixed };
  });
}

/**
 * Parse raw model output into suggestions. Handles markdown-fenced JSON
 * arrays, bare JSON arrays, bullet/numbered lists (with indented bodies),
 * and a bare single line. Returns up to `max` suggestions.
 */
export function parseSuggestions(
  raw: string,
  style?: StyleProfile,
  typeHint?: string,
  max = 5,
): Suggestion[] {
  if (!raw || raw.trim() === "") return [];
  if (raw.includes(NO_SUGGESTIONS)) return [];

  let text = raw.trim();
  const fence = /^```(?:json)?\s*[\r\n]*([\s\S]*?)\s*```$/.exec(text);
  if (fence) text = fence[1]!.trim();

  if (text.startsWith("[")) {
    try {
      const arr = JSON.parse(text) as unknown;
      if (Array.isArray(arr)) {
        const parsed = arr
          .filter((x): x is { subject?: unknown; body?: unknown } => typeof x === "object" && x !== null)
          .map((x) => ({
            subject: cleanSubject(String(x.subject ?? "")),
            body: typeof x.body === "string" ? x.body.trim() : undefined,
          }))
          .filter(isUsable);
        if (parsed.length > 0) {
          let out = dedupe(parsed).slice(0, max);
          if (style?.conventional) out = enforceConventional(out, style, typeHint);
          return out;
        }
      }
    } catch {
      // fall through to list parsing
    }
  }

  const out: Suggestion[] = [];
  let current: Suggestion | null = null;
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(/\s+$/, "");
    const m = BULLET_RE.exec(line);
    if (m) {
      current = { subject: cleanSubject(m[1]!) };
      out.push(current);
    } else if (current && /^\s+[\S]/.test(line)) {
      const body = line.trim();
      current.body = current.body ? `${current.body}\n${body}` : body;
    } else if (current && line.trim() !== "" && !/^```/.test(line.trim())) {
      const body = line.trim();
      current.body = current.body ? `${current.body}\n${body}` : body;
    }
  }

  if (out.length > 0) {
    let list = dedupe(out).slice(0, max);
    if (style?.conventional) list = enforceConventional(list, style, typeHint);
    return list;
  }

  const single = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)[0];
  if (single) {
    let list = [{ subject: cleanSubject(single) }];
    if (style?.conventional) list = enforceConventional(list, style, typeHint);
    return list;
  }
  return [];
}