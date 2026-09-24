import { z } from "zod";

export const PROVIDER_NAMES = ["deepseek", "fake"] as const;
export const LANGUAGE_VALUES = ["auto", "en", "id"] as const;

/** Zod schema for `.commitinrc.json`. Unknown keys are tolerated. */
export const ConfigFileSchema = z
  .object({
    provider: z.enum(PROVIDER_NAMES).optional(),
    count: z.number().int().min(1).max(5).optional(),
    historyDepth: z.number().int().min(1).max(200).optional(),
    maxDiffChars: z.number().int().min(0).optional(),
    language: z.enum(LANGUAGE_VALUES).optional(),
    body: z.boolean().optional(),
    model: z.string().min(1).optional(),
    timeoutMs: z.number().int().min(1000).optional(),
    maxRetries: z.number().int().min(0).max(3).optional(),
    temperature: z.number().min(0).max(2).optional(),
    maxSubjectLength: z.number().int().min(10).max(200).optional(),
    ignore: z.array(z.string()).optional(),
    forceConventional: z.boolean().optional(),
    apiKey: z.string().min(1).optional(),
  })
  .passthrough();

export type ConfigFile = z.infer<typeof ConfigFileSchema>;

/** Fully resolved configuration used across the CLI. */
export interface ResolvedConfig {
  provider: (typeof PROVIDER_NAMES)[number];
  count: number;
  historyDepth: number;
  maxDiffChars: number;
  language: (typeof LANGUAGE_VALUES)[number];
  body: boolean;
  model?: string;
  timeoutMs: number;
  maxRetries: number;
  temperature: number;
  maxSubjectLength: number;
  ignore: string[];
  forceConventional: boolean;
  apiKey: string | undefined;
  /** True when the API key was read from the repo config file. */
  apiKeyFromFile: boolean;
}

export const DEFAULTS: ResolvedConfig = {
  provider: "deepseek",
  count: 3,
  historyDepth: 50,
  maxDiffChars: 12_000,
  language: "auto",
  body: false,
  timeoutMs: 30_000,
  maxRetries: 2,
  temperature: 0.7,
  maxSubjectLength: 72,
  ignore: [],
  forceConventional: false,
  apiKey: undefined,
  apiKeyFromFile: false,
};

/** Human-readable list of invalid config field issues. */
export function formatSchemaErrors(error: z.ZodError): string[] {
  return error.issues.map(
    (i) => `${i.path.join(".") || "(root)"}: ${i.message} (got ${JSON.stringify(i.input)})`,
  );
}