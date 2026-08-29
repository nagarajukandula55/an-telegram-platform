import { BadRequestException, ConflictException, Injectable, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import * as bcrypt from "bcryptjs";
import { PrismaService } from "../common/prisma.service";
import { RegisterDto } from "./dto/register.dto";
import { CreateUserDto } from "./dto/create-user.dto";

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  async login(email: string, password: string) {
    const user = await this.prisma.client.user.findFirst({ where: { email, isActive: true } });
    if (!user || !user.passwordHash) {
      throw new UnauthorizedException("Invalid credentials");
    }
    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      throw new UnauthorizedException("Invalid credentials");
    }

    return this.issueToken(user.id, user.organizationId, user.role, user.email, user.name);
  }

  /**
   * Bootstrap registration: only allowed while the target organization has
   * zero users, so this can't be used to silently add admins to an
   * org someone else already set up. Every subsequent user for that org
   * must go through `createUser` (which requires an authenticated
   * TENANT_ADMIN/SUPER_ADMIN caller).
   */
  async register(dto: RegisterDto) {
    const org = await this.prisma.client.organization.findUnique({ where: { id: dto.organizationId } });
    if (!org) {
      throw new BadRequestException("Organization not found");
    }

    const existingUserCount = await this.prisma.client.user.count({ where: { organizationId: org.id } });
    if (existingUserCount > 0) {
      throw new ConflictException("This organization already has an admin — ask them to invite you instead");
    }

    const passwordHash = await bcrypt.hash(dto.password, 10);
    const user = await this.prisma.client.user.create({
      data: { organizationId: org.id, email: dto.email, name: dto.name, passwordHash, role: "TENANT_ADMIN" },
    });

    return this.issueToken(user.id, user.organizationId, user.role, user.email, user.name);
  }

  async createUser(organizationId: string, dto: CreateUserDto) {
    const existing = await this.prisma.client.user.findUnique({
      where: { organizationId_email: { organizationId, email: dto.email } },
    });
    if (existing) {
      throw new ConflictException(`A user with email "${dto.email}" already exists in this organization`);
    }
    const passwordHash = await bcrypt.hash(dto.password, 10);
    return this.prisma.client.user.create({
      data: { organizationId, email: dto.email, name: dto.name, passwordHash, role: dto.role },
      select: { id: true, email: true, name: true, role: true, isActive: true, createdAt: true },
    });
  }

  private async issueToken(userId: string, organizationId: string, role: string, email: string, name: string | null) {
    const accessToken = await this.jwt.signAsync({ sub: userId, organizationId, role, email });
    return { accessToken, user: { id: userId, email, name, role, organizationId } };
  }
}
