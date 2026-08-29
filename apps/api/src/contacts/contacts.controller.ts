import { Body, Controller, Get, Post, Query, UploadedFile, UseGuards, UseInterceptors } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { ContactsService } from "./contacts.service";
import { CreateContactDto } from "./dto/create-contact.dto";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { CurrentUser, CurrentUserPayload } from "../common/current-user.decorator";
import { AuditService } from "../common/audit.service";

@UseGuards(JwtAuthGuard)
@Controller("contacts")
export class ContactsController {
  constructor(
    private readonly contacts: ContactsService,
    private readonly audit: AuditService,
  ) {}

  @Post()
  async create(@Body() dto: CreateContactDto, @CurrentUser() user: CurrentUserPayload) {
    const contact = await this.contacts.create(user.organizationId, dto);
    await this.audit.log({
      organizationId: user.organizationId,
      userId: user.userId,
      action: "contact.created",
      entityType: "Contact",
      entityId: contact.id,
    });
    return contact;
  }

  @Get()
  list(@Query("search") search: string | undefined, @CurrentUser() user: CurrentUserPayload) {
    return this.contacts.list(user.organizationId, { search });
  }

  @Post("import")
  @UseInterceptors(FileInterceptor("file"))
  async import(@UploadedFile() file: Express.Multer.File, @CurrentUser() user: CurrentUserPayload) {
    const result = await this.contacts.importFromFile(user.organizationId, file.buffer);
    await this.audit.log({
      organizationId: user.organizationId,
      userId: user.userId,
      action: "contact.imported",
      metadata: { created: result.created, totalRows: result.results.length },
    });
    return result;
  }
}
