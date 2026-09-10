import { Injectable, Logger } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { ClientSession, Connection, Types } from 'mongoose';
import type { MoneyAmount } from '@baza/contracts';
import { AppException } from '../../shared/errors/app-exception';
import { ErrorCode } from '../../shared/errors/error-codes';
import { runInTransaction } from '../../shared/transactions/run-in-transaction';
import { IdempotencyService, type IdempotentReplay } from '../../shared/idempotency/idempotency.service';
import { AuditService } from '../audit/audit.service';
import { CrmService } from '../crm/crm.service';
import type { DealDocument } from '../crm/schemas/deal.schema';
import { DevelopmentsService } from '../developments/developments.service';
import { OutboxService } from '../outbox/outbox.service';
import { BookingRepository } from './repository/booking.repository';
import { BookingLockRepository } from './repository/booking-lock.repository';
import type { BookingDocument, BookingStatus } from './schemas/booking.schema';

export interface BookingResponse {
  id: string;
  unitId: string;
  organizationId: string;
  leadId: string | null;
  dateRange: { startsAt: string; expiresAt: string };
  status: string;
  manager: string;
  createdAt: string;
}

@Injectable()
export class BookingsService {
  private readonly logger = new Logger(BookingsService.name);

  constructor(
    @InjectConnection() private readonly connection: Connection,
    private readonly bookingRepository: BookingRepository,
    private readonly bookingLockRepository: BookingLockRepository,
    private readonly developmentsService: DevelopmentsService,
    private readonly crmService: CrmService,
    private readonly auditService: AuditService,
    private readonly outboxService: OutboxService,
    private readonly idempotencyService: IdempotencyService,
  ) {}

