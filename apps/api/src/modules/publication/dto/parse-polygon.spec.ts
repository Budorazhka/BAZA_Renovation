import { parsePolygonOrThrow } from './parse-polygon';

describe('parsePolygonOrThrow', () => {
  it('парсит открытый ring и замыкает его сама (первая точка добавлена в конец)', () => {
    expect(parsePolygonOrThrow('44,41,45,41,44.5,42')).toEqual({
      type: 'Polygon',
      coordinates: [[[44, 41], [45, 41], [44.5, 42], [44, 41]]],
    });
  });

  it('уже замкнутый ring не дублирует последнюю точку', () => {
    expect(parsePolygonOrThrow('44,41,45,41,44.5,42,44,41')).toEqual({
      type: 'Polygon',
      coordinates: [[[44, 41], [45, 41], [44.5, 42], [44, 41]]],
    });
  });
});
