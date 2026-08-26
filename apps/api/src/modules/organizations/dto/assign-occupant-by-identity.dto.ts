import { IsMongoId, IsString, Length } from 'class-validator';

/**
 * OrganizationsController.assignOccupant (identityId-путь) — существующий,
 * уже сданный API-контракт: вызывающий код уже знает identityId (не через
 * teamApi.ts, у того свой email-based контракт, см. assign-occupant.dto.ts
 * в TeamController). Разделены на два класса, не один общий DTO — разные
 * поля, разная валидация, разный источник вызова.
 */
export class AssignOccupantByIdentityDto {
  @IsMongoId()
  identityId!: string;

  @IsString()
  @Length(1, 200)
  occupantDisplayName!: string;
}
