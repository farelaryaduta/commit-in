import { z } from "zod";

export const LANGUAGE_VALUES = ["auto", "en", "id"] as const;

/** Zod schema for `.gitcommrc.json`. Unknown keys are tolerated. */
export const ConfigFileSchema = z
  .object({
    apiUrl: z
      .string()
      .regex(/^https?:\/\//i, "must start with http:// or https://")
      .optional(),
    apiToken: z.string().min(1).optional(),
    count: z.number().int().min(1).max(5).optional(),
    historyDepth: z.number().int().min(1).max(200).optional(),
    maxDiffChars: z.number().int().min(0).optional(),
    language: z.enum(LANGUAGE_VALUES).optional(),
    body: z.boolean().optional(),
    timeoutMs: z.number().int().min(1000).optional(),
    maxRetries: z.number().int().min(0).max(3).optional(),
    temperature: z.number().min(0).max(2).optional(),
    maxSubjectLength: z.number().int().min(10).max(200).optional(),
    ignore: z.array(z.string()).optional(),
    forceConventional: z.boolean().optional(),
  })
  .passthrough();

export type ConfigFile = z.infer<typeof ConfigFileSchema>;

/** Fully resolved configuration used across the CLI. */
export interface ResolvedConfig {
  /** Base URL of the hosted gitcomm service, e.g. https://ci.example.com. */
  apiUrl?: string;
  /** Optional bearer token for the hosted service. */
  apiToken?: string;
  count: number;
  historyDepth: number;
  maxDiffChars: number;
  language: (typeof LANGUAGE_VALUES)[number];
  body: boolean;
  timeoutMs: number;
  maxRetries: number;
  temperature: number;
  maxSubjectLength: number;
  ignore: string[];
  forceConventional: boolean;
  model?: never;
  apiKey?: never;
}

export const DEFAULTS: ResolvedConfig = {
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
};

/** Human-readable list of invalid config field issues. */
export function formatSchemaErrors(error: z.ZodError): string[] {
  return error.issues.map(
    (i) => `${i.path.join(".") || "(root)"}: ${i.message} (got ${JSON.stringify(i.input)})`,
  );
}