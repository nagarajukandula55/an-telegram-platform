import { Bot, InlineKeyboard } from "grammy";
import type {
  Connector,
  ConnectorCapabilities,
  HealthStatus,
  InlineKeyboardRow,
  OutboundMessage,
  Recipient,
  SendResult,
} from "@an-tg/connectors-core";
import { UnsupportedCapabilityError } from "@an-tg/connectors-core";

export interface TelegramBotConfig {
  connectorId: string;
  /** Bot token obtained from @BotFather, e.g. "123456:ABC-DEF...". */
  botToken: string;
  /** When true, start long-polling for incoming updates (default: true). */
  enablePolling?: boolean;
  onIncomingMessage?: (update: unknown) => void | Promise<void>;
}

/**
 * Adapter for the official Telegram Bot API (https://core.telegram.org/bots/api),
 * implemented on top of `grammy`. Runs entirely over outbound HTTPS to
 * api.telegram.org — no public inbound webhook is required because incoming
 * updates are pulled via long-polling (getUpdates), matching this platform's
 * "fully local, nothing to expose to the internet" principle.
 *
 * A bot can only message a user after that user has started a conversation
 * with it (pressed Start / sent it a message), and can only act in a
 * group/channel it has been added to as a member/admin. For unrestricted
 * DM-to-anyone messaging, use connector-telegram-mtproto instead.
 */
export class TelegramCloudConnector implements Connector {
  readonly type = "TELEGRAM_BOT" as const;
  readonly id: string;

  private readonly bot: Bot;
  private pollingStarted = false;

  constructor(private readonly config: TelegramBotConfig) {
    this.id = config.connectorId;
    this.bot = new Bot(config.botToken);

    if (config.onIncomingMessage) {
      this.bot.on("message", async (ctx) => {
        await config.onIncomingMessage!(ctx.update);
      });
    }

    if (config.enablePolling !== false) {
      this.startPolling();
    }
  }

  private startPolling(): void {
    if (this.pollingStarted) return;
    this.pollingStarted = true;
    // grammy's runner handles retry/backoff internally; fire-and-forget here
    // because this constructor cannot be async.
    this.bot.start({
      onStart: () => {
        // eslint-disable-next-line no-console
        console.log(`[connector-telegram-bot:${this.id}] long-polling started`);
      },
    }).catch((err) => {
      // eslint-disable-next-line no-console
      console.error(`[connector-telegram-bot:${this.id}] polling stopped:`, err);
      this.pollingStarted = false;
    });
  }

  async stop(): Promise<void> {
    if (this.pollingStarted) {
      await this.bot.stop();
      this.pollingStarted = false;
    }
  }

  async getCapabilities(): Promise<ConnectorCapabilities> {
    return {
      text: true,
      image: true,
      video: true,
      audio: true,
      document: true,
      sticker: true,
      location: false,
      interactive: true, // inline keyboards, polls, reactions
      groups: true, // bot can send to groups/channels it administers
      templates: false, // Bot API has no template-approval concept
      webhooks: true, // optional webhook mode also supported, see webhooks module
    };
  }

  async validateRecipient(recipient: Recipient): Promise<{ valid: boolean; reason?: string }> {
    if (recipient.type === "group") {
      if (!recipient.providerGroupId) {
        return { valid: false, reason: "Group/channel recipients need a providerGroupId (chat id)" };
      }
      return { valid: true };
    }
    if (!recipient.telegramUserId && !recipient.username) {
      return { valid: false, reason: "Contact recipients need telegramUserId or username" };
    }
    return { valid: true };
  }

