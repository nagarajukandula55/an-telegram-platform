import { IsString } from "class-validator";

export class ReplyConversationDto {
  @IsString()
  body!: string;
}
