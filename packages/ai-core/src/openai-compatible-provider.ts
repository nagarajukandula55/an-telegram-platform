import type { AiProvider, ChatMessage } from "./types";

export interface OpenAiCompatibleConfig {
  /** e.g. "https://api.openai.com/v1/chat/completions", an Azure OpenAI deployment URL, or a local Ollama/vLLM OpenAI-compatible endpoint. */
  baseUrl: string;
  apiKey: string;
  model: string;
}

/**
 * Talks to any Chat Completions-compatible HTTP API (OpenAI, Azure OpenAI,
 * Ollama, vLLM, most self-hosted gateways) via plain fetch — no vendor SDK
 * dependency, matching this platform's connector-agnostic philosophy
 * (packages/connectors-core) applied to AI providers instead of messaging
 * providers.
 */
export class OpenAiCompatibleProvider implements AiProvider {
  readonly name = "openai-compatible";

  constructor(private readonly config: OpenAiCompatibleConfig) {}

  async complete(messages: ChatMessage[], options?: { maxTokens?: number; temperature?: number }): Promise<string> {
    const res = await fetch(this.config.baseUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.config.apiKey}`,
      },
      body: JSON.stringify({
        model: this.config.model,
        messages,
        max_tokens: options?.maxTokens ?? 500,
        temperature: options?.temperature ?? 0.4,
      }),
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(`AI provider request failed (HTTP ${res.status}): ${detail.slice(0, 300)}`);
    }

    const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const content = data.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error("AI provider returned no content");
    }
    return content;
  }
}