  async book(params: {
    unitId: Types.ObjectId;
    organizationId: Types.ObjectId;
    leadId?: Types.ObjectId;
    managerPositionId: Types.ObjectId;
    actorIdentityId: Types.ObjectId;
    startsAt: Date;
    expiresAt: Date;
    idempotencyKey: string;
    correlationId: string;
  }): Promise<BookingDocument | { replay: IdempotentReplay }> {
    if (
      Number.isNaN(params.startsAt.getTime()) ||
      Number.isNaN(params.expiresAt.getTime()) ||
      params.startsAt >= params.expiresAt
    ) {
      throw new AppException(ErrorCode.VALIDATION_FAILED, 'Booking startsAt must be before expiresAt');
    }

    // Tenant-scoped existence checks happen before the transaction. The
    // transaction itself still starts with BookingLock.bumpForUnit as its
    // first database write, as required by ADR-006.
    const unit = await this.developmentsService.getUnitForOrganization(params.unitId, params.organizationId);
    if (unit.status === 'sold') {
      throw new AppException(ErrorCode.BOOKING_OVERLAP, 'Cannot book sold unit');
    }
    if (params.leadId) {
      await this.crmService.getLeadForOrganization(params.leadId, params.organizationId);
    }

    const requestBody = this.requestBody(params);
    try {
      return await runInTransaction(this.connection, async (session) => {
        await this.bookingLockRepository.bumpForUnit(params.unitId, session);

        // A concurrent request with the same key can only become visible after
        // the lock conflict/retry. Check again after acquiring the lock so it
        // replays the winner instead of being misreported as BOOKING_OVERLAP.
        const replay = await this.idempotencyService.checkReplay({
          identityId: params.actorIdentityId,
          operation: 'createBooking',
          key: params.idempotencyKey,
          requestBody,
        });
        if (replay) {
          return { replay };
        }

        const overlap = await this.bookingRepository.findOverlappingActive(
          params.unitId,
          params.startsAt,
          params.expiresAt,
          session,
        );
        if (overlap) {
          throw new AppException(ErrorCode.BOOKING_OVERLAP, 'Unit already has an overlapping active booking');
        }

        const booking = await this.bookingRepository.create(
          {
            unitId: params.unitId,
            organizationId: params.organizationId,
            leadId: params.leadId,
            dateRange: { startsAt: params.startsAt, expiresAt: params.expiresAt },
            manager: params.managerPositionId,
          },
          session,
        );

        // Юнит перечитывается в снимке транзакции (после BookingLock): CAS
        // ниже идёт по его version. До 11.09 использовался юнит, прочитанный
        // до транзакции, и modifiedCount не проверялся — если version успела
        // вырасти (пакетное изменение цен), CAS молча не срабатывал: бронь
        // создана, а юнит оставался available на витрине. Теперь промах
        // откатывает бронь целиком.
        const unitInTx = await this.developmentsService.getUnitForOrganization(
          params.unitId,
          params.organizationId,
          session,
        );
        if (unitInTx.status === 'sold') {
          throw new AppException(ErrorCode.BOOKING_OVERLAP, 'Cannot book sold unit');
        }
        if (unitInTx.status === 'available') {
          const { modifiedCount } = await this.developmentsService.updateUnitStatusInSession(
            unitInTx._id,
            params.organizationId,
            unitInTx.version,
            'reserved',
            ['available'],
            session,
          );
          if (modifiedCount === 0) {
            throw new AppException(
              ErrorCode.VERSION_CONFLICT,
              `Unit ${unitInTx._id.toString()} was modified concurrently while booking it`,
            );
          }

          await this.outboxService.publish(
            {
              eventType: 'UnitStatusChanged',
              aggregateId: unitInTx._id,
              aggregateType: 'unit',
              deduplicationKey: `unit:${unitInTx._id.toString()}:status:reserved:${booking._id.toString()}`,
              payload: {
                unitId: unitInTx._id,
                organizationId: params.organizationId,
                buildingId: unitInTx.buildingId,
                previousStatus: 'available',
                newStatus: 'reserved',
              },
            },
            session,
          );
        }

        const response = toBookingResponse(booking) as unknown as Record<string, unknown>;

        await this.outboxService.publish(
          {
            eventType: 'BookingCreated',
            aggregateId: booking._id,
            aggregateType: 'booking',
            deduplicationKey: `booking:${booking._id.toString()}:created`,
            payload: {
              bookingId: booking._id,
              unitId: booking.unitId,
              organizationId: booking.organizationId,
              leadId: booking.leadId ?? null,
              manager: booking.manager,
              startsAt: booking.dateRange.startsAt,
              expiresAt: booking.dateRange.expiresAt,
              status: booking.status,
            },
          },
          session,
        );

        await this.auditService.append(
          {
            actor: { type: 'identity', id: params.actorIdentityId },
            action: 'booking.create',
            resource: 'booking',
            resourceId: booking._id,
            correlationId: params.correlationId,
            after: {
              unitId: booking.unitId,
              organizationId: booking.organizationId,
              leadId: booking.leadId ?? null,
              manager: booking.manager,
              dateRange: {
                startsAt: booking.dateRange.startsAt,
                expiresAt: booking.dateRange.expiresAt,
              },
              status: booking.status,
            },
          },
          session,
        );

        await this.idempotencyService.record(
          {
            identityId: params.actorIdentityId,
            operation: 'createBooking',
            key: params.idempotencyKey,
            requestBody,
            responseStatus: 201,
            responseBody: response,
          },
          session,
        );

        return booking;
      });
    } catch (error: unknown) {
      // A same identity/operation/key used concurrently for different units
      // cannot be serialized by the per-unit lock. The unique idempotency
      // index is the final arbiter; replay the winner after its transaction
      // commits instead of leaking a raw duplicate-key error.
      if (!isDuplicateKeyError(error)) {
        throw error;
      }
      const replay = await this.idempotencyService.awaitReplay({
        identityId: params.actorIdentityId,
        operation: 'createBooking',
        key: params.idempotencyKey,
        requestBody,
      });
      if (replay) {
        return { replay };
      }
      throw new AppException(
        ErrorCode.IDEMPOTENCY_KEY_CONFLICT,
        'Idempotency-Key was concurrently claimed but its response is unavailable',
      );
    }
  }

  /**
   * BOOK-002: GET /bookings — unitId побеждает buildingId побеждает
   * developmentId, если клиент прислал несколько (самый специфичный
   * фильтр выигрывает, не пересечение множеств) — см. DevelopmentsService.
   * listUnitIdsForBuilding/listUnitIdsForDevelopment докстринг для того,
   * почему это идёт через DevelopmentsService, а не напрямую в
   * UnitRepository. managerPositionId — own-scope сужение
   * (BookingsController.ownerFilterForAction), тот же паттерн, что
   * confirmBooking.requiredManagerPositionId.
   */
  async listBookings(params: {
    organizationId: Types.ObjectId;
    developmentId?: Types.ObjectId;
    buildingId?: Types.ObjectId;
    unitId?: Types.ObjectId;
    status?: BookingStatus;
    managerPositionId?: Types.ObjectId;
    cursor?: Types.ObjectId;
    limit: number;
  }): Promise<BookingDocument[]> {
    let unitIds: Types.ObjectId[] | undefined;
    let unitId: Types.ObjectId | undefined;

    if (params.unitId) {
      // Non-disclosure: чужой/несуществующий unitId — единый 404, тот же
      // принцип, что остальные tenant-scoped lookup'ы этого сервиса.
      await this.developmentsService.getUnitForOrganization(params.unitId, params.organizationId);
      unitId = params.unitId;
    } else if (params.buildingId) {
      unitIds = await this.developmentsService.listUnitIdsForBuilding(params.buildingId, params.organizationId);
    } else if (params.developmentId) {
      unitIds = await this.developmentsService.listUnitIdsForDevelopment(params.developmentId, params.organizationId);
    }

    return this.bookingRepository.listForOrganization(params.organizationId, {
      unitId,
      unitIds,
      status: params.status,
      managerPositionId: params.managerPositionId,
      cursor: params.cursor,
      limit: params.limit,
    });
  }

