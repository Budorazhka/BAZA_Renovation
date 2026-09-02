import { IsArray, IsEmail, IsIn, IsMongoId, IsOptional, IsString, Length, MinLength } from 'class-validator';

export const FIXED_ROLES = ['owner', 'director', 'rop', 'manager', 'administrator', 'marketer'] as const;

/**
 * teamApi.ts::create(payload) — второй, отдельный от assignOccupant путь
 * создания сотрудника: руководитель сам задаёт password (не invite-token).
 *
 * `position` (человекочитаемый title) и `email` объявлены здесь ТОЛЬКО
 * чтобы не упасть на глобальном ValidationPipe({forbidNonWhitelisted:true})
 * — ERP реально отправляет оба поля (PersonnelPage.tsx::handleAdd). До
 * этого исправления (найдено 03.09.2026 при закрытии backend-хвостов
 * TEAM-001) их отсутствие в DTO означало 400 VALIDATION_FAILED на КАЖДЫЙ
 * вызов создания сотрудника — форма была полностью нерабочей, а
 * предыдущий комментарий («НЕ принимается») ошибочно читался как «поле
 * необязательно», а не как «весь запрос отклоняется». Backend их не
 * сохраняет: `position` — тот же честный пробел, что у
 * CreateTeamAccountSlotDto (Position не хранит произвольный текст, только
 * fixedRole enum); `email` дублирует `loginEmail` без дополнительного
 * смысла на этом эндпоинте.
 */
export class CreateTeamUserDto {
  @IsString()
  @Length(1, 200)
  name!: string;

  @IsIn(FIXED_ROLES)
  role!: (typeof FIXED_ROLES)[number];

  @IsOptional()
  @IsString()
  @Length(0, 200)
  position?: string;

  @IsOptional()
  @IsMongoId()
  managerId?: string;

  @IsEmail()
  loginEmail!: string;

  @IsOptional()
  @IsEmail()
  email?: string;

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
