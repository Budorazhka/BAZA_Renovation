import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection, Types } from 'mongoose';
import {
  PropertyAssetRepository,
  DuplicateCandidateRepository,
  computeDuplicateSignals,
  isExplicitDuplicateSignal,
  type DuplicateCandidateDocument,
  type DuplicateCandidateStatus,
  type PropertyAssetDocument,
} from '@baza/property-assets';
import { ownerScopesEqual, type OwnerScope } from '@baza/tenant-scope';
import { runInTransaction } from '../../shared/transactions/run-in-transaction';
import { AuditService } from '../audit/audit.service';

export interface DuplicateCandidateReviewItem {
  candidate: DuplicateCandidateDocument;
  assetA: PropertyAssetDocument | null;
  assetB: PropertyAssetDocument | null;
}

/**
 * DEDUPE-001 (domain-model.md Модуль 6, master plan разд.2.3: "Явный дубль
 * блокирует публикацию. Автор может заявить, что это не дубль; такое
 * исключение логируется и попадает в административную проверку").
 *
 * Отдельный сервис, не метод PropertyAssetsService — dedupe не organization-
 * scoped (ищет МЕЖДУ организациями, см. PropertyAssetRepository.
 * findPotentialDuplicates), поэтому его зона ответственности архитектурно
 * отличается от остального PropertyAssetsService (весь остальной сервис
 * tenant-scoped). Разделение делает эту границу explicit в самой структуре
 * кода, не только в комментариях.
 */
@Injectable()
export class DedupeService {
  constructor(
    private readonly propertyAssetRepository: PropertyAssetRepository,
    private readonly duplicateCandidateRepository: DuplicateCandidateRepository,
    private readonly auditService: AuditService,
    @InjectConnection() private readonly connection: Connection,
  ) {}

  /**
   * Вызывается после createAsset (PropertyAssetsService.createAsset) —
   * структурная dedupe-проверка "при попытке публикации" по domain-model.md
   * ("detected (при попытке публикации)") на практике выполняется раньше,
   * при создании, чтобы админ увидел кандидата в очереди ДО того, как
   * владелец вообще попробует опубликовать — не блокирует сам createAsset
   * (структурная проверка "проверка дублей" в master plan относится к
   * публикации, не к созданию черновика).
   *
   * findPotentialDuplicates — грубый pre-filter (phone ИЛИ address+city
   * совпадение на уровне Mongo query), computeDuplicateSignals — точный
   * расчёт по каждому найденному кандидату. upsertDetected сам
   * идемпотентен (не создаёт вторую запись для уже известной пары).
   */
  async scanForDuplicates(assetId: Types.ObjectId): Promise<void> {
    const asset = await this.propertyAssetRepository.findById(assetId);
    if (!asset) {
      throw new NotFoundException('Property asset not found');
    }

    const candidates = await this.propertyAssetRepository.findPotentialDuplicates({
      excludeId: assetId,
      representativePhone: asset.representativePhone,
      city: asset.location.city,
      address: asset.location.address,
    });

    for (const other of candidates) {
      const signals = computeDuplicateSignals(asset, other);
      if (signals.phoneMatch || signals.addressMatch) {
        await this.duplicateCandidateRepository.upsertDetected(assetId, other._id, signals);
      }
    }
  }

  /**
   * Publish-gate (вызывается из PropertyAssetsService.publishListing ПЕРЕД
   * markPublishing): любой blocking-кандидат (detected/confirmed_duplicate,
   * не override_not_duplicate) с EXPLICIT сигналом (isExplicitDuplicateSignal)
   * блокирует публикацию. Кандидаты с только слабым сигналом (например,
   * только addressMatch без roomsAreaFloorMatch — тот же дом, другая
   * квартира) НЕ блокируют — они остаются в очереди для информации, но
   * "явный дубль" по формулировке master plan — более сильный порог.
   */
  async assertNoBlockingDuplicates(assetId: Types.ObjectId): Promise<void> {
    const candidates = await this.duplicateCandidateRepository.findBlockingCandidates(assetId);
    const explicitBlocking = candidates.filter((candidate) => isExplicitDuplicateSignal(candidate.signals));
    if (explicitBlocking.length > 0) {
      throw new ConflictException(
        `Property asset has ${explicitBlocking.length} unresolved duplicate candidate(s) — override required to publish`,
      );
    }
  }

  async getCandidatesForAsset(assetId: Types.ObjectId) {
    return this.duplicateCandidateRepository.findCandidatesForAsset(assetId);
  }

