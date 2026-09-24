import type { GenerateRequest } from "../types";
import { ProviderError, sleep, type LLMProvider } from "./llm";

export const DEFAULT_TIMEOUT_MS = 30_000;
export const DEFAULT_MAX_RETRIES = 2;
const RETRY_BACKOFF_MS = [500, 1500] as const;

const RETRIABLE_STATUS = new Set([408, 429, 500, 502, 503, 504]);

export interface RemoteProviderOptions {
  /** Base URL of the commit-in service, e.g. https://ci.example.com. */
  apiUrl: string;
  /** Optional bearer token required by the service. */
  apiToken?: string;
  timeoutMs?: number;
  maxRetries?: number;
}

function isTimeoutError(err: unknown): boolean {
  if (err instanceof Error) {
    return err.name === "TimeoutError" || err.message.includes("aborted");
  }
  return false;
}

export type FetchLike = (
  url: string,
  init: RequestInit,
) => Promise<Response>;

/** Transport that asks a hosted commit-in service for suggestions. */
export class RemoteProvider implements LLMProvider {
  readonly name = "remote";

  constructor(
    private readonly opts: RemoteProviderOptions,
    private readonly fetcher: FetchLike = fetch,
  ) {}

  async generate(req: GenerateRequest): Promise<string> {
    const maxRetries = this.opts.maxRetries ?? DEFAULT_MAX_RETRIES;
    const timeoutMs = this.opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const url = `${this.opts.apiUrl.replace(/\/$/, "")}/suggest`;

    const headers: Record<string, string> = { "content-type": "application/json" };
    if (this.opts.apiToken) headers.authorization = `Bearer ${this.opts.apiToken}`;

    const body: Record<string, unknown> = {
      messages: [
        { role: "system", content: req.system },
        { role: "user", content: req.user },
      ],
      temperature: req.temperature ?? 0.7,
      max_tokens: req.maxTokens ?? 250,
    };

    let attempt = 0;
    for (;;) {
      const signals: AbortSignal[] = [AbortSignal.timeout(timeoutMs)];
      if (req.signal) signals.push(req.signal);
      const signal =
        signals.length > 1 ? AbortSignal.any(signals) : signals[0]!;

      let res: Response;
      try {
        res = await this.fetcher(url, {
          method: "POST",
          headers,
          body: JSON.stringify(body),
          signal,
        });
      } catch (err) {
        if (req.signal?.aborted) throw err;
        if (attempt < maxRetries) {
          await sleep(RETRY_BACKOFF_MS[attempt] ?? 1500);
          attempt += 1;
          continue;
        }
        throw new ProviderError(
          isTimeoutError(err)
            ? `commit-in service request timed out after ${timeoutMs}ms`
            : `commit-in service request failed: ${(err as Error).message}`,
          {
            code: isTimeoutError(err) ? "timeout" : "network",
            retriable: false,
          },
        );
      }

      if (res.status === 401 || res.status === 403) {
        throw new ProviderError(
          "commit-in service rejected the request (check COMMIT_IN_API_TOKEN)",
          { code: "auth", retriable: false, status: res.status },
        );
      }

      if (!res.ok) {
        const detail = await res.text().catch(() => "");
        if (RETRIABLE_STATUS.has(res.status) && attempt < maxRetries) {
          await sleep(RETRY_BACKOFF_MS[attempt] ?? 1500);
          attempt += 1;
          continue;
        }
        throw new ProviderError(
          `commit-in service error ${res.status}: ${detail.slice(0, 300)}`,
          { code: "http", retriable: false, status: res.status },
        );
      }

      let data: unknown;
      try {
        data = await res.json();
      } catch {
        throw new ProviderError("commit-in service returned malformed JSON", {
          code: "parse",
        });
      }
      const content = (data as any)?.text as string | undefined;
      if (typeof content !== "string" || content.trim() === "") {
        throw new ProviderError("commit-in service returned an empty completion", {
          code: "empty",
        });
      }
      return content;
    }
  }
}