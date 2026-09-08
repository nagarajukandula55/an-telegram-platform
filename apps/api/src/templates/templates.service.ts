import { Injectable } from "@nestjs/common";
import { PrismaService } from "../common/prisma.service";
import { CreateTemplateDto } from "./dto/create-template.dto";

@Injectable()
export class TemplatesService {
  constructor(private readonly prisma: PrismaService) {}

  create(organizationId: string, dto: CreateTemplateDto) {
    return this.prisma.client.template.create({
      data: {
        organizationId,
        name: dto.name,
        body: dto.body,
        language: dto.language ?? "en",
        approvalStatus: dto.approvalStatus ?? "DRAFT",
      },
    });
  }

  list(organizationId: string) {
    return this.prisma.client.template.findMany({ where: { organizationId }, orderBy: { createdAt: "desc" } });
  }
}
