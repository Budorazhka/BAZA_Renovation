import { IsPolygonConstraint } from './is-polygon.constraint';

describe('IsPolygonConstraint', () => {
  const constraint = new IsPolygonConstraint();

  it.each([
    ['треугольник, ring не замкнут (клиент не обязан замыкать сам)', '44,41,45,41,44.5,42'],
    ['четырёхугольник', '44,41,45,41,45,42,44,42'],
    ['уже замкнутый ring (первая точка повторена последней)', '44,41,45,41,44.5,42,44,41'],
  ])('валидная polygon-строка: %s', (_label, value) => {
    expect(constraint.validate(value)).toBe(true);
  });

  it.each([
    ['не строка', 41 as unknown as string],
    ['меньше 3 точек (4 числа)', '44,41,45,42'],
    ['нечётное количество чисел', '44,41,45,41,44.5'],
    ['пустой сегмент', '44,,45,41,44.5,42'],
    ['нечисловая часть', '44,a,45,41,44.5,42'],
    ['longitude вне диапазона', '-200,41,45,41,44.5,42'],
    ['latitude вне диапазона', '44,-100,45,41,44.5,42'],
    ['пустая строка', ''],
  ])('невалидная polygon-строка: %s', (_label, value) => {
    expect(constraint.validate(value)).toBe(false);
  });

  it('defaultMessage объясняет формат', () => {
    expect(constraint.defaultMessage()).toContain('lng1,lat1');
  });
});
