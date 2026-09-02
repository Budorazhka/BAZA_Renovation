export interface ParsedPolygon {
  type: 'Polygon';
  coordinates: [number, number][][];
}

/**
 * SEARCH-001: превращает УЖЕ провалидированную polygon-строку (см.
 * IsPolygonConstraint) в GeoJSON Polygon. Не валидирует сама — вызывающий
 * код обязан пройти ValidationPipe раньше (query.polygon), иначе на
 * мусорной строке это бросит некорректный NaN-объект, не 400. Ring
 * замыкается автоматически, если первая и последняя точка не совпадают —
 * стандартное поведение GeoJSON Polygon, Mongo $geoWithin требует замкнутый
 * ring, клиент не обязан присылать его уже замкнутым.
 */
export function parsePolygonOrThrow(raw: string): ParsedPolygon {
  const numbers = raw.split(',').map(Number);
  const points: [number, number][] = [];
  for (let i = 0; i < numbers.length; i += 2) {
    points.push([numbers[i]!, numbers[i + 1]!]);
  }

  const first = points[0]!;
  const last = points[points.length - 1]!;
  if (first[0] !== last[0] || first[1] !== last[1]) {
    points.push([first[0], first[1]]);
  }

  return { type: 'Polygon', coordinates: [points] };
}
