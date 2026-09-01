import { Injectable } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection, Types } from 'mongoose';
import { AppException } from '../../shared/errors/app-exception';
import { ErrorCode } from '../../shared/errors/error-codes';
import { runInTransaction } from '../../shared/transactions/run-in-transaction';
import { IdempotencyService, type IdempotentReplay } from '../../shared/idempotency/idempotency.service';
import { AuditService } from '../audit/audit.service';
import { CrmService } from '../crm/crm.service';
import { DevelopmentsService } from '../developments/developments.service';
import { OutboxService } from '../outbox/outbox.service';
import { BookingRepository } from './repository/booking.repository';
import { BookingLockRepository } from './repository/booking-lock.repository';
import type { BookingDocument } from './schemas/booking.schema';

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
    await this.developmentsService.getUnitForOrganization(params.unitId, params.organizationId);
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
