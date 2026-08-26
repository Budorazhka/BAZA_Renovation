import { IsArray, IsOptional, IsString } from 'class-validator';

/**
 * teamApi.ts::update(id, payload) — HR-профильные поля ТОЛЬКО (роль/
 * менеджер/пароль не меняются здесь, см. TeamService.updateProfile
 * комментарий). Все поля опциональны — partial update, не заменяет
 * отсутствующее в payload на пусто (upsertFields делает $set только
 * переданных полей).
 */
export class UpdateTeamUserProfileDto {
  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  hireDate?: string;

  @IsOptional()
  @IsString()
  birthDate?: string;

  @IsOptional()
  @IsString()
  department?: string;

  @IsOptional()
  @IsString()
  city?: string;

  @IsOptional()
  @IsString()
  telegram?: string;

  @IsOptional()
  @IsString()
  aboutMe?: string;

  @IsOptional()
  @IsString()
  aboutCompany?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  skills?: string[];

  @IsOptional()
  @IsString()
  whatsapp?: string;

  @IsOptional()
  @IsString()
  vk?: string;

  @IsOptional()
  @IsString()
  instagram?: string;

  @IsOptional()
  @IsString()
  website?: string;
}
