import { IsString, MinLength } from 'class-validator';

/**
 * OpenAPI v1-first-vertical-slice.yaml `/auth/login`: {login, password}.
 */
export class LoginRequestDto {
  @IsString()
  @MinLength(1)
  login!: string;

  @IsString()
  @MinLength(1)
  password!: string;
}
