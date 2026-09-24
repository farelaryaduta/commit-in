import { DeepSeekProvider } from "./deepseek";
import { FakeProvider } from "./fake";
import { ProviderError, type LLMProvider } from "./llm";

export type ProviderName = "deepseek" | "fake";

/** Resolve a provider by name. Requires an API key for deepseek. */
export function resolveProvider(
  name: ProviderName,
  apiKey: string | undefined,
): LLMProvider {
  if (name === "fake") return new FakeProvider();
  return new DeepSeekProvider(apiKey ?? "");
}

export { FakeProvider, DeepSeekProvider, ProviderError };
export type { LLMProvider };
export {
  DEEPSEEK_BASE_URL,
  DEEPSEEK_CHAT_COMPLETIONS,
  DEEPSEEK_MODEL,
} from "./deepseek";