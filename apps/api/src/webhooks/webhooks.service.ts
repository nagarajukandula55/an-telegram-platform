import { timingSafeEqual } from "node:crypto";
import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../common/prisma.service";

/**
 * A Telegram Bot API update (https://core.telegram.org/bots/api#update).
 * Only the fields this service actually reads are typed; the full raw
 * payload is always stored as-is for later inspection/replay.
 */
interface TelegramUpdate {
  update_id: number;
  message?: { message_id: number; text?: string };
  callback_query?: { id: string; data?: string };
  poll_answer?: { poll_id: string };
}

@Injectable()
export class WebhooksService {
  private readonly logger = new Logger(WebhooksService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Telegram's webhook auth is a shared secret compared as-is (set via
   * `secret_token` on `setWebhook`, sent back as the
   * `X-Telegram-Bot-Api-Secret-Token` header) — unlike Meta's Cloud API,
   * there's no HMAC signature to verify, since the token itself IS the
   * secret. Constant-time compare to avoid a timing side-channel.
   */
  verifySecretToken(headerValue: string | undefined, expected: string): boolean {
    if (!headerValue || !expected) return false;
    const a = Buffer.from(headerValue);
    const b = Buffer.from(expected);
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  }

  /**
   * Only relevant when a connector is configured for webhook mode instead
   * of the default long-polling (see connector-telegram-bot's README) —
   * long-polling delivers updates directly to the connector's in-process
   * handler and never reaches this endpoint at all.
   */
  async processUpdate(connectorId: string, update: TelegramUpdate) {
    // update_id is unique per bot and monotonically increasing, so it's a
    // reliable dedup key — Telegram redelivers on webhook failure.
    const eventId = String(update.update_id);
    const existing = await this.prisma.client.webhookEvent.findFirst({ where: { connectorId, eventType: eventId } });
    if (existing) {
      this.logger.log(`Duplicate Telegram update ${eventId} ignored`);
      return { duplicate: true };
    }

    await this.prisma.client.webhookEvent.create({
      data: { connectorId, eventType: eventId, payload: JSON.stringify(update), processedAt: new Date() },
    });

    return {
      kind: update.message ? "message" : update.callback_query ? "callback_query" : update.poll_answer ? "poll_answer" : "other",
    };
  }
}
