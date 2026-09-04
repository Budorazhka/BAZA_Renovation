import { IsIn, IsString, Matches, MaxLength } from 'class-validator';

const TARGET_TYPES = ['development', 'listing'] as const;

/**
 * Цель избранного: что именно сохраняют.
 *
 * `slug` ограничен алфавитом публикаций (строчные буквы, цифры, дефис): это не
 * защита от инъекции — Mongoose параметризует запрос сам, — а отсечение мусора
 * до базы, чтобы в коллекции не копились записи, которым заведомо не
 * соответствует ни одна публикация.
 */
export class FavoriteTargetDto {
  @IsIn(TARGET_TYPES)
  targetType!: (typeof TARGET_TYPES)[number];

  @IsString()
  @MaxLength(200)
  @Matches(/^[a-z0-9-]+$/, { message: 'slug: допустимы строчные латинские буквы, цифры и дефис' })
  slug!: string;
}
