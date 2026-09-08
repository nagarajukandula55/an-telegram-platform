import { OpenAiCompatibleProvider } from "./openai-compatible-provider";
import type { AiProvider } from "./types";

export * from "./types";
export * from "./helpers";
export { OpenAiCompatibleProvider } from "./openai-compatible-provider";

/**
 * Off by default (spec Phase 9: "pluggable, off by default") — returns
 * null unless AI_PROVIDER_URL and AI_PROVIDER_API_KEY are both set. Every
 * caller (apps/api's AI module) must handle the null case explicitly
 * rather than this module silently no-op-ing.
 */
export function getAiProvider(): AiProvider | null {
  const baseUrl = process.env.AI_PROVIDER_URL;
  const apiKey = process.env.AI_PROVIDER_API_KEY;
  if (!baseUrl || !apiKey) return null;

  return new OpenAiCompatibleProvider({
    baseUrl,
    apiKey,
    model: process.env.AI_PROVIDER_MODEL ?? "gpt-4o-mini",
  });
}
