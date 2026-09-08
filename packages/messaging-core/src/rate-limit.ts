import type { PrismaClient, Connector } from "@an-tg/database";

export interface RateLimitResult {
  allowed: boolean;
  /** Which window (if any) is currently exhausted. */
  window?: "minute" | "hour" | "day";
}

const WINDOWS: { key: "minute" | "hour" | "day"; ms: number; field: "rateLimitPerMinute" | "rateLimitPerHour" | "rateLimitPerDay" }[] = [
  { key: "minute", ms: 60_000, field: "rateLimitPerMinute" },
  { key: "hour", ms: 60 * 60_000, field: "rateLimitPerHour" },
  { key: "day", ms: 24 * 60 * 60_000, field: "rateLimitPerDay" },
];

/**
 * Spec §28 per-minute/hour/day send caps. Counts this connector's already-SENT
 * messages within each configured window; a connector with no caps set (all
 * three fields null) is always allowed. Checked once per delivery attempt in
 * deliverMessage(), immediately before the connector.send() call — a message
 * over the cap is treated as a TRANSIENT (RATE_LIMITED) failure so the
 * existing retry/backoff path picks it back up once the window clears.
 */
export async function checkRateLimit(
  prisma: PrismaClient,
  connector: Pick<Connector, "id" | "rateLimitPerMinute" | "rateLimitPerHour" | "rateLimitPerDay">,
): Promise<RateLimitResult> {
  for (const { key, ms, field } of WINDOWS) {
    const limit = connector[field];
    if (limit == null) continue;

    const count = await prisma.message.count({
      where: { connectorId: connector.id, status: "SENT", updatedAt: { gte: new Date(Date.now() - ms) } },
    });
    if (count >= limit) {
      return { allowed: false, window: key };
    }
  }
  return { allowed: true };
}