  private requestBody(params: {
    unitId: Types.ObjectId;
    leadId?: Types.ObjectId;
    startsAt: Date;
    expiresAt: Date;
  }): Record<string, unknown> {
    return {
      unitId: params.unitId.toString(),
      leadId: params.leadId?.toString() ?? null,
      startsAt: params.startsAt.toISOString(),
      expiresAt: params.expiresAt.toISOString(),
    };
  }

  /**
   * BOOK-001 follow-up (book-001-decision-memo Q1 рекомендация: cancel —
   * единственное действие этого второго среза, confirm/extend/paid
   * остаются отдельными). booking.cancel.organization — не .own: cancel
   * может любая Position с organization-grant'ом (owner/director/rop/
   * developer в DEFAULT_ROLE_GRANTS), не только автор брони (manager
   * получает только create/confirm.own, cancel-гранта у него нет вообще —
   * намеренная иерархия, не пропуск).
   *
   * Разрешён переход только из pending/booked. paid исключён намеренно:
   * отмена уже оплаченной брони — не просто снятие hold'а, это финансовая
   * операция (возврат), вне контракта этого среза (book-001-decision-memo
   * не специфицирует billing-side-effect). Уже терминальные (rejected/
   * expired) — второй cancel того же booking, не новая операция.
   */
  async cancelBooking(params: {
    bookingId: Types.ObjectId;
    organizationId: Types.ObjectId;
    actorIdentityId: Types.ObjectId;
    reason?: string;
    idempotencyKey: string;
    correlationId: string;
  }): Promise<BookingDocument | { replay: IdempotentReplay }> {
    const booking = await this.bookingRepository.findByIdForOrganization(params.bookingId, params.organizationId);
    if (!booking) {
      // Non-disclosure: не существует и "существует, но чужая организация"
      // — один и тот же 404, тот же принцип, что во всех остальных модулях.
      throw new AppException(ErrorCode.BOOKING_NOT_FOUND, 'Booking not found');
    }

    const requestBody = this.cancelRequestBody(params);
    try {
      return await runInTransaction(this.connection, async (session) => {
        const replay = await this.idempotencyService.checkReplay({
          identityId: params.actorIdentityId,
          operation: 'cancelBooking',
          key: params.idempotencyKey,
          requestBody,
        });
        if (replay) {
          return { replay };
        }

        const { modifiedCount } = await this.bookingRepository.cancelIfActive(
          params.bookingId,
          params.organizationId,
          session,
        );
        if (modifiedCount === 0) {
          throw new AppException(
            ErrorCode.BOOKING_INVALID_STATE_TRANSITION,
            `Booking status is '${booking.status}', only 'pending'/'booked' bookings can be cancelled`,
          );
        }

        const updated = await this.bookingRepository.findByIdForOrganization(
          params.bookingId,
          params.organizationId,
          session,
        );
        // Только что изменили эту же запись в этой же транзакции — findOne
        // по её собственному _id не может вернуть null здесь.
        const response = toBookingResponse(updated!) as unknown as Record<string, unknown>;

        await this.releaseUnitIfFree(booking, params.organizationId, session);

        await this.outboxService.publish(
          {
            eventType: 'BookingCancelled',
            aggregateId: booking._id,
            aggregateType: 'booking',
            deduplicationKey: `booking:${booking._id.toString()}:cancelled`,
            payload: {
              bookingId: booking._id,
              unitId: booking.unitId,
              organizationId: booking.organizationId,
              reason: params.reason ?? null,
            },
          },
          session,
        );

        await this.auditService.append(
          {
            actor: { type: 'identity', id: params.actorIdentityId },
            action: 'booking.cancel',
            resource: 'booking',
            resourceId: booking._id,
            correlationId: params.correlationId,
            before: { status: booking.status },
            after: { status: 'rejected', reason: params.reason ?? null },
          },
          session,
        );

        await this.idempotencyService.record(
          {
            identityId: params.actorIdentityId,
            operation: 'cancelBooking',
            key: params.idempotencyKey,
            requestBody,
            responseStatus: 200,
            responseBody: response,
          },
          session,
        );

        return updated!;
      });
    } catch (error: unknown) {
      if (!isDuplicateKeyError(error)) {
        throw error;
      }
      const replay = await this.idempotencyService.awaitReplay({
        identityId: params.actorIdentityId,
        operation: 'cancelBooking',
        key: params.idempotencyKey,
        requestBody,
      });
      if (replay) {
        return { replay };
      }
      throw new AppException(
        ErrorCode.IDEMPOTENCY_KEY_CONFLICT,
        'Idempotency-Key was concurrently claimed but its response is unavailable',
      );
    }
  }

