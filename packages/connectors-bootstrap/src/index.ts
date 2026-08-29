import { connectorRegistry, decryptSecret, type ConnectorCapabilities } from "@an-tg/connectors-core";
import { TelegramCloudConnector } from "@an-tg/connector-telegram-bot";
import { CustomHttpConnector } from "@an-tg/connector-custom-http";
import { TelegramWebConnector } from "@an-tg/connector-telegram-mtproto";
import type { PrismaClient } from "@an-tg/database";

/**
 * Hydrates the process-local connector registry from the Connector table.
 * Both the API process and the worker process call this at startup so
 * either can resolve any connector by id without duplicating the
 * type-to-adapter mapping. Credentials come from env vars named by
 * `credentialRef`, never from the `config` JSON column.
 */
export async function loadConnectorsFromDb(prisma: PrismaClient): Promise<{ loaded: number; failed: number }> {
  const rows = await prisma.connector.findMany({ where: { isEnabled: true } });
  let loaded = 0;
  let failed = 0;

  for (const row of rows) {
    try {
      const config = (row.config ? JSON.parse(row.config) : {}) as Record<string, unknown>;

      if (row.type === "TELEGRAM_BOT") {
        connectorRegistry.register(
          new TelegramCloudConnector({
            connectorId: row.id,
            botToken: process.env[row.credentialRef ?? "TELEGRAM_BOT_TOKEN"] ?? "",
            // Long-polling is disabled in the API process (it hydrates the
            // registry for outbound sends only); the worker enables polling
            // so exactly one process owns getUpdates() per bot.
            enablePolling: process.env.AN_TG_PROCESS === "worker",
          }),
        );
      } else if (row.type === "CUSTOM_MIDDLEWARE") {
        connectorRegistry.register(
          new CustomHttpConnector({
            connectorId: row.id,
            endpointUrl: String(config.endpointUrl ?? ""),
            healthUrl: config.healthUrl ? String(config.healthUrl) : undefined,
            signingSecret: row.credentialRef ? process.env[row.credentialRef] : undefined,
            capabilities: JSON.parse(row.capabilities) as ConnectorCapabilities,
          }),
        );
      } else if (row.type === "TELEGRAM_MTPROTO") {
        // Session string is encrypted at rest in config.encryptedSession
        // (see MtprotoLoginSession + encryptSecret in @an-tg/connectors-core).
        // It stays empty until the phone/code/2FA login flow has completed.
        const encryptedSession = config.encryptedSession ? String(config.encryptedSession) : "";
        connectorRegistry.register(
          new TelegramWebConnector({
            connectorId: row.id,
            apiId: Number(config.apiId ?? process.env.TELEGRAM_API_ID ?? 0),
            apiHash: String(config.apiHash ?? process.env.TELEGRAM_API_HASH ?? ""),
            sessionString: encryptedSession ? decryptSecret(encryptedSession) : "",
          }),
        );
      } else {
        failed++;
        continue;
      }
      loaded++;
    } catch {
      failed++;
    }
  }

  return { loaded, failed };
}

export { connectorRegistry } from "@an-tg/connectors-core";
