import { HttpException } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import { RedisRateLimitGuard } from './redis-rate-limit.guard';
import type { RedisRateLimiterService } from './redis-rate-limiter.service';

function makeContext(params: { ip: string; slug: string }) {
  const headerSpy = jest.fn();
  const req = { ip: params.ip, params: { slug: params.slug } };
  const reply = { header: headerSpy };
  const context = {
    switchToHttp: () => ({
      getRequest: () => req,
      getResponse: () => reply,
    }),
  } as unknown as ExecutionContext;
  return { context, headerSpy };
}

function makeConfig(overrides: Record<string, number> = {}) {
  return { get: (key: string) => overrides[key] } as unknown as import('@nestjs/config').ConfigService;
}

describe('RedisRateLimitGuard.canActivate', () => {
  it('оба лимита (IP + listing) не превышены — пропускает, не выставляет Retry-After', async () => {
    const consume = jest.fn().mockResolvedValue({ allowed: true, remaining: 4, retryAfterSeconds: 60 });
    const guard = new RedisRateLimitGuard({ consume } as unknown as RedisRateLimiterService, makeConfig());
    const { context, headerSpy } = makeContext({ ip: '1.2.3.4', slug: 'test-slug' });

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(headerSpy).not.toHaveBeenCalled();
    expect(consume).toHaveBeenCalledWith(
      expect.objectContaining({ key: 'ratelimit:reveal-contact:ip:1.2.3.4' }),
    );
    expect(consume).toHaveBeenCalledWith(
      expect.objectContaining({ key: 'ratelimit:reveal-contact:listing:test-slug' }),
    );
  });

  it('IP-лимит превышен — бросает 429, выставляет Retry-After', async () => {
    const consume = jest
      .fn()
      .mockImplementation(async ({ key }: { key: string }) =>
        key.includes(':ip:')
          ? { allowed: false, remaining: 0, retryAfterSeconds: 42 }
          : { allowed: true, remaining: 10, retryAfterSeconds: 60 },
      );
    const guard = new RedisRateLimitGuard({ consume } as unknown as RedisRateLimiterService, makeConfig());
    const { context, headerSpy } = makeContext({ ip: '1.2.3.4', slug: 'test-slug' });

    await expect(guard.canActivate(context)).rejects.toMatchObject({ status: 429 });
    expect(headerSpy).toHaveBeenCalledWith('Retry-After', '42');
  });

  it('listing-лимит превышен (IP в норме) — тоже бросает 429 (строжайший из двух)', async () => {
    const consume = jest
      .fn()
      .mockImplementation(async ({ key }: { key: string }) =>
        key.includes(':listing:')
          ? { allowed: false, remaining: 0, retryAfterSeconds: 17 }
          : { allowed: true, remaining: 10, retryAfterSeconds: 60 },
      );
    const guard = new RedisRateLimitGuard({ consume } as unknown as RedisRateLimiterService, makeConfig());
    const { context, headerSpy } = makeContext({ ip: '1.2.3.4', slug: 'test-slug' });

    await expect(guard.canActivate(context)).rejects.toMatchObject({ status: 429 });
    expect(headerSpy).toHaveBeenCalledWith('Retry-After', '17');
  });

  it('Redis недоступен (consume бросает) — fail closed: 503, не пропускает запрос', async () => {
    const consume = jest.fn().mockRejectedValue(new Error('ECONNREFUSED'));
    const guard = new RedisRateLimitGuard({ consume } as unknown as RedisRateLimiterService, makeConfig());
    const { context } = makeContext({ ip: '1.2.3.4', slug: 'test-slug' });

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(HttpException);
    await expect(guard.canActivate(context)).rejects.toMatchObject({ status: 503 });
  });
});
