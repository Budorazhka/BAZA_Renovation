import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ClientSession, Model, Types } from 'mongoose';
import {
  ACTIVE_BOOKING_STATUSES,
  BookingDocument,
  EXPIRABLE_BOOKING_STATUSES,
  type BookingStatus,
} from '../schemas/booking.schema';

@Injectable()
export class BookingRepository {
  constructor(@InjectModel(BookingDocument.name) private readonly model: Model<BookingDocument>) {}

  async findOverlappingActive(
    unitId: Types.ObjectId,
    startsAt: Date,
    expiresAt: Date,
    session: ClientSession,
  ): Promise<BookingDocument | null> {
    return this.model
      .findOne({
        unitId,
        status: { $in: ACTIVE_BOOKING_STATUSES },
        'dateRange.startsAt': { $lt: expiresAt },
        'dateRange.expiresAt': { $gt: startsAt },
      })
      .session(session)
      .exec();
  }

  /**
   * Тот же overlap-запрос, что findOverlappingActive, но исключает саму
   * бронь (extend расширяет ЕЁ ЖЕ занятое окно — без exclude она бы
   * находила саму себя как "конфликт" в любом расширении).
   */
  async findOverlappingActiveExcluding(
    unitId: Types.ObjectId,
    excludeBookingId: Types.ObjectId,
    startsAt: Date,
    expiresAt: Date,
    session: ClientSession,
  ): Promise<BookingDocument | null> {
    return this.model
      .findOne({
        unitId,
        _id: { $ne: excludeBookingId },
        status: { $in: ACTIVE_BOOKING_STATUSES },
        'dateRange.startsAt': { $lt: expiresAt },
        'dateRange.expiresAt': { $gt: startsAt },
      })
      .session(session)
      .exec();
  }

  /**
   * GET /bookings (BOOK-002) — organizationId обязательная часть фильтра
   * (ADR-002 требование 1), тот же cursor-паттерн, что
   * DevelopmentRepository.listForOrganization (`_id: {$gt: cursor}`,
   * `sort({_id:1})`). unitId/unitIds — взаимоисключающие сужения,
   * вычисленные вызывающим сервисом ДО этого запроса (developmentId/
   * buildingId уже разрешены в набор unitId) — репозиторий не знает про
   * Development/Building вообще, только про свою же коллекцию `bookings`.
   * managerPositionId — own-scope сужение (BookingsController.
   * ownerFilterForAction), тот же принцип, что confirmIfPending.
   */
  async listForOrganization(
    organizationId: Types.ObjectId,
    filter: {
      unitId?: Types.ObjectId;
      unitIds?: Types.ObjectId[];
      status?: BookingStatus;
      managerPositionId?: Types.ObjectId;
      cursor?: Types.ObjectId;
      limit: number;
    },
  ): Promise<BookingDocument[]> {
    const query: Record<string, unknown> = { organizationId };
    if (filter.unitId) {
      query.unitId = filter.unitId;
    } else if (filter.unitIds) {
      query.unitId = { $in: filter.unitIds };
    }
    if (filter.status) query.status = filter.status;
    if (filter.managerPositionId) query.manager = filter.managerPositionId;
    if (filter.cursor) query._id = { $gt: filter.cursor };
    return this.model.find(query).sort({ _id: 1 }).limit(filter.limit).exec();
  }

  async create(
    params: {
      unitId: Types.ObjectId;
      organizationId: Types.ObjectId;
      leadId?: Types.ObjectId;
      dateRange: { startsAt: Date; expiresAt: Date };
      status?: BookingStatus;
      manager: Types.ObjectId;
    },
    session: ClientSession,
  ): Promise<BookingDocument> {
    const [booking] = await this.model.create([{ ...params, status: params.status ?? 'pending' }], { session });
    return booking!;
  }

