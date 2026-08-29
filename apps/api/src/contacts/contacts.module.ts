import { Module } from "@nestjs/common";
import { ContactsController } from "./contacts.controller";
import { ContactsService } from "./contacts.service";
import { PrismaService } from "../common/prisma.service";
import { AuditService } from "../common/audit.service";

@Module({
  controllers: [ContactsController],
  providers: [ContactsService, PrismaService, AuditService],
  exports: [ContactsService],
})
export class ContactsModule {}
