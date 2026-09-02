import { IsIn, IsMongoId, IsObject, IsOptional, IsString, Length } from 'class-validator';
import { FIXED_ROLES } from './create-team-user.dto';

/**
 * teamApi.ts::createAccountSlot(payload) — «Добавить слот менеджера»:
 * вакантная позиция без occupant'а (POST /team-users/positions). role →
 * fixedRole, тот же enum, что CreateTeamUserDto.role. managerId →
 * parentPositionId, тот же паттерн, что create()/move().
 *
 * `position` (человекочитаемый title) и `accessProfile` (сериализованный
 * PermissionMap) объявлены здесь ТОЛЬКО чтобы не упасть на глобальном
 * ValidationPipe({forbidNonWhitelisted:true}) — ERP реально отправляет оба
 * поля (PersonnelPage.tsx::handleAddManagerSlot). Backend их НЕ сохраняет:
 * `position` — тот же честный пробел, что у CreateTeamUserDto (позиция не
 * хранит произвольный текст, только fixedRole enum); `accessProfile` —
 * единственный существующий способ выдать grant, OrganizationsService.
 * grantPositionPermission, выдаёт один grant за вызов, не bulk-набор
 * произвольной формы — изобретать новую bulk-grant-модель ради одного
 * поля этого прохода не входит в задачу (см. TeamService.createVacantSlot).
 * Позиция получает только DEFAULT_ROLE_GRANTS[fixedRole] — тот же
 * стартовый набор, что и обычное создание позиции.
 */
export class CreateTeamAccountSlotDto {
  @IsIn(FIXED_ROLES)
  role!: (typeof FIXED_ROLES)[number];

  @IsOptional()
  @IsString()
  @Length(0, 200)
  position?: string;

  @IsOptional()
  @IsMongoId()
  managerId?: string | null;

  @IsOptional()
  @IsObject()
  accessProfile?: Record<string, string>;
}
