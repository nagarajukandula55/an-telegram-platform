import { describe, expect, it, vi } from "vitest";
import { checkRateLimit } from "./rate-limit";

function fakePrisma(sentCount: number) {
  return {
    message: { count: vi.fn().mockResolvedValue(sentCount) },
  } as unknown as import("@an-tg/database").PrismaClient;
}

describe("checkRateLimit", () => {
  it("allows sending when no limits are configured", async () => {
    const prisma = fakePrisma(1000);
    const result = await checkRateLimit(prisma, {
      id: "c1",
      rateLimitPerMinute: null,
      rateLimitPerHour: null,
      rateLimitPerDay: null,
    });
    expect(result).toEqual({ allowed: true });
  });

  it("blocks once the per-minute cap is reached", async () => {
    const prisma = fakePrisma(5);
    const result = await checkRateLimit(prisma, {
      id: "c1",
      rateLimitPerMinute: 5,
      rateLimitPerHour: null,
      rateLimitPerDay: null,
    });
    expect(result).toEqual({ allowed: false, window: "minute" });
  });

  it("allows sending when under every configured cap", async () => {
    const prisma = fakePrisma(3);
    const result = await checkRateLimit(prisma, {
      id: "c1",
      rateLimitPerMinute: 5,
      rateLimitPerHour: 100,
      rateLimitPerDay: 1000,
    });
    expect(result).toEqual({ allowed: true });
  });

  it("checks minute/hour/day windows in that order and reports the first exhausted one", async () => {
    const count = vi.fn().mockResolvedValue(10);
    const prisma = { message: { count } } as unknown as import("@an-tg/database").PrismaClient;

    const result = await checkRateLimit(prisma, {
      id: "c1",
      rateLimitPerMinute: 5,
      rateLimitPerHour: 5,
      rateLimitPerDay: 5,
    });

    expect(result).toEqual({ allowed: false, window: "minute" });
    expect(count).toHaveBeenCalledTimes(1);
  });
});
