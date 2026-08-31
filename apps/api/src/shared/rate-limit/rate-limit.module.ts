import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { RedisModule } from '../redis/redis.module';
import { RedisRateLimiterService } from './redis-rate-limiter.service';
import { RedisRateLimitGuard } from './redis-rate-limit.guard';

@Module({
  imports: [ConfigModule, RedisModule],
  providers: [RedisRateLimiterService, RedisRateLimitGuard],
  exports: [RedisRateLimiterService, RedisRateLimitGuard],
})
export class RateLimitModule {}
