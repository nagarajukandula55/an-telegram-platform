import { IsOptional, IsString } from "class-validator";

export class AssignConversationDto {
  /** Omit (or null) to unassign. */
  @IsOptional()
  @IsString()
  userId?: string | null;
}
