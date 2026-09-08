import { Body, Controller, Get, Post, UseGuards } from "@nestjs/common";
import { AuthService } from "./auth.service";
import { LoginDto } from "./dto/login.dto";
import { RegisterDto } from "./dto/register.dto";
import { CreateUserDto } from "./dto/create-user.dto";
import { RefreshDto } from "./dto/refresh.dto";
import { JwtAuthGuard } from "./jwt-auth.guard";
import { RolesGuard } from "./roles.guard";
import { Roles } from "./roles.decorator";
import { CurrentUser, CurrentUserPayload } from "../common/current-user.decorator";

@Controller("auth")
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post("login")
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto.email, dto.password);
  }

  @Post("register")
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  /** Exchanges a still-valid refresh token for a new access+refresh token pair (rotates the refresh token). */
  @Post("refresh")
  refresh(@Body() dto: RefreshDto) {
    return this.authService.refresh(dto.refreshToken);
  }

  /** Revokes the presented refresh token server-side — actual session end, not just deleting the token client-side. */
  @Post("logout")
  async logout(@Body() dto: RefreshDto) {
    await this.authService.logout(dto.refreshToken);
    return { ok: true };
  }

  /** Revokes every refresh token for the caller — "log out on all devices". */
  @UseGuards(JwtAuthGuard)
  @Post("logout-all")
  async logoutAll(@CurrentUser() user: CurrentUserPayload) {
    await this.authService.revokeAllSessions(user.userId);
    return { ok: true };
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("TENANT_ADMIN", "SUPER_ADMIN")
  @Post("users")
  createUser(@Body() dto: CreateUserDto, @CurrentUser() user: CurrentUserPayload) {
    return this.authService.createUser(user.organizationId, dto);
  }

  /** Lightweight team roster — used for assigning conversations, not gated to admins since any teammate needs to see who they can assign to. */
  @UseGuards(JwtAuthGuard)
  @Get("users")
  listUsers(@CurrentUser() user: CurrentUserPayload) {
    return this.authService.listUsers(user.organizationId);
  }
}
