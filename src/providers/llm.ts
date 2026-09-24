import type { GenerateRequest } from "../types";

/** A model transport that turns a generation request into raw text. */
export interface LLMProvider {
  readonly name: string;
  generate(req: GenerateRequest): Promise<string>;
}

export interface ProviderErrorOptions {
  code: string;
  retriable?: boolean;
  status?: number;
}

/** Errors surfaced by providers with a stable machine-readable code. */
export class ProviderError extends Error {
  readonly code: string;
  readonly retriable: boolean;
  readonly status?: number;

  constructor(message: string, opts: ProviderErrorOptions) {
    super(message);
    this.name = "ProviderError";
    this.code = opts.code;
    this.retriable = opts.retriable ?? false;
    this.status = opts.status;
  }
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}