  /**
   * ADR-002 требование 1 (tenant escape prevention) — organizationId
   * позиционный параметр, тот же паттерн, что findByIdForOrganization в
   * остальных модулях: не существует и "существует, но чужая организация"
   * не различаются на этом уровне (404 в сервисе одинаков для обоих).
   */
  async findByIdForOrganization(
    bookingId: Types.ObjectId,
    organizationId: Types.ObjectId,
    session?: ClientSession,
  ): Promise<BookingDocument | null> {
    return this.model.findOne({ _id: bookingId, organizationId }).session(session ?? null).exec();
  }

  /**
   * booking.confirm — own scope (owner/director/rop/developer/manager, в
   * отличие от cancel/extend — organization scope). managerPositionId
   * присутствует, только когда PolicyEvaluatorService резолвит НЕ
   * organization/global scope (BookingsController.ownerFilterForAction,
   * тот же паттерн, что LeadController) — filter, не отдельная проверка
   * после чтения: не раскрываем manager'у, что чужая (не его) бронь вообще
   * существует (non-disclosure, тот же принцип, что LeadRepository.
   * findByIdForOrganization).
   */
  async findByIdForOrganizationOwned(
    bookingId: Types.ObjectId,
    organizationId: Types.ObjectId,
    managerPositionId: Types.ObjectId | undefined,
    session?: ClientSession,
  ): Promise<BookingDocument | null> {
    return this.model
      .findOne({ _id: bookingId, organizationId, ...(managerPositionId ? { manager: managerPositionId } : {}) })
      .session(session ?? null)
      .exec();
  }

  /**
   * Cancel — единственный переход этого среза (booking.confirm/extend/paid
   * остаются отдельными срезами, book-001-decision-memo). Условный фильтр
   * `status: {$in: ['pending','booked']}` — не CAS по отдельному version
   * (у Booking его нет, в отличие от Development/Listing): concurrency-
   * защита здесь не про гонку двух cancel (обе безопасно idempotent —
   * вторая просто получит modifiedCount:0), а про то, чтобы cancel не мог
   * молча "откатить" уже paid/уже terminal бронь. modifiedCount:0 в сервисе
   * трактуется как BOOKING_INVALID_STATE_TRANSITION.
   */
  async cancelIfActive(
    bookingId: Types.ObjectId,
    organizationId: Types.ObjectId,
    session: ClientSession,
  ): Promise<{ modifiedCount: number }> {
    const result = await this.model
      .updateOne(
        { _id: bookingId, organizationId, status: { $in: ['pending', 'booked'] as BookingStatus[] } },
        { $set: { status: 'rejected' as BookingStatus } },
      )
      .session(session)
      .exec();
    return { modifiedCount: result.modifiedCount };
  }

  /**
   * `pending` → `booked` — единственный переход этого действия. `booked`
   * (уже confirmed) не проходит фильтр повторно: тот же idempotent-safe
   * modifiedCount:0 паттерн, что cancelIfActive, только с одним статусом в
   * фильтре, не набором. managerPositionId — тот же опциональный own-scope
   * filter, что findByIdForOrganizationOwned (если grant own, а не
   * organization/global) — двойная защита (уже прошли non-disclosure lookup
   * выше в сервисе, но модификация повторяет тот же filter на случай гонки
   * между чтением и записью).
   */
  async confirmIfPending(
    bookingId: Types.ObjectId,
    organizationId: Types.ObjectId,
    managerPositionId: Types.ObjectId | undefined,
    session: ClientSession,
  ): Promise<{ modifiedCount: number }> {
    const result = await this.model
      .updateOne(
        {
          _id: bookingId,
          organizationId,
          status: 'pending' as BookingStatus,
          ...(managerPositionId ? { manager: managerPositionId } : {}),
        },
        { $set: { status: 'booked' as BookingStatus } },
      )
      .session(session)
      .exec();
    return { modifiedCount: result.modifiedCount };
  }

