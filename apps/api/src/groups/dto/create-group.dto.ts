import { IsOptional, IsString } from "class-validator";

export class CreateGroupDto {
  @IsString()
  connectorId!: string;

  /** Exact Telegram chat/group display name — see Group.providerGroupId doc-comment. */
  @IsString()
  name!: string;

  @IsOptional()
  @IsString()
  alias?: string;
}
