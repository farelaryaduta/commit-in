import type { ClassifiedFile, StyleProfile } from "../types";

/** Small color abstraction so panel rendering stays deterministic in tests. */
export interface Colors {
  bold(s: string): string;
  dim(s: string): string;
  red(s: string): string;
  green(s: string): string;
  yellow(s: string): string;
  cyan(s: string): string;
}

export const identityColors: Colors = {
  bold: (s) => s,
  dim: (s) => s,
  red: (s) => s,
  green: (s) => s,
  yellow: (s) => s,
  cyan: (s) => s,
};

export interface WorkingSummary {
  staged: number;
  unstaged: number;
  untracked: number;
}

export interface StatusView {
  root: string;
  branch: string | null;
  files: ClassifiedFile[];
  working: WorkingSummary;
  typeHint?: string;
  typeLocked: boolean;
  scopeHint?: string;
  style: Pick<StyleProfile, "conventional" | "language" | "p90SubjectLength">;
}

/**
 * Build the status dashboard lines shown right after the welcome header.
 * Pure and deterministic (identify colors yield plain text).
 */
export function statusPanel(
  view: StatusView,
  c: Colors = identityColors,
): string[] {
  const lines: string[] = [];
  lines.push(c.dim(`repository: ${view.root}`));
  lines.push(
    `branch: ${view.branch === null ? c.yellow("(detached HEAD)") : c.bold(view.branch)}`,
  );

  const files = view.files;
  if (files.length === 0) {
    lines.push(c.dim("no staged files"));
  } else {
    let added = 0;
    let deleted = 0;
    for (const f of files) {
      added += f.added ?? 0;
      deleted += f.deleted ?? 0;
    }
    const totals = `${c.dim(`(+${added} -${deleted})`)}`;
    lines.push(`${c.bold(`${files.length} staged file(s)`)} ${totals}`);

    // Align rows so the diff counts form clean columns; cap long lists.
    const CAP = 12;
    const shown = files.slice(0, CAP);
    const rest = files.slice(CAP);
    const displayPath = (f: ClassifiedFile): string =>
      f.oldPath ? `${f.oldPath} -> ${f.path}` : f.path;
    const numText = (f: ClassifiedFile): string =>
      f.binary ? "binary" : `+${f.added ?? 0} -${f.deleted ?? 0}`;
    const maxPath = Math.max(...shown.map((f) => displayPath(f).length));
    const maxCat = Math.max(...shown.map((f) => f.category.length)) + 1;
    const maxNum = Math.max(...shown.map((f) => numText(f).length));

    const groupOrder: ClassifiedFile["category"][] = [];
    for (const f of shown) {
      if (!groupOrder.includes(f.category)) groupOrder.push(f.category);
    }

    for (const cat of groupOrder) {
      lines.push(c.dim(cat));
      for (const f of shown.filter((x) => x.category === cat)) {
        const status =
          f.status === "A"
            ? c.green("A")
            : f.status === "D"
              ? c.red("D")
              : f.status === "R" || f.status === "C"
                ? c.cyan(f.status)
                : c.yellow(f.status);
        const path =
          f.sensitive
            ? c.red(displayPath(f))
            : displayPath(f);
        const flag = f.sensitive
          ? c.bold(c.red("sensitive"))
          : f.ignoredForAI
            ? c.dim("ignored for AI")
            : "";
        const catCol = c.dim(f.category.padEnd(maxCat, " ").slice(0, 12));
        const numCol = c.dim(numText(f).padStart(maxNum, " "));
        lines.push(
          `  ${status}  ${path.padEnd(maxPath)} ${catCol} ${numCol}${flag ? `  ${flag}` : ""}`,
        );
      }
    }

    if (rest.length > 0) {
      let rAdded = 0;
      let rDeleted = 0;
      for (const f of rest) {
        rAdded += f.added ?? 0;
        rDeleted += f.deleted ?? 0;
      }
      lines.push(
        c.dim(`… and ${rest.length} more file(s) (+${rAdded} -${rDeleted})`),
      );
    }
  }

  const w = view.working;
  const work: string[] = [];
  if (w.staged > 0) work.push(`${w.staged} staged`);
  if (w.unstaged > 0) work.push(`${w.unstaged} modified (not staged)`);
  if (w.untracked > 0) work.push(`${w.untracked} untracked`);
  if (work.length > 0) lines.push(`working tree: ${work.join(", ")}`);

  const hints: string[] = [];
  if (view.typeHint) {
    hints.push(
      `type=${view.typeHint}${view.typeLocked ? c.dim(" (locked)") : ""}`,
    );
  }
  if (view.scopeHint) hints.push(`scope=${view.scopeHint}`);
  if (hints.length > 0) lines.push(`hints: ${hints.join(", ")}`);

  lines.push(
    `style: ${view.style.conventional ? "conventional commits" : "plain"}, ` +
      `${view.style.language === "mixed" ? "mixed language" : view.style.language}, ` +
      `subject <= ${view.style.p90SubjectLength} chars`,
  );
  return lines;
}