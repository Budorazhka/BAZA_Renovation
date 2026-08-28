/**
 * D-04A: превращает УЖЕ провалидированную bbox-строку (см. IsBboxConstraint)
 * в числовой объект. Не валидирует сама — вызывающий код обязан пройти
 * ValidationPipe раньше (SearchPublicDevelopmentsQueryDto.bbox), иначе на
 * мусорной строке это бросит некорректный NaN-объект, не 400.
 */
export function parseBboxOrThrow(raw: string): { minLng: number; minLat: number; maxLng: number; maxLat: number } {
  const [minLng, minLat, maxLng, maxLat] = raw.split(',').map(Number) as [number, number, number, number];
  return { minLng, minLat, maxLng, maxLat };
}
