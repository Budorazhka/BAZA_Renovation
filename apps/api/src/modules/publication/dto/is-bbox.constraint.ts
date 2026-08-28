import { ValidatorConstraint, type ValidatorConstraintInterface } from 'class-validator';

/**
 * D-04A: bbox query-параметр — "minLng,minLat,maxLng,maxLat". Раньше
 * невалидный bbox молча игнорировался (parseBbox возвращал undefined,
 * фильтр просто не применялся) — задача явно требует не глотать невалидные
 * фильтры молча, поэтому теперь это 400 через ValidationPipe, не тихий
 * no-op. Отдельно от parseBboxOrThrow (parse-bbox.ts) — этот класс только
 * отвечает "валидна ли строка", парсинг уже валидной строки в числа не его
 * ответственность.
 */
@ValidatorConstraint({ name: 'isBbox', async: false })
export class IsBboxConstraint implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    if (typeof value !== 'string') return false;
    const parts = value.split(',');
    if (parts.length !== 4) return false;
    // Пустой сегмент ("44,,45,42") должен провалиться явно — Number('') === 0,
    // без этой проверки такой bbox тихо стал бы {minLat: 0}.
    if (parts.some((part) => part.trim() === '')) return false;
    const numbers = parts.map(Number);
    if (numbers.some((n) => Number.isNaN(n))) return false;

    const [minLng, minLat, maxLng, maxLat] = numbers as [number, number, number, number];
    if (minLng < -180 || minLng > 180 || maxLng < -180 || maxLng > 180) return false;
    if (minLat < -90 || minLat > 90 || maxLat < -90 || maxLat > 90) return false;
    if (minLng >= maxLng || minLat >= maxLat) return false;

    return true;
  }

  defaultMessage(): string {
    return 'bbox должен быть "minLng,minLat,maxLng,maxLat": 4 числа, longitude∈[-180,180], latitude∈[-90,90], minLng<maxLng, minLat<maxLat';
  }
}
