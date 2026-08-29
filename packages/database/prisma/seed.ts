import * as bcrypt from "bcryptjs";
import { prisma } from "../src/index";

async function main() {
  const org = await prisma.organization.upsert({
    where: { slug: "demo" },
    update: {},
    create: { name: "Demo Organization", slug: "demo" },
  });

  const passwordHash = await bcrypt.hash("ChangeMe123!", 10);
  await prisma.user.upsert({
    where: { organizationId_email: { organizationId: org.id, email: "admin@demo.local" } },
    update: {},
    create: {
      organizationId: org.id,
      email: "admin@demo.local",
      name: "Demo Admin",
      passwordHash,
      role: "TENANT_ADMIN",
    },
  });

  await prisma.connector.upsert({
    where: { id: "demo-custom-http" },
    update: {},
    create: {
      id: "demo-custom-http",
      organizationId: org.id,
      type: "CUSTOM_MIDDLEWARE",
      name: "Demo custom middleware",
      isPrimary: true,
      capabilities: JSON.stringify({ text: true, image: true, video: false, audio: false, document: true, sticker: false, location: false, interactive: false, groups: false, templates: false, webhooks: true }),
      config: JSON.stringify({ endpointUrl: "http://localhost:9999/telegram/send" }),
    },
  });

  // eslint-disable-next-line no-console
  console.log(`Seeded org "${org.slug}" with admin@demo.local / ChangeMe123!`);
}

main()
  .catch((err) => {
    // eslint-disable-next-line no-console
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
