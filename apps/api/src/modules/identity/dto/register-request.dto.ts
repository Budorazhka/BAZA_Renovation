import { IsString, MinLength } from 'class-validator';

/**
 * OpenAPI v1-first-vertical-slice.yaml `/auth/register`: {login, password}.
 * minLength:8 на password — тот же порог, что OpenAPI-контракт специфицирует.
 */
export class RegisterRequestDto {
  @IsString()
  @MinLength(1)
  login!: string;

  @IsString()
  @MinLength(8)
  password!: string;
}
