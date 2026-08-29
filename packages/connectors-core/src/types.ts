export type RecipientType = "contact" | "group";

export interface Recipient {
  type: RecipientType;
  phone?: string;
  telegramUserId?: string;
  username?: string;
  providerGroupId?: string;
  contactId?: string;
  /** MTProto only: true if this recipient is a broadcast channel rather than a group/DM. */
  isChannel?: boolean;
}

export type MessageContentType =
  | "text"
  | "image"
  | "video"
  | "audio"
  | "document"
  | "sticker"
  | "location"
  | "contact_card"
  | "interactive"
  | "poll"
  | "template";

export interface MessageAttachmentRef {
  url: string;
  mimeType: string;
  filename?: string;
  caption?: string;
}

/** One row of an inline keyboard. Bot API only — silently ignored by other connectors. */
export type InlineKeyboardRow = Array<{ text: string; callbackData?: string; url?: string }>;

export interface PollSpec {
  question: string;
  options: string[];
  isAnonymous?: boolean;
  isQuiz?: boolean;
  correctOptionIndex?: number;
  allowsMultipleAnswers?: boolean;
}

export interface OutboundMessage {
  id: string;
  idempotencyKey: string;
  recipient: Recipient;
  content: {
    type: MessageContentType;
    body?: string;
    templateName?: string;
    templateVariables?: Record<string, string>;
    /** Inline keyboard buttons — Bot API only. */
    inlineButtons?: InlineKeyboardRow[];
    /** Present when content.type === "poll". */
    poll?: PollSpec;
  };
  attachments?: MessageAttachmentRef[];
  metadata?: {
    campaignId?: string;
    workflowRunId?: string;
    organizationId: string;
  };
}

export interface SendResult {
  accepted: boolean;
  providerMessageId?: string;
  status: "queued" | "sent" | "rejected" | "failed";
  errorCode?: string;
  errorMessage?: string;
}

export interface ConnectorCapabilities {
  text: boolean;
  image: boolean;
  video: boolean;
  audio: boolean;
  document: boolean;
  sticker: boolean;
  location: boolean;
  interactive: boolean;
  groups: boolean;
  templates: boolean;
  webhooks: boolean;
}

export interface HealthStatus {
  healthy: boolean;
  detail?: string;
  checkedAt: Date;
}

/**
 * Every delivery mode (Telegram MTProto, Cloud API, custom middleware) implements
 * this contract. The workflow/campaign engine only ever calls through this
 * interface — never branches on connector type.
 */
export interface Connector {
  readonly id: string;
  readonly type: "TELEGRAM_MTPROTO" | "TELEGRAM_BOT" | "CUSTOM_MIDDLEWARE";

  getCapabilities(): Promise<ConnectorCapabilities>;
  validateRecipient(recipient: Recipient): Promise<{ valid: boolean; reason?: string }>;
  send(message: OutboundMessage): Promise<SendResult>;
  getStatus(providerMessageId: string): Promise<{ status: string; raw?: unknown }>;
  receiveWebhook(payload: unknown, headers: Record<string, string>): Promise<void>;
  healthCheck(): Promise<HealthStatus>;

  /** Optional Telegram-specific extras. Connectors that don't support one throw UnsupportedCapabilityError. */
  editMessage?(providerMessageId: string, recipient: Recipient, newBody: string): Promise<void>;
  deleteMessage?(providerMessageId: string, recipient: Recipient): Promise<void>;
  setReaction?(providerMessageId: string, recipient: Recipient, emoji: string): Promise<void>;
}

export class UnsupportedCapabilityError extends Error {
  constructor(connectorType: string, capability: string) {
    super(`Connector "${connectorType}" does not support capability "${capability}"`);
    this.name = "UnsupportedCapabilityError";
  }
}
