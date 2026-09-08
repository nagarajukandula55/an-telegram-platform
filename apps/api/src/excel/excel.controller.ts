import { Body, Controller, Post, UploadedFile, UseGuards, UseInterceptors } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { ExcelService } from "./excel.service";
import { RenderRangeDto } from "./dto/render-range.dto";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { CurrentUser, CurrentUserPayload } from "../common/current-user.decorator";
import { AuditService } from "../common/audit.service";

@UseGuards(JwtAuthGuard)
@Controller("excel")
export class ExcelController {
  constructor(
    private readonly excel: ExcelService,
    private readonly audit: AuditService,
  ) {}

  @Post("render")
  @UseInterceptors(FileInterceptor("file"))
  async render(@UploadedFile() file: Express.Multer.File, @Body() dto: RenderRangeDto, @CurrentUser() user: CurrentUserPayload) {
    const attachment = await this.excel.renderRangeToPdf(user.organizationId, file, {
      sheetName: dto.sheetName,
      range: dto.range,
      title: dto.title,
    });
    await this.audit.log({
      organizationId: user.organizationId,
      userId: user.userId,
      action: "excel.range_rendered",
      entityType: "Attachment",
      entityId: attachment.id,
      metadata: { range: dto.range, sheetName: dto.sheetName },
    });
    return attachment;
  }
}
