import { IsArray, IsEmail, IsIn, IsMongoId, IsOptional, IsString, Length, MinLength } from 'class-validator';

export const FIXED_ROLES = ['owner', 'director', 'rop', 'manager', 'administrator', 'marketer'] as const;

/**
 * teamApi.ts::create(payload) — второй, отдельный от assignOccupant путь
 * создания сотрудника: руководитель сам задаёт password (не invite-token).
 * position (человекочитаемый title) НЕ принимается — backend не хранит
 * произвольный текст, только fixedRole enum (см. TeamService.
 * createOccupiedPosition комментарий).
 */
export class CreateTeamUserDto {
  @IsString()
  @Length(1, 200)
  name!: string;

  @IsIn(FIXED_ROLES)
  role!: (typeof FIXED_ROLES)[number];

  @IsOptional()
  @IsMongoId()
  managerId?: string;

  @IsEmail()
  loginEmail!: string;

  @IsString()
  @MinLength(8)
  password!: string;

  @IsOptional()
  @IsString()
  @Length(1, 40)
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