  private cancelRequestBody(params: { bookingId: Types.ObjectId; reason?: string }): Record<string, unknown> {
    return {
      bookingId: params.bookingId.toString(),
      reason: params.reason ?? null,
    };
  }

  /**
   * Освобождает юнит после того, как бронь перестала его занимать (отмена,
   * истечение): reserved → available, если на юните не осталось другой
   * активной брони.
   *
   * Юнит читается в снимке ТЕКУЩЕЙ транзакции, результат CAS проверяется.
   * До 11.09 отмена читала юнит вне транзакции и не смотрела modifiedCount:
   * если между чтением и записью юнит менялся (пакетное изменение цен
   * поднимает version), CAS молча не срабатывал — бронь отменена, а юнит
   * навсегда оставался reserved и пропадал с витрины. Теперь такой промах
   * откатывает всю транзакцию: бронь и юнит меняются вместе или никак.
   *
   * Возвращает true, если юнит освобождён.
   */
  private async releaseUnitIfFree(
    booking: BookingDocument,
    organizationId: Types.ObjectId,
    session: ClientSession,
  ): Promise<boolean> {
    const unit = await this.developmentsService.getUnitForOrganization(booking.unitId, organizationId, session);
    if (unit.status !== 'reserved') {
      return false;
    }

    // Любая другая активная бронь юнита, независимо от дат: пока она есть,
    // юнит остаётся reserved — тот же критерий, что всегда был у отмены.
    const otherActive = await this.bookingRepository.findOverlappingActiveExcluding(
      booking.unitId,
      booking._id,
      new Date(0),
      new Date(8640000000000000),
      session,
    );
    if (otherActive) {
      return false;
    }

    const { modifiedCount } = await this.developmentsService.updateUnitStatusInSession(
      unit._id,
      organizationId,
      unit.version,
      'available',
      ['reserved'],
      session,
    );
    if (modifiedCount === 0) {
      throw new AppException(
        ErrorCode.VERSION_CONFLICT,
        `Unit ${unit._id.toString()} was modified concurrently while releasing booking ${booking._id.toString()}`,
      );
    }

    await this.outboxService.publish(
      {
        eventType: 'UnitStatusChanged',
        aggregateId: unit._id,
        aggregateType: 'unit',
        deduplicationKey: `unit:${unit._id.toString()}:status:available:${booking._id.toString()}`,
        payload: {
          unitId: unit._id,
          organizationId,
          buildingId: unit.buildingId,
          previousStatus: 'reserved',
          newStatus: 'available',
        },
      },
      session,
    );
    return true;
  }

  /**
   * Истечение броней по сроку. Этап 7 мастер-плана: «бронирования с
   * транзакционным conflict lock и истечением». До 11.09 бронь не истекала
   * вовсе: convertToDeal лишь отказывал в переводе просроченной брони, сама
   * она оставалась pending/booked, юнит — reserved, и он навсегда пропадал с
   * витрины (публичная проекция берёт только available).
   *
   * Сама не расписание: точка входа — apps/api/src/jobs/booking-expire.command.ts,
   * вызывается снаружи (compose-профиль `scheduled` или cron) — тот же
   * паттерн, что ActualityService.expireOverdueListings.
   *
   * Каждая бронь — своя транзакция. Первая запись в ней —
   * BookingLock.bumpForUnit (ADR-006), как у book(): истечение и новая бронь
   * того же юнита не проходят одновременно. Ошибка на одной брони не
   * останавливает прогон — считается в `errors`, бронь переоценит следующий
   * прогон. Идемпотентна по построению: истёкшая бронь в выборку больше не
   * попадает.
   */
  async expireOverdueBookings(
    params: { now?: Date; limit?: number } = {},
  ): Promise<{ expiredCount: number; releasedUnits: number; errors: number }> {
    const now = params.now ?? new Date();
    const limit = params.limit ?? 100;
    let expiredCount = 0;
    let releasedUnits = 0;
    let errors = 0;

    let cursor: Types.ObjectId | undefined;
    for (;;) {
      const batch = await this.bookingRepository.findOverdueActive(now, { cursor, limit });
      if (batch.length === 0) break;
      cursor = batch[batch.length - 1]!._id;

      for (const candidate of batch) {
        try {
          const outcome = await runInTransaction(this.connection, async (session) => {
            await this.bookingLockRepository.bumpForUnit(candidate.unitId, session);

            const before = await this.bookingRepository.expireIfOverdue(
              candidate._id,
              candidate.organizationId,
              now,
              session,
            );
            if (!before) {
              // Продлена, отменена или стала сделкой после чтения пачки.
              return null;
            }

            const released = await this.releaseUnitIfFree(before, before.organizationId, session);

            await this.outboxService.publish(
              {
                eventType: 'BookingExpired',
                aggregateId: before._id,
                aggregateType: 'booking',
                deduplicationKey: `booking:${before._id.toString()}:expired`,
                payload: {
                  bookingId: before._id,
                  unitId: before.unitId,
                  organizationId: before.organizationId,
                  leadId: before.leadId ?? null,
                  manager: before.manager,
                  expiresAt: before.dateRange.expiresAt,
                  previousStatus: before.status,
                  unitReleased: released,
                },
              },
              session,
            );

            await this.auditService.append(
              {
                actor: { type: 'system' },
                action: 'booking.expire',
                resource: 'booking',
                resourceId: before._id,
                correlationId: `booking-expiry-${before._id.toString()}`,
                before: { status: before.status, expiresAt: before.dateRange.expiresAt },
                after: { status: 'expired', unitReleased: released },
              },
              session,
            );

            return { released };
          });

          if (outcome) {
            expiredCount += 1;
            if (outcome.released) releasedUnits += 1;
          }
        } catch (error) {
          errors += 1;
          this.logger.error(
            `expireOverdueBookings: ошибка обработки брони ${candidate._id.toString()}: ${(error as Error).message}`,
          );
        }
      }

      if (batch.length < limit) break;
    }

    return { expiredCount, releasedUnits, errors };
  }

