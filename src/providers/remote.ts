import type { GenerateRequest } from "../types";
import { ProviderError, sleep, type LLMProvider } from "./llm";

export const DEFAULT_TIMEOUT_MS = 30_000;
export const DEFAULT_MAX_RETRIES = 2;
const RETRY_BACKOFF_MS = [500, 1500] as const;

/** Service used when nothing is configured — swapped via COMMIT_IN_API_URL. */
export const DEFAULT_API_URL = "https://commit-in.farelminecraft450.workers.dev";

const RETRIABLE_STATUS = new Set([408, 429, 500, 502, 503, 504]);

export interface RemoteProviderOptions {
  /** Base URL of the gitcomm service, e.g. https://ci.example.com. */
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

/** Network failures worth retrying (transient) — DNS/refused errors are not. */
function isTransientNetworkError(err: unknown): boolean {
  if (err instanceof Error && (err as { cause?: unknown }).cause) {
    const code = ((err as { cause?: { code?: string } }).cause!)?.code;
    return [
      "ECONNRESET",
      "ETIMEDOUT",
      "EAI_AGAIN",
      "ENETDOWN",
      "ENETUNREACH",
      "EHOSTUNREACH",
      "EPIPE",
    ].includes(code ?? "");
  }
  return false;
}

export type FetchLike = (
  url: string,
  init: RequestInit,
) => Promise<Response>;

/** Transport that asks a hosted gitcomm service for suggestions. */
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
        if (!isTimeoutError(err) && !isTransientNetworkError(err)) {
          throw new ProviderError(
            `gitcomm service request failed: ${(err as Error).message}`,
            { code: "network", retriable: false },
          );
        }
        if (attempt < maxRetries) {
          await sleep(RETRY_BACKOFF_MS[attempt] ?? 1500);
          attempt += 1;
          continue;
        }
        throw new ProviderError(
          isTimeoutError(err)
            ? `gitcomm service request timed out after ${timeoutMs}ms`
            : `gitcomm service request failed: ${(err as Error).message}`,
          {
            code: isTimeoutError(err) ? "timeout" : "network",
            retriable: false,
          },
        );
      }

      if (res.status === 401 || res.status === 403) {
        throw new ProviderError(
          "gitcomm service rejected the request (check COMMIT_IN_API_TOKEN)",
          { code: "auth", retriable: false, status: res.status },
        );
      }

      if (!res.ok) {
        const detail = await res.text().catch(() => "");
        let waitMs: number = RETRY_BACKOFF_MS[attempt] ?? 1500;
        const retryAfter = parseFloat(res.headers.get("retry-after") ?? "");
        if (Number.isFinite(retryAfter) && retryAfter > 0) {
          waitMs = Math.min(retryAfter * 1000, 15_000);
        }
        const is429 = res.status === 429;
        const canRetry = is429
          ? attempt < Math.max(maxRetries, 3)
          : RETRIABLE_STATUS.has(res.status) && attempt < maxRetries;
        if (canRetry) {
          await sleep(waitMs);
          attempt += 1;
          continue;
        }
        throw new ProviderError(
          `gitcomm service error ${res.status}: ${detail.slice(0, 300)}`,
          { code: is429 ? "rate_limit" : "http", retriable: !is429, status: res.status },
        );
      }

      let data: unknown;
      try {
        data = await res.json();
      } catch {
        throw new ProviderError("gitcomm service returned malformed JSON", {
          code: "parse",
        });
      }
      const content = (data as any)?.text as string | undefined;
      if (typeof content !== "string" || content.trim() === "") {
        throw new ProviderError("gitcomm service returned an empty completion", {
          code: "empty",
        });
      }
      return content;
    }
  }
}