export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

/**
 * Pluggable AI provider (spec Phase 9: "pluggable, off by default"). One
 * low-level primitive (`complete`) so a new provider only has to implement
 * one method; draftReply/translate/proposeWorkflow in helpers.ts are built
 * on top of it and are provider-agnostic.
 */
export interface AiProvider {
  readonly name: string;
  complete(messages: ChatMessage[], options?: { maxTokens?: number; temperature?: number }): Promise<string>;
}

export class AiNotConfiguredError extends Error {
  constructor() {
    super("No AI provider is configured — set AI_PROVIDER_URL and AI_PROVIDER_API_KEY to enable AI features");
    this.name = "AiNotConfiguredError";
  }
}
