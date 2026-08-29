import { TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions";
import type {
  Connector,
  ConnectorCapabilities,
  HealthStatus,
  OutboundMessage,
  Recipient,
  SendResult,
} from "@an-tg/connectors-core";

export interface TelegramMtprotoConfig {
  connectorId: string;
  /** From https://my.telegram.org -> API Development Tools. */
  apiId: number;
  apiHash: string;
  /** GramJS StringSession, already decrypted by the caller (see login.ts / api/connectors). Empty until login completes. */
  sessionString: string;
}

/**
 * Adapter for the Telegram *user account* protocol (MTProto) via GramJS —
 * i.e. the client library api/desktop Telegram itself uses, not the Bot API.
 * Runs as a normal outbound TCP/TLS client to Telegram's MTProto servers;
 * no browser, no Docker, nothing to expose to the internet.
 *
 * This connector authenticates as a real user (phone number login), so it
 * can message ANY user by phone or username — no "must message the bot
 * first" restriction — and can join/read arbitrary groups and channels the
 * account is a member of. It carries materially higher account-risk than
 * the Bot API connector (Telegram can rate-limit or restrict accounts that
 * send bulk/automated messages), so the routing/policy layer should never
 * silently prefer it over an available Bot API connector for bulk sends.
 *
 * The session string produced by the one-time login flow (see the
 * `startLogin`/`submitCode`/`submitPassword` helpers exported from this
 * package) must be encrypted at rest by the caller using
 * `encryptSecret`/`decryptSecret` from `@an-tg/connectors-core` — this class
 * only ever sees the plaintext session string in memory, never touches the
 * database directly.
 */
export class TelegramWebConnector implements Connector {
  readonly type = "TELEGRAM_MTPROTO" as const;
  readonly id: string;

  private client: TelegramClient | null = null;
  private connecting: Promise<TelegramClient> | null = null;

  constructor(private readonly config: TelegramMtprotoConfig) {
    this.id = config.connectorId;
  }

  private async getClient(): Promise<TelegramClient> {
    if (this.client) return this.client;
    if (!this.connecting) {
      this.connecting = (async () => {
        const client = new TelegramClient(
          new StringSession(this.config.sessionString),
          this.config.apiId,
          this.config.apiHash,
          { connectionRetries: 3 },
        );
        await client.connect();
        this.client = client;
        return client;
      })();
    }
    return this.connecting;
  }

  async getCapabilities(): Promise<ConnectorCapabilities> {
    return {
      text: true,
      image: true,
      video: true,
      audio: true,
      document: true,
      sticker: true,
      location: true,
      interactive: false, // no inline keyboards for user accounts (bot-only UI feature)
      groups: true,
      templates: false,
      webhooks: false,
    };
  }

  async validateRecipient(recipient: Recipient): Promise<{ valid: boolean; reason?: string }> {
    if (recipient.type === "group" && !recipient.providerGroupId) {
      return { valid: false, reason: "Group/channel sends require a resolved chat id" };
    }
    if (recipient.type === "contact" && !recipient.phone && !recipient.username && !recipient.telegramUserId) {
      return { valid: false, reason: "Contact sends require a phone number, username, or telegramUserId" };
    }
    return { valid: true };
  }

  async send(message: OutboundMessage): Promise<SendResult> {
    const validation = await this.validateRecipient(message.recipient);
    if (!validation.valid) {
      return { accepted: false, status: "rejected", errorCode: "RECIPIENT_INVALID", errorMessage: validation.reason };
    }

    try {
      const client = await this.getClient();
      const entity = await this.resolveEntity(client, message.recipient);

      let sent: { id: number };
      if (message.attachments?.length) {
        sent = await client.sendFile(entity as never, {
          file: message.attachments[0].url,
          caption: message.attachments[0].caption ?? message.content.body,
        });
      } else {
        sent = await client.sendMessage(entity as never, { message: message.content.body ?? "" });
      }

      return { accepted: true, status: "sent", providerMessageId: String(sent.id) };
    } catch (err) {
      return {
        accepted: false,
        status: "failed",
        errorCode: "MTPROTO_ERROR",
        errorMessage: err instanceof Error ? err.message : "Unknown MTProto error",
      };
    }
  }

  /** MTProto has no formal "channel" recipient type distinct from group in our model;
   * `recipient.isChannel` just changes how we resolve/display it. */
  private async resolveEntity(client: TelegramClient, recipient: Recipient): Promise<unknown> {
    if (recipient.type === "group") return client.getEntity(recipient.providerGroupId!);
    if (recipient.username) return client.getEntity(recipient.username);
    if (recipient.telegramUserId) return client.getEntity(BigInt(recipient.telegramUserId) as never);
    return client.getEntity(recipient.phone!);
  }

  async editMessage(providerMessageId: string, recipient: Recipient, newBody: string): Promise<void> {
    const client = await this.getClient();
    const entity = await this.resolveEntity(client, recipient);
    await client.editMessage(entity as never, { message: Number(providerMessageId), text: newBody });
  }

  async deleteMessage(providerMessageId: string, recipient: Recipient): Promise<void> {
    const client = await this.getClient();
    const entity = await this.resolveEntity(client, recipient);
    await client.deleteMessages(entity as never, [Number(providerMessageId)], { revoke: true });
  }

  async getStatus(): Promise<{ status: string; raw?: unknown }> {
    // MTProto exposes read receipts per-dialog, not per-message via a simple
    // poll; treat a successful send() as the terminal signal for now.
    return { status: "sent" };
  }

  async receiveWebhook(): Promise<void> {
    // No inbound webhook channel — incoming messages arrive via the GramJS
    // update event loop, wired up by the worker at startup (see apps/worker).
  }

  async healthCheck(): Promise<HealthStatus> {
    try {
      if (!this.config.sessionString) {
        return { healthy: false, checkedAt: new Date(), detail: "not logged in — no session string" };
      }
      const client = await this.getClient();
      const me = await client.getMe();
      return { healthy: true, checkedAt: new Date(), detail: `@${(me as { username?: string }).username ?? "unknown"}` };
    } catch (err) {
      return { healthy: false, checkedAt: new Date(), detail: err instanceof Error ? err.message : "unreachable" };
    }
  }

  async disconnect(): Promise<void> {
    if (this.client) {
      await this.client.disconnect();
      this.client = null;
      this.connecting = null;
    }
  }
}

export * from "./login";
