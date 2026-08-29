import { Injectable } from "@nestjs/common";
import { PrismaService } from "../common/prisma.service";
import { CreateGroupDto } from "./dto/create-group.dto";

@Injectable()
export class GroupsService {
  constructor(private readonly prisma: PrismaService) {}

  create(organizationId: string, dto: CreateGroupDto) {
    return this.prisma.client.group.create({
      data: {
        organizationId,
        connectorId: dto.connectorId,
        name: dto.name,
        providerGroupId: dto.name,
        alias: dto.alias,
      },
    });
  }

  list(organizationId: string) {
    return this.prisma.client.group.findMany({ where: { organizationId }, orderBy: { createdAt: "desc" } });
  }
}
