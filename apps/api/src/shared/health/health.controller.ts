import { Controller, Get, HttpCode, ServiceUnavailableException } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import type { Connection } from 'mongoose';

/**
 * docs/operations/observability.md раздел 3.
 * /health — liveness (процесс жив). /health/ready — readiness (Mongo+Redis reachable).
 */
@Controller('health')
export class HealthController {
  constructor(@InjectConnection() private readonly mongoConnection: Connection) {}

  @Get()
  @HttpCode(200)
  liveness(): { status: 'ok' } {
    return { status: 'ok' };
  }

  @Get('ready')
  async readiness(): Promise<{ status: 'ok' }> {
    if (this.mongoConnection.readyState !== 1) {
      throw new ServiceUnavailableException('MongoDB not ready');
    }
    // Redis-проверка добавляется вместе с BullMQ-интеграцией (C-08 outbox worker),
    // не входит в этот первый проход API skeleton — намеренно, не забыто.
    return { status: 'ok' };
  }
}
