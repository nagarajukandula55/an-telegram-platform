import type { PrismaClient } from "@an-tg/database";

export async function checkSendable(
  prisma: PrismaClient,
  organizationId: string,
  phone: string,
): Promise<{ sendable: boolean; reason?: string }> {
  const suppressed = await prisma.suppression.findUnique({
    where: { organizationId_phone: { organizationId, phone } },
  });
  if (suppressed) return { sendable: false, reason: "Phone number is on the suppression list" };

  const contact = await prisma.contact.findUnique({
    where: { organizationId_phone: { organizationId, phone } },
    include: { consents: { orderBy: { createdAt: "desc" }, take: 1 } },
  });
  const latestConsent = contact?.consents[0];
  if (latestConsent?.status === "OPTED_OUT") {
    return { sendable: false, reason: "Contact has opted out" };
  }
  return { sendable: true };
}
