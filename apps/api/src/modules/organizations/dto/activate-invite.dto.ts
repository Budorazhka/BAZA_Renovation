import { IsString, MinLength } from 'class-validator';

export class ActivateInviteDto {
  @IsString()
  @MinLength(8)
  password!: string;
}
