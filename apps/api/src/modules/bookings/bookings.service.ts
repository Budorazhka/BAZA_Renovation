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
