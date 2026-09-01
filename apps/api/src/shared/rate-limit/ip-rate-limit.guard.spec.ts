import { HttpException } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import { IpRateLimitGuard } from './ip-rate-limit.guard';
import { RATE_LIMIT_METADATA_KEY, type RateLimitOptions } from './rate-limit.decorator';
import type { RedisRateLimiterService } from './redis-rate-limiter.service';

function makeContext(params: { ip: string; metadata?: RateLimitOptions }) {
  const headerSpy = jest.fn();
  const req = { ip: params.ip };
  const reply = { header: headerSpy };
  const context = {
    switchToHttp: () => ({
      getRequest: () => req,
      getResponse: () => reply,
    }),
    getHandler: () => ({}),
  } as unknown as ExecutionContext;
  return { context, headerSpy };
}

function makeReflector(metadata: RateLimitOptions | undefined) {
  return {
    get: (key: string) => (key === RATE_LIMIT_METADATA_KEY ? metadata : undefined),
  } as unknown as import('@nestjs/core').Reflector;
}

describe('IpRateLimitGuard.canActivate', () => {
  it('route без @RateLimit метадаты — пропускает без вызова limiter', async () => {
    const consume = jest.fn();
    const guard = new IpRateLimitGuard({ consume } as unknown as RedisRateLimiterService, makeReflector(undefined));
    const { context } = makeContext({ ip: '1.2.3.4' });

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(consume).not.toHaveBeenCalled();
  });

  it('лимит не превышен — пропускает, ключ строится из keyPrefix+IP', async () => {
    const consume = jest.fn().mockResolvedValue({ allowed: true, remaining: 9, retryAfterSeconds: 60 });
    const guard = new IpRateLimitGuard(
      { consume } as unknown as RedisRateLimiterService,
      makeReflector({ keyPrefix: 'auth-login', limit: 10, windowSeconds: 60 }),
    );
    const { context, headerSpy } = makeContext({ ip: '1.2.3.4' });

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(headerSpy).not.toHaveBeenCalled();
    expect(consume).toHaveBeenCalledWith({
      key: 'ratelimit:auth-login:ip:1.2.3.4',
      limit: 10,
      windowSeconds: 60,
    });
  });

  it('лимит превышен — бросает 429, выставляет Retry-After', async () => {
    const consume = jest.fn().mockResolvedValue({ allowed: false, remaining: 0, retryAfterSeconds: 42 });
    const guard = new IpRateLimitGuard(
      { consume } as unknown as RedisRateLimiterService,
      makeReflector({ keyPrefix: 'auth-login', limit: 10, windowSeconds: 60 }),
    );
    const { context, headerSpy } = makeContext({ ip: '1.2.3.4' });

    await expect(guard.canActivate(context)).rejects.toMatchObject({ status: 429 });
    expect(headerSpy).toHaveBeenCalledWith('Retry-After', '42');
  });

  it('Redis недоступен (consume бросает) — fail closed: 503, не пропускает запрос', async () => {
    const consume = jest.fn().mockRejectedValue(new Error('ECONNREFUSED'));
    const guard = new IpRateLimitGuard(
      { consume } as unknown as RedisRateLimiterService,
      makeReflector({ keyPrefix: 'auth-login', limit: 10, windowSeconds: 60 }),
    );
    const { context } = makeContext({ ip: '1.2.3.4' });

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(HttpException);
    await expect(guard.canActivate(context)).rejects.toMatchObject({ status: 503 });
  });
});
