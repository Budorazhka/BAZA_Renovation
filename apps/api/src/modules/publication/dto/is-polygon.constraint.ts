import { ValidatorConstraint, type ValidatorConstraintInterface } from 'class-validator';

/**
 * SEARCH-001: polygon query-параметр — плоская CSV-строка
 * "lng1,lat1,lng2,lat2,...,lngN,latN", минимум 3 точки (6 чисел), чётное
 * количество чисел. Тот же паттерн, что IsBboxConstraint (is-bbox.constraint.ts):
 * невалидная строка не должна молча игнорироваться — 400 через
 * ValidationPipe, не тихий no-op. Самопересечение ring НЕ проверяется здесь —
 * это уже сложнее MVP, Mongo $geoWithin сам упадёт с понятной ошибкой на
 * невалидной геометрии, этого достаточно.
 */
@ValidatorConstraint({ name: 'isPolygon', async: false })
export class IsPolygonConstraint implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    if (typeof value !== 'string') return false;
    const parts = value.split(',');
    // Верхняя граница (найдено 03.09.2026 внешним ревью): без нее полигон на
    // тысячи точек грузит CPU MongoDB на $geoWithin практически неограниченно
    // (algorithmic DoS через публичный, неавторизованный поиск). 400 точек —
    // с большим запасом на любой реалистичный контур района/города.
    if (parts.length < 6 || parts.length % 2 !== 0 || parts.length > 400) return false;
    // Пустой сегмент ("44,,45,42,46,43") должен провалиться явно — Number('') === 0,
    // без этой проверки такая точка тихо стала бы {lat: 0}.
    if (parts.some((part) => part.trim() === '')) return false;
    const numbers = parts.map(Number);
    if (numbers.some((n) => Number.isNaN(n))) return false;

    for (let i = 0; i < numbers.length; i += 2) {
      const lng = numbers[i]!;
      const lat = numbers[i + 1]!;
      if (lng < -180 || lng > 180) return false;
      if (lat < -90 || lat > 90) return false;
    }

    return true;
  }

  defaultMessage(): string {
    return 'polygon должен быть чётным списком чисел "lng1,lat1,...,lngN,latN", от 3 до 200 точек (6..400 чисел), longitude∈[-180,180], latitude∈[-90,90]';
  }
}