  /**
   * Owner override (xlsx #70) — CAS на status:'detected', reason
   * обязателен (DTO-уровень), audit-запись в ТОЙ ЖЕ транзакции, что
   * override — тот же принцип, что PublicationService.unpublish пишет
   * audit синхронно с изменением состояния. "Логируется и попадает в
   * административную проверку" (master plan) — override переводит
   * запись в override_not_duplicate, что уже само по себе видимо в
   * admin-очереди через listForReview(['override_not_duplicate']), не
   * требует отдельного механизма "постановки в очередь".
   *
   * Authorization: actor обязан владеть хотя бы одним из двух PropertyAsset
   * в паре (проверяется по actorScope против publisherScope обеих сторон).
   * Если actor не владеет ни одной стороной — 404 (non-disclosure принцип).
   */
  async overrideDuplicate(params: {
    duplicateCandidateId: Types.ObjectId;
    reason: string;
    actorScope: OwnerScope;
    actorIdentityId: Types.ObjectId;
    correlationId: string;
  }): Promise<void> {
    await runInTransaction(this.connection, async (session) => {
      const candidate = await this.duplicateCandidateRepository.findById(params.duplicateCandidateId);
      if (!candidate) {
        throw new NotFoundException('Duplicate candidate not found');
      }

      const [assetA, assetB] = await Promise.all([
        this.propertyAssetRepository.findById(candidate.propertyAssetIdA),
        this.propertyAssetRepository.findById(candidate.propertyAssetIdB),
      ]);

      const actorOwnsA = assetA ? ownerScopesEqual(assetA.publisherScope, params.actorScope) : false;
      const actorOwnsB = assetB ? ownerScopesEqual(assetB.publisherScope, params.actorScope) : false;

      if (!actorOwnsA && !actorOwnsB) {
        throw new NotFoundException('Duplicate candidate not found');
      }

      const { modifiedCount } = await this.duplicateCandidateRepository.override(
        params.duplicateCandidateId,
        { overrideReason: params.reason, overrideByIdentityId: params.actorIdentityId },
        session,
      );
      if (modifiedCount === 0) {
        throw new ConflictException(`Duplicate candidate status is '${candidate.status}', only 'detected' can be overridden`);
      }

      await this.auditService.append(
        {
          actor: { type: 'identity', id: params.actorIdentityId },
          action: 'duplicate_candidate.override',
          resource: 'duplicate_candidate',
          resourceId: params.duplicateCandidateId,
          reason: params.reason,
          correlationId: params.correlationId,
        },
        session,
      );
    });
  }

  /**
   * Admin-очередь (mongodb-schema.md: "{status:1} обслуживает admin-очередь
   * detected/override_not_duplicate для ручной проверки") — AdminModule не
   * читает DuplicateCandidateRepository/PropertyAssetRepository напрямую
   * (test/architecture/module-boundaries.test.ts запрещает cross-module
   * repository reach-through, тот же принцип, что AdminPublicationService
   * идёт через PublicationService, не через MarketplacePublicationRepository
   * напрямую) — этот метод и confirmDuplicate ниже единственная точка входа
   * для admin-стороны, PropertyAssetsModule уже экспортирует DedupeService.
   *
   * Batch-резолвинг asset-пар: N параллельных findById (MVP-масштаб, тот
   * же принцип, что TeamService.listForOrganization avatar-резолвинг) —
   * очередь на модерацию по построению небольшая (только детектированные/
   * оспоренные пары), не полный listing catalog.
   */
  async listForAdminReview(params: {
    statuses: DuplicateCandidateStatus[];
    cursor?: Types.ObjectId;
    limit: number;
  }): Promise<DuplicateCandidateReviewItem[]> {
    const candidates = await this.duplicateCandidateRepository.listForReview(params.statuses, {
      cursor: params.cursor,
      limit: params.limit,
    });

    const assetIds = new Set<string>();
    for (const candidate of candidates) {
      assetIds.add(candidate.propertyAssetIdA.toString());
      assetIds.add(candidate.propertyAssetIdB.toString());
    }
    const assetEntries = await Promise.all(
      Array.from(assetIds, async (idHex) => {
        const asset = await this.propertyAssetRepository.findById(new Types.ObjectId(idHex));
        return [idHex, asset] as const;
      }),
    );
    const assetsById = new Map(assetEntries);

    return candidates.map((candidate) => ({
      candidate,
      assetA: assetsById.get(candidate.propertyAssetIdA.toString()) ?? null,
      assetB: assetsById.get(candidate.propertyAssetIdB.toString()) ?? null,
    }));
  }

  /**
   * Admin critical action — единственный actor, кто может подтвердить дубль
   * ИЗ override_not_duplicate (не только detected), то есть отменить
   * решение владельца "не дубль" (DuplicateCandidateRepository.
   * markConfirmedDuplicate докстринг). reason обязателен на уровне DTO
   * (class-validator), не дублируется здесь отдельной рантайм-проверкой —
   * этот сервис не HTTP-специфичен и не знает про AdminPolicyService.
   * requireReason (тот вызывается в AdminModule до этого метода, тот же
   * порядок, что AdminPublicationService.unpublish → requireReason →
   * requireGrant → command).
   */
  async confirmDuplicate(params: {
    duplicateCandidateId: Types.ObjectId;
    confirmByAdminAccountId: Types.ObjectId;
    reason: string;
    correlationId: string;
  }): Promise<void> {
    await runInTransaction(this.connection, async (session) => {
      const candidate = await this.duplicateCandidateRepository.findById(params.duplicateCandidateId);
      if (!candidate) {
        throw new NotFoundException('Duplicate candidate not found');
      }

      const { modifiedCount } = await this.duplicateCandidateRepository.markConfirmedDuplicate(
        params.duplicateCandidateId,
        { reason: params.reason, confirmByAdminAccountId: params.confirmByAdminAccountId },
        session,
      );
      if (modifiedCount === 0) {
        throw new ConflictException('Duplicate candidate is already confirmed_duplicate');
      }

      await this.auditService.append(
        {
          actor: { type: 'admin_account', id: params.confirmByAdminAccountId },
          action: 'duplicate_candidate.confirm',
          resource: 'duplicate_candidate',
          resourceId: params.duplicateCandidateId,
          reason: params.reason,
          correlationId: params.correlationId,
        },
        session,
      );
    });
  }
}
