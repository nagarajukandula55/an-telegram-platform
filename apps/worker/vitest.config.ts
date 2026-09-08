import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    // workflow.processor.ts imports the shared `prisma` client at module
    // scope (for the real queue worker) — PrismaClient's datasource URL is
    // resolved at construction time, so this needs to be set even though
    // the pure functions under test never actually touch the database.
    env: { DATABASE_URL: "file:./test-placeholder.db" },
  },
});
