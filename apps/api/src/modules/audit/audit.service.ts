import { Injectable, Logger } from '@nestjs/common';
import { ClientSession, Types } from 'mongoose';
import { AuditEventRepository } from './repository/audit-event.repository';
import type { AuditActorType } from './schemas/audit-event.schema';

// master plan разд.6.3: audit payload не содержит password/token/provider secret.
// Список ключей, которые НИКОГДА не должны попасть в before/after — defense
// in depth поверх дисциплины вызывающего кода (который и так не должен их
// передавать), но ошибка возможна, поэтому проверяем явно здесь. Значения
// уже в lowercase — сравнение case-insensitive (findForbiddenKeys ниже),
// `Password`/`PASSWORD` не должны обходить проверку регистром.
const FORBIDDEN_PAYLOAD_KEYS = new Set([
  'password',
  'passwordhash',
  'token',
  'tokenhash',
  'refreshtoken',
  'secret',
  'providertoken',
  'apikey',
]);

/**
 * Рекурсивный обход payload — плоская top-level проверка пропускала бы
 * секрет на второй и глубже уровне вложенности (`{assignment: {session:
 * {tokenHash}}}}`), найдено ревью. Возвращает dot-path каждого найденного
 * ключа для полезного лог-сообщения, не просто голое имя ключа.
 */
function findForbiddenKeys(value: unknown, path: string[] = []): string[] {
  if (value === null || typeof value !== 'object') return [];
  // ObjectId/Date — валидные листовые значения в audit payload (например,
  // resourceId), не plain-object'ы для рекурсии — обход их внутренних полей
  // бессмысленен и создаёт шумные dot-path в логе при находке (которой там
  // никогда не будет).
  if (value instanceof Types.ObjectId || value instanceof Date) return [];

  const found: string[] = [];
  for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
    const currentPath = [...path, key];
    if (FORBIDDEN_PAYLOAD_KEYS.has(key.toLowerCase())) {
      found.push(currentPath.join('.'));
    }
    found.push(...findForbiddenKeys(nested, currentPath));
  }
  return found;
}

export interface AppendAuditEventParams {
  actor: { type: AuditActorType; id?: Types.ObjectId };
  action: string;
  resource: string;
  resourceId: Types.ObjectId;
  reason?: string;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
  correlationId: string;
}

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly auditEventRepository: AuditEventRepository) {}

  /**
   * ADR-006: пишется в ТОЙ ЖЕ транзакции, что бизнес-изменение — вызывающий
   * код обязан передать session, полученную из runInTransaction. Без session
   * запись всё равно происходит (audit не должен блокировать нетранзакционные
   * пути), но теряет атомарность с бизнес-изменением — намеренный компромисс
   * для read-only/некритичных действий, не для critical actions
   * (permission-matrix.md раздел 4), которые обязаны передавать session.
   */
  async append(params: AppendAuditEventParams, session?: ClientSession): Promise<void> {
    this.assertNoSecrets(params.before, 'before');
    this.assertNoSecrets(params.after, 'after');

    await this.auditEventRepository.append(params, session);
  }

  private assertNoSecrets(payload: Record<string, unknown> | undefined, field: 'before' | 'after'): void {
    if (!payload) return;
    const found = findForbiddenKeys(payload);
    if (found.length > 0) {
      // Бросаем, а не молча фильтруем — вызывающий код должен явно исключить
      // эти поля до вызова append(), не полагаться на то, что audit-слой
      // "почистит за него". Тихая фильтрация замаскировала бы программную
      // ошибку, из-за которой секрет вообще попал в объект для аудита.
      this.logger.error(`Попытка записать запрещённые ключи в audit ${field}: ${found.join(', ')}`);
      throw new Error(
        `AuditService.append: ${field} содержит запрещённые ключи (${found.join(', ')}) — master plan разд.6.3`,
      );
    }
  }
}
