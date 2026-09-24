import type { GenerateRequest } from "../types";
import { ProviderError, sleep, type LLMProvider } from "./llm";

export const DEEPSEEK_BASE_URL = "https://api.deepseek.com";
export const DEEPSEEK_CHAT_COMPLETIONS = "/chat/completions";
export const DEEPSEEK_MODEL = "deepseek-v4-flash";
export const DEFAULT_TIMEOUT_MS = 30_000;
export const DEFAULT_MAX_RETRIES = 2;
const RETRY_BACKOFF_MS = [500, 1500] as const;

const RETRIABLE_STATUS = new Set([408, 429, 500, 502, 503, 504]);

export interface DeepSeekOptions {
  baseUrl?: string;
  model?: string;
  timeoutMs?: number;
  maxRetries?: number;
  /** DeepSeek v4 defaults to enabled thinking; disable for speed/cost. */
  thinkingDisabled?: boolean;
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

/** DeepSeek Chat Completions transport via the global fetch API. */
export class DeepSeekProvider implements LLMProvider {
  readonly name = "deepseek";

  constructor(
    private readonly apiKey: string,
    private readonly fetcher: FetchLike = fetch,
    private readonly opts: DeepSeekOptions = {},
  ) {}

  private get baseUrl(): string {
    return (this.opts.baseUrl ?? DEEPSEEK_BASE_URL).replace(/\/$/, "");
  }

  async generate(req: GenerateRequest): Promise<string> {
    const model = this.opts.model ?? DEEPSEEK_MODEL;
    const maxRetries = this.opts.maxRetries ?? DEFAULT_MAX_RETRIES;
    const timeoutMs = this.opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const url = this.baseUrl + DEEPSEEK_CHAT_COMPLETIONS;

    const body: Record<string, unknown> = {
      model,
      messages: [
        { role: "system", content: req.system },
        { role: "user", content: req.user },
      ],
      temperature: req.temperature ?? 0.7,
      max_tokens: req.maxTokens ?? 250,
    };
    if (this.opts.thinkingDisabled !== false) {
      body.thinking = { type: "disabled" };
    }

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
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${this.apiKey}`,
          },
          body: JSON.stringify(body),
          signal,
        });
      } catch (err) {
        if (req.signal?.aborted) throw err;
        if (isTimeoutError(err) && attempt < maxRetries) {
          await sleep(RETRY_BACKOFF_MS[attempt] ?? 1500);
          attempt += 1;
          continue;
        }
        if (attempt < maxRetries && !isTimeoutError(err)) {
          await sleep(RETRY_BACKOFF_MS[attempt] ?? 1500);
          attempt += 1;
          continue;
        }
        throw new ProviderError(
          isTimeoutError(err)
            ? `DeepSeek request timed out after ${timeoutMs}ms`
            : `DeepSeek request failed: ${(err as Error).message}`,
          {
            code: isTimeoutError(err) ? "timeout" : "network",
            retriable: false,
          },
        );
      }

      if (res.status === 401 || res.status === 403) {
        throw new ProviderError(
          "DeepSeek rejected the API key (check DEEPSEEK_API_KEY)",
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
          `DeepSeek API error ${res.status}: ${detail.slice(0, 300)}`,
          { code: "http", retriable: false, status: res.status },
        );
      }

      let data: unknown;
      try {
        data = await res.json();
      } catch {
        throw new ProviderError("DeepSeek returned malformed JSON", {
          code: "parse",
        });
      }
      const content = (data as any)?.choices?.[0]?.message?.content as
        | string
        | undefined;
      if (typeof content !== "string" || content.trim() === "") {
        throw new ProviderError("DeepSeek returned an empty completion", {
          code: "empty",
        });
      }
      return content;
    }
  }
}