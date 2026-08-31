import { parseTrustProxy } from './parse-trust-proxy';

/**
 * Security review: без trustProxy req.ip за reverse proxy — адрес самого
 * прокси, один и тот же для всех гостей, схлопывает per-IP rate limit
 * (IpRateLimitGuard/RedisRateLimitGuard) в один общий лимит на платформу.
 */
describe('parseTrustProxy', () => {
  it('unset — false (нет reverse proxy, локальная разработка)', () => {
    expect(parseTrustProxy(undefined)).toBe(false);
  });

  it('пустая строка — false', () => {
    expect(parseTrustProxy('')).toBe(false);
  });

  it('строка "false" — false', () => {
    expect(parseTrustProxy('false')).toBe(false);
  });

  it('одиночный IP — массив из одного элемента', () => {
    expect(parseTrustProxy('10.0.0.5')).toEqual(['10.0.0.5']);
  });

  it('список через запятую с пробелами — массив без пустых элементов, обрезанный', () => {
    expect(parseTrustProxy('10.0.0.5, 172.16.0.0/12 ,')).toEqual(['10.0.0.5', '172.16.0.0/12']);
  });
});
