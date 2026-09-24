import { execa } from "execa";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export class TempRepo {
  readonly dir: string;

  private constructor(dir: string) {
    this.dir = dir;
  }

  static async init(): Promise<TempRepo> {
    const dir = mkdtempSync(join(tmpdir(), "commit-in-test-"));
    const repo = new TempRepo(dir);
    await repo.git(["init", "-q"]);
    await repo.git(["config", "user.name", "commit-in-test"]);
    await repo.git(["config", "user.email", "commit-in-test@example.com"]);
    await repo.git(["config", "commit.gpgsign", "false"]);
    return repo;
  }

  async git(args: string[]): Promise<void> {
    const res = await execa("git", args, {
      cwd: this.dir,
      reject: false,
      stripFinalNewline: false,
    });
    if (res.exitCode !== 0) {
      throw new Error(
        `git ${args.join(" ")} failed (exit ${res.exitCode}): ${res.stderr}`,
      );
    }
  }

  /** Write a file (creating parent directories) relative to the repo root. */
  writeFile(rel: string, content: string | Buffer): void {
    const abs = join(this.dir, rel);
    mkdirSync(join(abs, ".."), { recursive: true });
    writeFileSync(abs, content);
  }

  /** Stage a single path. */
  async add(path: string): Promise<void> {
    await this.git(["add", "--", path]);
  }

  /** Stage everything. */
  async addAll(): Promise<void> {
    await this.git(["add", "-A"]);
  }

  async commit(message: string): Promise<void> {
    await this.git(["commit", "-q", "-m", message]);
  }

  /** Delete the temporary repository. */
  cleanup(): void {
    rmSync(this.dir, { recursive: true, force: true });
  }
}