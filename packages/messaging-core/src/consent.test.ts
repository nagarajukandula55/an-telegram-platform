import { describe, expect, it, vi } from "vitest";
import { checkSendable } from "./consent";

function fakePrisma(overrides: {
  suppression?: unknown;
  contact?: unknown;
}) {
  return {
    suppression: {
      findUnique: vi.fn().mockResolvedValue(overrides.suppression ?? null),
    },
    contact: {
      findUnique: vi.fn().mockResolvedValue(overrides.contact ?? null),
    },
  } as unknown as import("@an-tg/database").PrismaClient;
}

describe("checkSendable", () => {
  it("blocks a suppressed phone number even if the contact has consented", async () => {
    const prisma = fakePrisma({
      suppression: { organizationId: "org1", phone: "+1555" },
      contact: { consents: [{ status: "OPTED_IN" }] },
    });

    const result = await checkSendable(prisma, "org1", "+1555");

    expect(result).toEqual({ sendable: false, reason: "Phone number is on the suppression list" });
  });

  it("blocks a contact whose latest consent is OPTED_OUT", async () => {
    const prisma = fakePrisma({
      contact: { consents: [{ status: "OPTED_OUT" }] },
    });

    const result = await checkSendable(prisma, "org1", "+1555");

    expect(result).toEqual({ sendable: false, reason: "Contact has opted out" });
  });

  it("only looks at the most recent consent record, not older ones", async () => {
    const prisma = fakePrisma({
      contact: { consents: [{ status: "OPTED_IN" }] },
    });

    const result = await checkSendable(prisma, "org1", "+1555");

    expect(result).toEqual({ sendable: true });
  });

  it("allows sending when there's no suppression and no contact on file", async () => {
    const prisma = fakePrisma({});

    const result = await checkSendable(prisma, "org1", "+1555");

    expect(result).toEqual({ sendable: true });
  });
});
