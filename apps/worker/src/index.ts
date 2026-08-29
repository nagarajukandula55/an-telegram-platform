/* eslint-disable @typescript-eslint/no-var-requires */
require("dotenv").config({ path: require("node:path").resolve(process.cwd(), "../../.env") });
process.env.AN_TG_PROCESS = "worker";

import { prisma } from "@an-tg/database";
import { loadConnectorsFromDb } from "@an-tg/connectors-bootstrap";
import { startSendWorker } from "./processors/send.processor";
import { startCampaignWorker } from "./processors/campaign.processor";
import { startWorkflowWorker } from "./processors/workflow.processor";
import { startScheduler } from "./scheduler";

async function main() {
  const { loaded, failed } = await loadConnectorsFromDb(prisma);
  // eslint-disable-next-line no-console
  console.log(`Worker: connector registry ${loaded} loaded, ${failed} failed`);

  const sendWorker = startSendWorker();
  const campaignWorker = startCampaignWorker();
  const workflowWorker = startWorkflowWorker();
  const schedulerHandle = startScheduler();

  // eslint-disable-next-line no-console
  console.log("AN Telegram worker started (send/campaign/workflow queues polling every 1-2s; scheduler polling every 30s) — no Redis, no Docker.");

  process.on("SIGTERM", async () => {
    clearInterval(schedulerHandle);
    sendWorker.stop();
    campaignWorker.stop();
    workflowWorker.stop();
    await prisma.$disconnect();
    process.exit(0);
  });
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error("Worker failed to start:", err);
  process.exit(1);
});