  /**
   * booking.extend — organization scope (не own, DEFAULT_ROLE_GRANTS не
   * даёт manager этого гранта вообще). Разрешён из pending/booked
   * (ACTIVE_BOOKING_STATUSES минус paid — оплаченную бронь продлевает не
   * простое изменение даты, вне контракта этого среза, тот же принцип, что
   * cancel исключает paid). Overlap-проверка (findOverlappingActiveExcluding)
   * выполняется вызывающим кодом ДО этого update, тот же порядок, что
   * BookingsService.book — репозиторий не пересчитывает бизнес-инвариант
   * сам, только исполняет уже проверенное решение.
   */
  async extendIfActive(
    bookingId: Types.ObjectId,
    organizationId: Types.ObjectId,
    newExpiresAt: Date,
    session: ClientSession,
  ): Promise<{ modifiedCount: number }> {
    const result = await this.model
      .updateOne(
        { _id: bookingId, organizationId, status: { $in: ['pending', 'booked'] as BookingStatus[] } },
        { $set: { 'dateRange.expiresAt': newExpiresAt } },
      )
      .session(session)
      .exec();
    return { modifiedCount: result.modifiedCount };
  }

  /**
   * booking.convert_to_deal — перевод активной брони в статус paid при закрытии сделки.
   */
  /**
   * Фоновая задача истечения (BookingsService.expireOverdueBookings):
   * намеренно по всем организациям — tenant-контекста у неё нет. Курсор по
   * `_id`, а не «перечитать первые N»: бронь, которую не удалось обработать,
   * иначе возвращалась бы в каждую следующую пачку и зациклила прогон. Тот же
   * приём, что ListingRepository.findActiveListingsConfirmedBefore.
   */
  async findOverdueActive(
    now: Date,
    params: { cursor?: Types.ObjectId; limit: number },
  ): Promise<BookingDocument[]> {
    const query: Record<string, unknown> = {
      status: { $in: EXPIRABLE_BOOKING_STATUSES },
      'dateRange.expiresAt': { $lte: now },
    };
    if (params.cursor) query._id = { $gt: params.cursor };
    return this.model.find(query).sort({ _id: 1 }).limit(params.limit).exec();
  }

  /**
   * CAS истечения: бронь всё ещё `pending`/`booked` И её срок всё ещё истёк
   * на момент `now`. Второе условие не лишнее: между пачкой
   * findOverdueActive и этой транзакцией менеджер мог продлить бронь
   * (extendBooking сдвигает expiresAt) — продлённая бронь истечь не должна.
   *
   * Возвращает документ ДО изменения (`new: false`): аудиту нужен настоящий
   * исходный статус, а он мог смениться с `pending` на `booked` после чтения
   * пачки. null — бронь уже не подходит (продлена, отменена, стала сделкой).
   */
  async expireIfOverdue(
    bookingId: Types.ObjectId,
    organizationId: Types.ObjectId,
    now: Date,
    session: ClientSession,
  ): Promise<BookingDocument | null> {
    return this.model
      .findOneAndUpdate(
        {
          _id: bookingId,
          organizationId,
          status: { $in: EXPIRABLE_BOOKING_STATUSES },
          'dateRange.expiresAt': { $lte: now },
        },
        { $set: { status: 'expired' as BookingStatus } },
        { new: false, session },
      )
      .exec();
  }

  /**
   * managerPositionId — тот же own-scope filter, что confirmIfPending выше:
   * ИСПРАВЛЕНО 10.09.2026, второй слой защиты на случай гонки между
   * findByIdForOrganizationOwned (non-disclosure lookup в сервисе) и этой
   * записью, не единственная защита.
   */
  async markPaidIfActive(
    bookingId: Types.ObjectId,
    organizationId: Types.ObjectId,
    managerPositionId: Types.ObjectId | undefined,
    session: ClientSession,
  ): Promise<{ modifiedCount: number }> {
    const result = await this.model
      .updateOne(
        {
          _id: bookingId,
          organizationId,
          status: { $in: ['pending', 'booked'] as BookingStatus[] },
          ...(managerPositionId ? { manager: managerPositionId } : {}),
        },
        { $set: { status: 'paid' as BookingStatus } },
      )
      .session(session)
      .exec();
    return { modifiedCount: result.modifiedCount };
  }
}
