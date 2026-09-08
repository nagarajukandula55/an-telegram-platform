import { BadRequestException, Controller, Headers, Param, Post, Body, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../common/prisma.service";
import { WebhooksService } from "./webhooks.service";

/**
 * Receives Telegram Bot API webhook updates — only used when a connector is
 * explicitly switched into webhook mode (see connector-telegram-bot); the
 * default is long-polling, which never calls this endpoint. Unlike Meta's
 * Cloud API there's no GET verification handshake: Telegram just POSTs
 * updates once `setWebhook` is called, and auth is a shared secret sent
 * back verbatim in the `X-Telegram-Bot-Api-Secret-Token` header.
 */
@Controller("webhooks/connector-telegram-bot")
export class WebhooksController {
  constructor(
    private readonly webhooks: WebhooksService,
    private readonly prisma: PrismaService,
  ) {}

  @Post(":connectorId")
  async receive(
    @Param("connectorId") connectorId: string,
    @Headers("x-telegram-bot-api-secret-token") secretToken: string | undefined,
    @Body() update: unknown,
  ) {
    const connector = await this.prisma.client.connector.findUnique({ where: { id: connectorId } });
    if (!connector) throw new NotFoundException("Unknown connector");

    // Per-connector secret (see Connector.webhookSecret) — falls back to the
    // old global TELEGRAM_WEBHOOK_SECRET env var only for connectors created
    // before that column existed, so an in-place upgrade doesn't suddenly
    // reject webhooks for a bot whose secret was never migrated.
    const expected = connector.webhookSecret ?? process.env.TELEGRAM_WEBHOOK_SECRET ?? "";
    if (!this.webhooks.verifySecretToken(secretToken, expected)) {
      throw new BadRequestException("Invalid webhook secret token");
    }
    return this.webhooks.processUpdate(connectorId, update as Parameters<WebhooksService["processUpdate"]>[1]);
  }
}
