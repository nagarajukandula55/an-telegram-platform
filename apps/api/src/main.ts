/* eslint-disable @typescript-eslint/no-var-requires */
// Loads the monorepo-root .env before anything else runs — must stay a
// `require` ahead of the `import`s below (not `import "dotenv/config"`),
// since TS preserves statement order for CommonJS output but ESM-style
// imports elsewhere could otherwise read process.env before this runs.
require("dotenv").config({ path: require("node:path").resolve(process.cwd(), "../../.env") });
process.env.AN_TG_PROCESS = "api";

import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { ValidationPipe } from "@nestjs/common";
import * as express from "express";
import { AppModule } from "./app.module";

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { rawBody: false, bodyParser: false });
  // Webhook signature verification needs the exact raw request body, so we
  // configure the JSON body parser ourselves and stash it on the request
  // instead of using Nest's default parser.
  app.use(
    express.json({
      verify: (req: express.Request & { rawBody?: Buffer }, _res, buf) => {
        req.rawBody = buf;
      },
    }),
  );
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.enableCors();
  const port = process.env.PORT ? Number(process.env.PORT) : 4000;
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`AN Telegram API listening on :${port}`);
}

bootstrap();
