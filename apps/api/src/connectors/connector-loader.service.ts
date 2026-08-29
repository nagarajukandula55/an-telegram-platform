import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { loadConnectorsFromDb } from "@an-tg/connectors-bootstrap";
import { PrismaService } from "../common/prisma.service";

@Injectable()
export class ConnectorLoaderService implements OnModuleInit {
  private readonly logger = new Logger(ConnectorLoaderService.name);

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() {
    const { loaded, failed } = await loadConnectorsFromDb(this.prisma.client);
    this.logger.log(`Connector registry: ${loaded} loaded, ${failed} failed`);
  }
}
