import { BadRequestException, ConflictException, Injectable, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import * as bcrypt from "bcryptjs";
import { randomBytes, randomUUID, createHash } from "node:crypto";
import { PrismaService } from "../common/prisma.service";
import { RegisterDto } from "./dto/register.dto";
import { CreateUserDto } from "./dto/create-user.dto";

const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

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

    return this.issueSession(user.id, user.organizationId, user.role, user.email, user.name);
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

    return this.issueSession(user.id, user.organizationId, user.role, user.email, user.name);
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

  /**
   * Exchanges a still-valid, unrevoked refresh token for a new access token
   * and a new refresh token — the old refresh token row is revoked in the
   * same call (rotation, same familyId chain), so each refresh token is
   * single-use.
   *
   * If the presented token is already revoked but not expired, that's
   * reuse: a token that was already rotated away is being presented again,
   * which only happens if it leaked and both the thief and the legitimate
   * holder tried to use it. Revoking the whole family forces a real
   * re-login, which is the only way to actually recover from a leaked
   * refresh token rather than just detecting it.
   */
  async refresh(refreshToken: string) {
    const tokenHash = hashToken(refreshToken);
    const row = await this.prisma.client.refreshToken.findUnique({
      where: { tokenHash },
      include: { user: true },
    });
    if (!row) {
      throw new UnauthorizedException("Invalid or expired refresh token");
    }

    if (row.revokedAt) {
      if (row.expiresAt >= new Date()) {
        await this.prisma.client.refreshToken.updateMany({
          where: { familyId: row.familyId, revokedAt: null },
          data: { revokedAt: new Date() },
        });
      }
      throw new UnauthorizedException("Invalid or expired refresh token");
    }

    if (row.expiresAt < new Date() || !row.user.isActive) {
      throw new UnauthorizedException("Invalid or expired refresh token");
    }

    await this.prisma.client.refreshToken.update({ where: { id: row.id }, data: { revokedAt: new Date() } });

    return this.issueSession(row.user.id, row.user.organizationId, row.user.role, row.user.email, row.user.name, row.familyId);
  }

  /** Revokes one refresh token (the one presented at logout) — server-side session end, not just client-side token deletion. */
  async logout(refreshToken: string): Promise<void> {
    const tokenHash = hashToken(refreshToken);
    await this.prisma.client.refreshToken.updateMany({
      where: { tokenHash, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  /** Revokes every refresh token for a user — "log out everywhere". */
  async revokeAllSessions(userId: string): Promise<void> {
    await this.prisma.client.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  /** `familyId` is omitted for a fresh login (starts a new chain, keyed by this token's own id) and passed through on refresh() (continues the existing chain). */
  private async issueSession(userId: string, organizationId: string, role: string, email: string, name: string | null, familyId?: string) {
    const accessToken = await this.jwt.signAsync({ sub: userId, organizationId, role, email });

    const refreshToken = randomBytes(32).toString("hex");
    const id = randomUUID();
    await this.prisma.client.refreshToken.create({
      data: {
        id,
        userId,
        tokenHash: hashToken(refreshToken),
        familyId: familyId ?? id,
        expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
      },
    });

    return { accessToken, refreshToken, user: { id: userId, email, name, role, organizationId } };
  }
}
