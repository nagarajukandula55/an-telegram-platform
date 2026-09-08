import { IsIn } from "class-validator";

export class SetConversationStatusDto {
  @IsIn(["open", "pending", "closed"])
  status!: string;
}