  /**
   * BOOK-001 follow-up (booking.confirm.own — decision-memo не
   * специфицировал confirm/extend/paid, но default-role-grants.ts уже
   * содержит confirm/own для owner/director/rop/developer/manager: техническое
   * прочтение — единственный небазовый статус между `pending` (hold) и
   * `paid` в уже существующем enum (schema/lead.schema docstring "domain-
   * model.md Module 7") — `booked`, поэтому confirm читается как
   * pending→booked, не изобретённый отдельный статус). `.own`, не
   * `.organization` — единственное действие этого booking-триптиха
   * (confirm/cancel/extend), доступное manager'у: он подтверждает
   * СВОЮ бронь, cancel/extend требуют organization grant.
   *
   * requiredManagerPositionId — тот же паттерн, что LeadController.
   * ownerFilterForAction: undefined при organization/global scope (весь
   * tenant), Position ID при own (не раскрываем manager'у существование
   * чужой брони — non-disclosure на уровне repository-фильтра, не
   * отдельная проверка после чтения).
   */
  async confirmBooking(params: {
    bookingId: Types.ObjectId;
    organizationId: Types.ObjectId;
    actorIdentityId: Types.ObjectId;
    requiredManagerPositionId?: Types.ObjectId;
    idempotencyKey: string;
    correlationId: string;
  }): Promise<BookingDocument | { replay: IdempotentReplay }> {
    const booking = await this.bookingRepository.findByIdForOrganizationOwned(
      params.bookingId,
      params.organizationId,
      params.requiredManagerPositionId,
    );
    if (!booking) {
      throw new AppException(ErrorCode.BOOKING_NOT_FOUND, 'Booking not found');
    }

    const requestBody = { bookingId: params.bookingId.toString() };
    try {
      return await runInTransaction(this.connection, async (session) => {
        const replay = await this.idempotencyService.checkReplay({
          identityId: params.actorIdentityId,
          operation: 'confirmBooking',
          key: params.idempotencyKey,
          requestBody,
        });
        if (replay) {
          return { replay };
        }

        const { modifiedCount } = await this.bookingRepository.confirmIfPending(
          params.bookingId,
          params.organizationId,
          params.requiredManagerPositionId,
          session,
        );
        if (modifiedCount === 0) {
          throw new AppException(
            ErrorCode.BOOKING_INVALID_STATE_TRANSITION,
            `Booking status is '${booking.status}', only 'pending' bookings can be confirmed`,
          );
        }

        const updated = await this.bookingRepository.findByIdForOrganization(
          params.bookingId,
          params.organizationId,
          session,
        );
        const response = toBookingResponse(updated!) as unknown as Record<string, unknown>;

        await this.outboxService.publish(
          {
            eventType: 'BookingConfirmed',
            aggregateId: booking._id,
            aggregateType: 'booking',
            deduplicationKey: `booking:${booking._id.toString()}:confirmed`,
            payload: {
              bookingId: booking._id,
              unitId: booking.unitId,
              organizationId: booking.organizationId,
            },
          },
          session,
        );

        await this.auditService.append(
          {
            actor: { type: 'identity', id: params.actorIdentityId },
            action: 'booking.confirm',
            resource: 'booking',
            resourceId: booking._id,
            correlationId: params.correlationId,
            before: { status: booking.status },
            after: { status: 'booked' },
          },
          session,
        );

        await this.idempotencyService.record(
          {
            identityId: params.actorIdentityId,
            operation: 'confirmBooking',
            key: params.idempotencyKey,
            requestBody,
            responseStatus: 200,
            responseBody: response,
          },
          session,
        );

        return updated!;
      });
    } catch (error: unknown) {
      if (!isDuplicateKeyError(error)) {
        throw error;
      }
      const replay = await this.idempotencyService.awaitReplay({
        identityId: params.actorIdentityId,
        operation: 'confirmBooking',
        key: params.idempotencyKey,
        requestBody,
      });
      if (replay) {
        return { replay };
      }
      throw new AppException(
        ErrorCode.IDEMPOTENCY_KEY_CONFLICT,
        'Idempotency-Key was concurrently claimed but its response is unavailable',
      );
    }
  }

