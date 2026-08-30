import RedisMock from 'ioredis-mock';
import { RedisRateLimiterService } from './redis-rate-limiter.service';
import type { RedisService } from '../redis/redis.service';

function makeService(client: unknown = new RedisMock()): { service: RedisRateLimiterService } {
  const redisService = { client } as unknown as RedisService;
  return { service: new RedisRateLimiterService(redisService) };
}

describe('RedisRateLimiterService.consume', () => {
  it('первый запрос в окне — allowed:true, remaining уменьшен на 1', async () => {
    const { service } = makeService();

    const result = await service.consume({ key: 'test:key:1', limit: 5, windowSeconds: 60 });

    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(4);
  });

  it('N запросов подряд с limit=N — все allowed, N+1-й — заблокирован', async () => {
    const { service } = makeService();
    const key = 'test:key:2';

    for (let i = 0; i < 5; i++) {
      const result = await service.consume({ key, limit: 5, windowSeconds: 60 });
      expect(result.allowed).toBe(true);
    }

    const blocked = await service.consume({ key, limit: 5, windowSeconds: 60 });
    expect(blocked.allowed).toBe(false);
    expect(blocked.remaining).toBe(0);
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
  });

  it('конкурентные consume() на границе лимита — атомарность: ровно limit проходят, остальные блокируются', async () => {
    const { service } = makeService();
    const key = 'test:key:concurrent';
    const limit = 10;

    // 15 параллельных запросов на лимит 10 — атомарный Lua INCR+EXPIRE
    // гарантирует, что ровно 10 увидят allowed:true, не больше (race
    // была бы возможна, если бы INCR и проверка лимита не были атомарны).
    const results = await Promise.all(
      Array.from({ length: 15 }, () => service.consume({ key, limit, windowSeconds: 60 })),
    );

    const allowedCount = results.filter((r) => r.allowed).length;
    expect(allowedCount).toBe(limit);
  });

  it('окно истекает — новое окно снова разрешает запросы (fixed-window expiry)', async () => {
    const { service } = makeService();
    const key = 'test:key:3';

    // windowSeconds=1 — реальный TTL в ioredis-mock, ждём чуть больше окна.
    for (let i = 0; i < 3; i++) {
      await service.consume({ key, limit: 3, windowSeconds: 1 });
    }
    const blocked = await service.consume({ key, limit: 3, windowSeconds: 1 });
    expect(blocked.allowed).toBe(false);

    await new Promise((resolve) => setTimeout(resolve, 1100));

    const afterExpiry = await service.consume({ key, limit: 3, windowSeconds: 1 });
    expect(afterExpiry.allowed).toBe(true);
  }, 10_000);

  it('ошибка Redis-клиента пробрасывается наружу, не проглатывается (fail-closed решает вызывающий guard)', async () => {
    const failingClient = {
      eval: jest.fn().mockRejectedValue(new Error('ECONNREFUSED')),
    };
    const { service } = makeService(failingClient);

    await expect(service.consume({ key: 'test:key:4', limit: 5, windowSeconds: 60 })).rejects.toThrow(
      'ECONNREFUSED',
    );
  });
});
