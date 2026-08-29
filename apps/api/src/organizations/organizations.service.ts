import { ConflictException, Injectable } from "@nestjs/common";
import { PrismaService } from "../common/prisma.service";
import { CreateOrganizationDto } from "./dto/create-organization.dto";

@Injectable()
export class OrganizationsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateOrganizationDto) {
    const existing = await this.prisma.client.organization.findUnique({ where: { slug: dto.slug } });
    if (existing) {
      throw new ConflictException(`Organization slug "${dto.slug}" is already taken`);
    }
    return this.prisma.client.organization.create({ data: dto });
  }

  findById(id: string) {
    return this.prisma.client.organization.findUnique({ where: { id } });
  }
}
