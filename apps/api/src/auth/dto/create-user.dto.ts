import { IsEmail, IsIn, IsOptional, IsString, MinLength } from "class-validator";
import type { OrgRole } from "@an-tg/database";

const ROLES: OrgRole[] = ["TENANT_ADMIN", "MANAGER", "CAMPAIGN_MANAGER", "OPERATOR", "AGENT", "DEVELOPER", "AUDITOR", "READ_ONLY"];

export class CreateUserDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(8)
  password!: string;

  @IsOptional()
  @IsString()
  name?: string;

  @IsIn(ROLES)
  role!: OrgRole;
}
