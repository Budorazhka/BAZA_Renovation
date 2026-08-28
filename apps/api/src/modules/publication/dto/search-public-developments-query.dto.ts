import { Type } from 'class-transformer';
import { IsInt, IsMongoId, IsOptional, IsString, Max, Min, Validate } from 'class-validator';
import { IsBboxConstraint } from './is-bbox.constraint';

// Синхронизировано с docs/api/v1-first-vertical-slice.yaml Limit-параметром
// (default:20, maximum:100) — не менять по отдельности.
export const DEFAULT_LIST_LIMIT = 20;
export const MAX_LIST_LIMIT = 100;

/**
 * D-04A: query-фильтры GET /public/developments. Тот же паттерн, что
 * ListUnitsQueryDto (apps/api/src/modules/developments/dto) — глобальный
 * ValidationPipe({whitelist:true, forbidNonWhitelisted:true, transform:true})
 * отклоняет любое поле вне этого класса и любое невалидное значение с 400
 * ДО входа в контроллер, не post-hoc проверка внутри метода. cursor через
 * @IsMongoId — раньше `new Types.ObjectId(cursor)` на мусорной строке кидал
 * необработанный BSONError (500), теперь невалидный cursor 400 через
 * ValidationPipe, контроллер до new ObjectId() уже не доходит на плохом вводе.
 */
export class SearchPublicDevelopmentsQueryDto {
  @IsOptional()
  @IsString()
  city?: string;

  @IsOptional()
  @IsMongoId()
  cursor?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_LIST_LIMIT)
  limit: number = DEFAULT_LIST_LIMIT;

  @IsOptional()
  @Validate(IsBboxConstraint)
  bbox?: string;
}
