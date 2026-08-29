import { IsInt, IsOptional, IsString } from "class-validator";

export class StartMtprotoLoginDto {
  @IsInt()
  apiId!: number;

  @IsString()
  apiHash!: string;

  @IsString()
  phoneNumber!: string;
}

export class SubmitMtprotoCodeDto {
  @IsString()
  loginAttemptId!: string;

  @IsString()
  code!: string;
}

export class SubmitMtprotoPasswordDto {
  @IsString()
  loginAttemptId!: string;

  @IsString()
  password!: string;
}

export class FinalizeMtprotoConnectorDto {
  @IsString()
  loginAttemptId!: string;

  @IsString()
  sessionString!: string;

  @IsString()
  name!: string;

  @IsOptional()
  isPrimary?: boolean;
}
