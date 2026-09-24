import { execa } from "execa";

export interface CommandResult {
  ok: boolean;
  stdout: string;
  stderr: string;
  exitCode: number | undefined;
}

export interface CommandResultBuffer {
  ok: boolean;
  stdout: Buffer;
  stderr: string;
  exitCode: number | undefined;
}

const EXIT_CODE_PATTERN = /exit code? (\d+)/;

function describeFailure(
  e: unknown,
): { stderr: string; exitCode: number | undefined } {
  const err = e as {
    stderr?: Buffer | string;
    shortMessage?: string;
    message?: string;
  };
  const stderr =
    typeof err.stderr === "string"
      ? err.stderr
      : Buffer.isBuffer(err.stderr)
        ? err.stderr.toString("utf8")
        : "";
  const match = EXIT_CODE_PATTERN.exec(err.shortMessage ?? err.message ?? "");
  const exitCode = match?.[1] !== undefined ? Number(match[1]) : undefined;
  return { stderr, exitCode };
}

/** Run a git command and never throw for non-zero exit codes. */
export async function run(cwd: string, args: string[]): Promise<CommandResult> {
  try {
    const r = await execa("git", args, {
      cwd,
      reject: false,
      stripFinalNewline: false,
    });
    return {
      ok: r.exitCode === 0,
      stdout: r.stdout,
      stderr: r.stderr,
      exitCode: r.exitCode,
    };
  } catch (e) {
    const { stderr, exitCode } = describeFailure(e);
    return { ok: false, stdout: "", stderr, exitCode };
  }
}

/** Run a git command and keep raw bytes (for `-z`/NUL-terminated output). */
export async function runBuffer(
  cwd: string,
  args: string[],
): Promise<CommandResultBuffer> {
  try {
    const r = await execa("git", args, {
      cwd,
      reject: false,
      stripFinalNewline: false,
      encoding: "buffer",
    });
    return {
      ok: r.exitCode === 0,
      stdout: Buffer.from(r.stdout as Uint8Array),
      stderr: String(r.stderr),
      exitCode: r.exitCode,
    };
  } catch (e) {
    const { stderr, exitCode } = describeFailure(e);
    return {
      ok: false,
      stdout: Buffer.alloc(0),
      stderr,
      exitCode,
    };
  }
}

export class GitCommandError extends Error {
  readonly args: string[];
  readonly exitCode: number | undefined;
  readonly stderr: string;

  constructor(
    message: string,
    args: string[],
    exitCode: number | undefined,
    stderr: string,
  ) {
    super(message);
    this.name = "GitCommandError";
    this.args = args;
    this.exitCode = exitCode;
    this.stderr = stderr;
  }
}

/** Throw a `GitCommandError` unless the command succeeded. */
export function requireOk(
  cwd: string,
  args: string[],
  res: CommandResult | CommandResultBuffer,
): void {
  if (!res.ok) {
    throw new GitCommandError(
      `git ${args.join(" ")} failed${res.exitCode !== undefined ? ` (exit ${res.exitCode})` : ""}`,
      args,
      res.exitCode,
      res.stderr,
    );
  }
}