  /**
   * BOOK-001 follow-up (booking.extend.organization — как cancel, не
   * доступно manager'у). Только продление вперёд (newExpiresAt строго
   * позже текущего expiresAt) — сокращение окна брони это отдельное
   * действие, не запрошенное нигде и не являющееся "extend" по смыслу
   * слова. BookingLock.bumpForUnit — та же сериализация, что book():
   * расширение занятого окна пересекается с той же гонкой "конкурентный
   * book() на соседнее время", что и создание.
   */
  async extendBooking(params: {
    bookingId: Types.ObjectId;
    organizationId: Types.ObjectId;
    actorIdentityId: Types.ObjectId;
    newExpiresAt: Date;
    idempotencyKey: string;
    correlationId: string;
  }): Promise<BookingDocument | { replay: IdempotentReplay }> {
    if (Number.isNaN(params.newExpiresAt.getTime())) {
      throw new AppException(ErrorCode.VALIDATION_FAILED, 'newExpiresAt must be a valid date');
    }

    const booking = await this.bookingRepository.findByIdForOrganization(params.bookingId, params.organizationId);
    if (!booking) {
      throw new AppException(ErrorCode.BOOKING_NOT_FOUND, 'Booking not found');
    }
    if (params.newExpiresAt <= booking.dateRange.expiresAt) {
      throw new AppException(
        ErrorCode.VALIDATION_FAILED,
        'newExpiresAt must be strictly after the current expiresAt — extend only moves the booking forward',
      );
    }

    const requestBody = {
      bookingId: params.bookingId.toString(),
      newExpiresAt: params.newExpiresAt.toISOString(),
    };
    try {
      return await runInTransaction(this.connection, async (session) => {
        await this.bookingLockRepository.bumpForUnit(booking.unitId, session);

        const replay = await this.idempotencyService.checkReplay({
          identityId: params.actorIdentityId,
          operation: 'extendBooking',
          key: params.idempotencyKey,
          requestBody,
        });
        if (replay) {
          return { replay };
        }

        const overlap = await this.bookingRepository.findOverlappingActiveExcluding(
          booking.unitId,
          booking._id,
          booking.dateRange.startsAt,
          params.newExpiresAt,
          session,
        );
        if (overlap) {
          throw new AppException(ErrorCode.BOOKING_OVERLAP, 'Extended range overlaps another active booking');
        }

        const { modifiedCount } = await this.bookingRepository.extendIfActive(
          params.bookingId,
          params.organizationId,
          params.newExpiresAt,
          session,
        );
        if (modifiedCount === 0) {
          throw new AppException(
            ErrorCode.BOOKING_INVALID_STATE_TRANSITION,
            `Booking status is '${booking.status}', only 'pending'/'booked' bookings can be extended`,
          );
        }

        const updated = await this.bookingRepository.findByIdForOrganization(
          params.bookingId,
          params.organizationId,
          session,
        );
        const response = toBookingResponse(updated!) as unknown as Record<string, unknown>;

        await this.outboxService.publish(
          {
            eventType: 'BookingExtended',
            aggregateId: booking._id,
            aggregateType: 'booking',
            deduplicationKey: `booking:${booking._id.toString()}:extended:${params.newExpiresAt.toISOString()}`,
            payload: {
              bookingId: booking._id,
              unitId: booking.unitId,
              organizationId: booking.organizationId,
              previousExpiresAt: booking.dateRange.expiresAt,
              newExpiresAt: params.newExpiresAt,
            },
          },
          session,
        );

        await this.auditService.append(
          {
            actor: { type: 'identity', id: params.actorIdentityId },
            action: 'booking.extend',
            resource: 'booking',
            resourceId: booking._id,
            correlationId: params.correlationId,
            before: { expiresAt: booking.dateRange.expiresAt },
            after: { expiresAt: params.newExpiresAt },
          },
          session,
        );

        await this.idempotencyService.record(
          {
            identityId: params.actorIdentityId,
            operation: 'extendBooking',
            key: params.idempotencyKey,
            requestBody,
            responseStatus: 200,
            responseBody: response,
          },
          session,
        );

        return updated!;
      });
    } catch (error: unknown) {
      if (!isDuplicateKeyError(error)) {
        throw error;
      }
      const replay = await this.idempotencyService.awaitReplay({
        identityId: params.actorIdentityId,
        operation: 'extendBooking',
        key: params.idempotencyKey,
        requestBody,
      });
      if (replay) {
        return { replay };
      }
      throw new AppException(
        ErrorCode.IDEMPOTENCY_KEY_CONFLICT,
        'Idempotency-Key was concurrently claimed but its response is unavailable',
      );
    }
  }

