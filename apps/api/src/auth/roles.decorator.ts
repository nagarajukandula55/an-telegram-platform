import { SetMetadata } from "@nestjs/common";
import type { OrgRole } from "@an-tg/database";

export const ROLES_KEY = "roles";
export const Roles = (...roles: OrgRole[]) => SetMetadata(ROLES_KEY, roles);
