import { IsString } from "class-validator";

export class TranslateDto {
  @IsString()
  text!: string;

  @IsString()
  targetLanguage!: string;
}