  async send(message: OutboundMessage): Promise<SendResult> {
    const validation = await this.validateRecipient(message.recipient);
    if (!validation.valid) {
      return { accepted: false, status: "rejected", errorCode: "RECIPIENT_INVALID", errorMessage: validation.reason };
    }

    const chatId = this.resolveChatId(message.recipient);
    const keyboard = this.buildKeyboard(message.content.inlineButtons);

    try {
      let sent: { message_id: number };

      if (message.content.type === "poll" && message.content.poll) {
        const p = message.content.poll;
        sent = await this.bot.api.sendPoll(chatId, p.question, p.options, {
          is_anonymous: p.isAnonymous ?? true,
          type: p.isQuiz ? "quiz" : "regular",
          correct_option_ids: p.isQuiz && p.correctOptionIndex !== undefined ? [p.correctOptionIndex] : undefined,
          allows_multiple_answers: p.isQuiz ? undefined : p.allowsMultipleAnswers,
        });
      } else if (message.attachments?.length && ["image", "video", "audio", "document"].includes(message.content.type)) {
        const att = message.attachments[0];
        const caption = att.caption ?? message.content.body;
        if (message.content.type === "image") {
          sent = await this.bot.api.sendPhoto(chatId, att.url, { caption, reply_markup: keyboard });
        } else if (message.content.type === "video") {
          sent = await this.bot.api.sendVideo(chatId, att.url, { caption, reply_markup: keyboard });
        } else if (message.content.type === "audio") {
          sent = await this.bot.api.sendAudio(chatId, att.url, { caption, reply_markup: keyboard });
        } else {
          sent = await this.bot.api.sendDocument(chatId, att.url, { caption, reply_markup: keyboard });
        }
      } else {
        sent = await this.bot.api.sendMessage(chatId, message.content.body ?? "", { reply_markup: keyboard });
      }

      return { accepted: true, status: "sent", providerMessageId: String(sent.message_id) };
    } catch (err) {
      return {
        accepted: false,
        status: "failed",
        errorCode: "PROVIDER_REJECTED",
        errorMessage: err instanceof Error ? err.message : "Unknown Telegram API error",
      };
    }
  }

  private resolveChatId(recipient: Recipient): string {
    if (recipient.type === "group") return recipient.providerGroupId!;
    return recipient.telegramUserId ?? (recipient.username?.startsWith("@") ? recipient.username : `@${recipient.username}`);
  }

  private buildKeyboard(rows?: InlineKeyboardRow[]): InlineKeyboard | undefined {
    if (!rows?.length) return undefined;
    const kb = new InlineKeyboard();
    for (const row of rows) {
      for (const btn of row) {
        if (btn.url) kb.url(btn.text, btn.url);
        else kb.text(btn.text, btn.callbackData ?? btn.text);
      }
      kb.row();
    }
    return kb;
  }

  async editMessage(providerMessageId: string, recipient: Recipient, newBody: string): Promise<void> {
    const chatId = this.resolveChatId(recipient);
    await this.bot.api.editMessageText(chatId, Number(providerMessageId), newBody);
  }

  async deleteMessage(providerMessageId: string, recipient: Recipient): Promise<void> {
    const chatId = this.resolveChatId(recipient);
    await this.bot.api.deleteMessage(chatId, Number(providerMessageId));
  }

  async setReaction(providerMessageId: string, recipient: Recipient, emoji: string): Promise<void> {
    const chatId = this.resolveChatId(recipient);
    await this.bot.api.setMessageReaction(chatId, Number(providerMessageId), [{ type: "emoji", emoji: emoji as never }]);
  }

  async getStatus(providerMessageId: string): Promise<{ status: string; raw?: unknown }> {
    // Bot API has no synchronous delivery-status poll endpoint; delivery is
    // implied by a successful sendX() call above. Read receipts don't exist
    // for bots. Return "sent" as the best available signal.
    return { status: "sent", raw: { providerMessageId } };
  }

  async receiveWebhook(payload: unknown): Promise<void> {
    // Only relevant when running in optional webhook mode instead of
    // long-polling; dispatch is handled by the webhooks module, which calls
    // bot.handleUpdate() with this payload.
    void payload;
  }

  async healthCheck(): Promise<HealthStatus> {
    try {
      const me = await this.bot.api.getMe();
      return { healthy: true, checkedAt: new Date(), detail: `@${me.username}` };
    } catch (err) {
      return { healthy: false, checkedAt: new Date(), detail: err instanceof Error ? err.message : "unreachable" };
    }
  }
}

export { UnsupportedCapabilityError };
