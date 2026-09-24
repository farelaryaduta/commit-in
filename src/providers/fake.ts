import type { GenerateRequest } from "../types";
import type { LLMProvider } from "./llm";

const DEFAULT_SUGGESTIONS = [
  "feat: implement the staged change",
  "fix: resolve an issue in the staged files",
];

/** Canned provider for offline runs, tests, and demos. */
export class FakeProvider implements LLMProvider {
  readonly name = "fake";

  constructor(private readonly suggestions: string[] = DEFAULT_SUGGESTIONS) {}

  async generate(_req: GenerateRequest): Promise<string> {
    return this.suggestions.join("\n");
  }

  /** Build a fake provider from COMMIT_IN_FAKE_SUGGESTIONS (one per line). */
  static fromEnv(): FakeProvider {
    const raw = process.env.COMMIT_IN_FAKE_SUGGESTIONS;
    if (!raw) return new FakeProvider();
    const lines = raw
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);
    return new FakeProvider(lines);
  }
}