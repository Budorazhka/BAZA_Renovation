import { IsString, Length } from 'class-validator';

export class CreateSectionDto {
  @IsString()
  @Length(1, 200)
  name!: string;
}