  /**
   * booking.convert_to_deal: конвертация активной брони в сделку CRM.
   * Бронь переходит в paid, квартира в sold, создаётся DealDocument в одной транзакции.
   */
  async convertToDeal(params: {
    bookingId: Types.ObjectId;
    organizationId: Types.ObjectId;
    actorIdentityId: Types.ObjectId;
    managerPositionId: Types.ObjectId;
    requiredManagerPositionId?: Types.ObjectId;
    title?: string;
    contactId?: Types.ObjectId;
    dealType?: 'primary' | 'secondary' | 'rental' | 'assignment';
    installmentPlanId?: Types.ObjectId;
    downPayment?: MoneyAmount;
    expectedCommission?: MoneyAmount;
    notes?: string;
    idempotencyKey: string;
    correlationId: string;
  }): Promise<{ booking: BookingDocument; deal: DealDocument } | { replay: IdempotentReplay }> {
    const requestBody = {
      bookingId: params.bookingId.toString(),
      title: params.title ?? null,
      contactId: params.contactId?.toString() ?? null,
      dealType: params.dealType ?? null,
      installmentPlanId: params.installmentPlanId?.toString() ?? null,
      downPayment: params.downPayment ?? null,
      expectedCommission: params.expectedCommission ?? null,
      notes: params.notes ?? null,
    };

    const earlyReplay = await this.idempotencyService.checkReplay({
      identityId: params.actorIdentityId,
      operation: 'convertBookingToDeal',
      key: params.idempotencyKey,
      requestBody,
    });
    if (earlyReplay) {
      return { replay: earlyReplay };
    }

    // ИСПРАВЛЕНО 10.09.2026: раньше читалось через findByIdForOrganization
    // (весь tenant, без учёта own-scope) — manager с booking.confirm.own (не
    // organization/global) мог конвертировать в сделку ЧУЖУЮ бронь, хотя
    // само 'подтвердить'/'продлить' её ему недоступно. requiredManagerPositionId
    // — тот же own-scope filter, что confirmBooking (booking.confirm scope,
    // ближайший по семантике "завершение жизненного цикла своей брони").
    const booking = await this.bookingRepository.findByIdForOrganizationOwned(
      params.bookingId,
      params.organizationId,
      params.requiredManagerPositionId,
    );
    if (!booking) {
      throw new AppException(ErrorCode.BOOKING_NOT_FOUND, 'Booking not found');
    }
    if (booking.status !== 'pending' && booking.status !== 'booked') {
      throw new AppException(
        ErrorCode.BOOKING_INVALID_STATE_TRANSITION,
        `Booking status is '${booking.status}', only 'pending'/'booked' bookings can be converted to deal`,
      );
    }
    if (booking.dateRange?.expiresAt && booking.dateRange.expiresAt.getTime() <= Date.now()) {
      throw new AppException(
        ErrorCode.BOOKING_INVALID_STATE_TRANSITION,
        'Booking has expired',
      );
    }

    const unit = await this.developmentsService.getUnitForOrganization(booking.unitId, params.organizationId);
    if (unit.status === 'sold') {
      throw new AppException(ErrorCode.UNIT_INVALID_STATUS_TRANSITION, 'Unit is already sold');
    }

    let effectiveContactId = params.contactId;
    if (effectiveContactId) {
      await this.crmService.getContactForOrganization(effectiveContactId, params.organizationId);
    } else if (booking.leadId) {
      const lead = await this.crmService.getLeadForOrganization(booking.leadId, params.organizationId);
      if (lead.contactId) {
        effectiveContactId = lead.contactId;
      }
    }

    if (!effectiveContactId) {
      throw new AppException(
        ErrorCode.VALIDATION_FAILED,
        'contactId is required when booking has no associated lead with contact',
      );
    }

    const building = await this.developmentsService.getBuildingForOrganization(unit.buildingId, params.organizationId);

    try {
      return await runInTransaction(this.connection, async (session) => {
        const replay = await this.idempotencyService.checkReplay({
          identityId: params.actorIdentityId,
          operation: 'convertBookingToDeal',
          key: params.idempotencyKey,
          requestBody,
        });
        if (replay) {
          return { replay };
        }

        const { modifiedCount } = await this.bookingRepository.markPaidIfActive(
          params.bookingId,
          params.organizationId,
          params.requiredManagerPositionId,
          session,
        );
        if (modifiedCount === 0) {
          throw new AppException(
            ErrorCode.BOOKING_INVALID_STATE_TRANSITION,
            `Booking status is '${booking.status}', only 'pending'/'booked' bookings can be converted to deal`,
          );
        }

        const { modifiedCount: unitModified } = await this.developmentsService.updateUnitStatusInSession(
          unit._id,
          params.organizationId,
          unit.version,
          'sold',
          ['available', 'reserved'],
          session,
        );
        if (unitModified === 0) {
          throw new AppException(ErrorCode.VERSION_CONFLICT, 'Unit status conflict or version mismatch');
        }

        const deal = await this.crmService.createDealInSession(
          {
            organizationId: params.organizationId,
            contactId: effectiveContactId,
            ownerPositionId: params.managerPositionId,
            leadId: booking.leadId ?? undefined,
            title: params.title ?? `Deal for Unit ${unit.number}`,
            description: params.notes,
            stage: 'deal',
            dealType: params.dealType ?? 'primary',
            unitId: unit._id,
            developmentId: building.developmentId,
            installmentPlanId: params.installmentPlanId,
            downPayment: params.downPayment,
            expectedCommission: params.expectedCommission,
          },
          session,
        );

        const updatedBooking = await this.bookingRepository.findByIdForOrganization(
          params.bookingId,
          params.organizationId,
          session,
        );

        await this.outboxService.publish(
          {
            eventType: 'BookingConvertedToDeal',
            aggregateId: booking._id,
            aggregateType: 'booking',
            deduplicationKey: `booking:${booking._id.toString()}:converted:${deal._id.toString()}`,
            payload: {
              bookingId: booking._id,
              dealId: deal._id,
              unitId: booking.unitId,
              organizationId: booking.organizationId,
              leadId: booking.leadId ?? null,
              contactId: effectiveContactId,
            },
          },
          session,
        );

        await this.outboxService.publish(
          {
            eventType: 'UnitStatusChanged',
            aggregateId: unit._id,
            aggregateType: 'unit',
            deduplicationKey: `unit:${unit._id.toString()}:status:sold:${deal._id.toString()}`,
            payload: {
              unitId: unit._id,
              organizationId: params.organizationId,
              buildingId: unit.buildingId,
              previousStatus: unit.status,
              newStatus: 'sold',
            },
          },
          session,
        );

        await this.auditService.append(
          {
            actor: { type: 'identity', id: params.actorIdentityId },
            action: 'booking.convert_to_deal',
            resource: 'booking',
            resourceId: booking._id,
            correlationId: params.correlationId,
            before: { status: booking.status },
            after: { status: 'paid', dealId: deal._id },
          },
          session,
        );

        const response = {
          booking: toBookingResponse(updatedBooking!),
          dealId: deal._id.toString(),
        };

        await this.idempotencyService.record(
          {
            identityId: params.actorIdentityId,
            operation: 'convertBookingToDeal',
            key: params.idempotencyKey,
            requestBody,
            responseStatus: 201,
            responseBody: response,
          },
          session,
        );

        return { booking: updatedBooking!, deal };
      });
    } catch (error: unknown) {
      if (
        isDuplicateKeyError(error) ||
        (error instanceof AppException &&
          (error.code === ErrorCode.BOOKING_INVALID_STATE_TRANSITION || error.code === ErrorCode.VERSION_CONFLICT))
      ) {
        const replay = await this.idempotencyService.awaitReplay({
          identityId: params.actorIdentityId,
          operation: 'convertBookingToDeal',
          key: params.idempotencyKey,
          requestBody,
        });
        if (replay) {
          return { replay };
        }
      }
      throw error;
    }
  }
}

function isDuplicateKeyError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const code = (error as { code?: unknown }).code;
  return code === 11000;
}

export function toBookingResponse(booking: BookingDocument): BookingResponse {
  return {
    id: booking._id.toString(),
    unitId: booking.unitId.toString(),
    organizationId: booking.organizationId.toString(),
    leadId: booking.leadId?.toString() ?? null,
    dateRange: {
      startsAt: booking.dateRange.startsAt.toISOString(),
      expiresAt: booking.dateRange.expiresAt.toISOString(),
    },
    status: booking.status,
    manager: booking.manager.toString(),
    createdAt: booking.createdAt.toISOString(),
  };
}
