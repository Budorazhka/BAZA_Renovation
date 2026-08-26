import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { FastifyRequest, FastifyReply } from 'fastify';

declare module 'fastify' {
  interface FastifyRequest {
    correlationId: string;
  }
}

/**
 * correlationId — сквозной идентификатор одной бизнес-операции через
 * API → outbox event → worker → side-effect (ADR-006, docs/operations/observability.md
 * раздел 5). Совпадает с requestId в error-ответах и с audit_events.correlationId.
 *
 * НЕ NestMiddleware (изначально был им, ИСПРАВЛЕНО) — найдено реальным
 * сетевым E2E-прогоном (не unit-тестом): второе мнение (Gemini) указало,
 * что этот middleware, зарегистрированный через consumer.apply() (middie
 * compat-слой, GitHub issue nestjs/nest#8837 — тот же баг, что уже
 * исправлен для TenantContextMiddleware/AdminContextMiddleware), пишет
 * req.correlationId на объекте, НЕ видимом дальше по цепочке — ошибочный
 * комментарий в app.module.ts утверждал обратное ("тот путь не подвержен
 * этой проблеме"), это предположение НЕ было проверено E2E-прогоном и
 * оказалось неверным. Прямое подтверждение: AuditEventDocument validation
 * failed: correlationId required — req.correlationId был undefined внутри
 * OrganizationsController.assignOccupant при реальном сетевом вызове.
 * Теперь регистрируется как нативный Fastify onRequest hook в main.api.ts,
 * симметрично Tenant/AdminContextMiddleware — та же причина, тот же фикс.
 *
 * reply.header(...) (не res.setHeader) — здесь параметр РЕАЛЬНО FastifyReply
 * (нативный hook получает настоящий Fastify-объект, не middie-обёрнутый
 * сырой Node response) — Fastify-специфичный API корректен и работает.
 */
@Injectable()
export class CorrelationIdMiddleware {
  use(req: FastifyRequest, reply: FastifyReply, next: () => void): void {
    const incoming = req.headers['x-correlation-id'];
    req.correlationId = typeof incoming === 'string' && incoming.length > 0 ? incoming : randomUUID();
    reply.header('x-correlation-id', req.correlationId);
    next();
  }
}
