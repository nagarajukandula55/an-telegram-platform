-- AlterTable
ALTER TABLE "Connector" ADD COLUMN "rateLimitPerDay" INTEGER;
ALTER TABLE "Connector" ADD COLUMN "rateLimitPerHour" INTEGER;
ALTER TABLE "Connector" ADD COLUMN "rateLimitPerMinute" INTEGER;
