import { ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection, Types } from 'mongoose';
import {
  ListingRepository,
  PropertyAssetRepository,
  computeActualityState,
  getActualityThresholds,
  resolveActualityCategory,
  type ListingDealType,
  type ListingStatus,
} from '@baza/property-assets';
import { PublicationService } from '../publication/publication.service';
import { runInTransaction } from '../../shared/transactions/run-in-transaction';

/**
 * ACT-001 (owner decision — open-decisions.md разд.2, xlsx #56/#57):
 * "снимается с публикации и требуется подтвердить" — просроченный listing
 * (`needs_update`/overdue-порог) переходит в `status:'expired'` И его
 * publication снимается (unpublish, тот же reason-паттерн, что owner/admin
 * unpublish). Владелец подтверждает актуальность отдельной командой
 * (confirmActuality) — сбрасывает часы, listing остаётся/возвращается
 * active, republish — отдельный явный шаг (не auto-republish).
 */
@Injectable()
export class ActualityService {
  private readonly logger = new Logger(ActualityService.name);

  constructor(
    private readonly listingRepository: ListingRepository,
    private readonly propertyAssetRepository: PropertyAssetRepository,
    private readonly publicationService: PublicationService,
    @InjectConnection() private readonly connection: Connection,
  ) {}

  /**
   * Owner-facing: сбрасывает actuality-часы (lastConfirmedAt:now) — тот же
   * CAS-паттерн (expectedVersion), что publishListing. Разрешено из
   * status:'active' (обычный рефреш) И status:'expired' (owner decision
   * xlsx #57 "требуется подтвердить" — единственный путь реактивации
   * просроченного listing, см. ListingRepository.confirmActuality
   * докстринг). draft/archived НЕ допускаются: draft ещё не проходил
   * activate() вообще (нет смысла "подтверждать" то, что не публиковалось),
   * archived — терминальный статус вне scope ACT-001.
   */
  async confirmActuality(params: {
    listingId: Types.ObjectId;
    assetId: Types.ObjectId;
    organizationId: Types.ObjectId;
    expectedVersion: number;
  }): Promise<void> {
    const listing = await this.listingRepository.findByIdForOrganization(params.listingId, params.organizationId);
    if (!listing || !listing.propertyAssetId.equals(params.assetId)) {
      throw new NotFoundException('Listing not found');
    }
    if (listing.status !== 'active' && listing.status !== 'expired') {
      throw new ConflictException(`Listing status is '${listing.status}', only 'active'/'expired' listings can confirm actuality`);
    }

    const { modifiedCount } = await this.listingRepository.confirmActuality(
      params.listingId,
      params.organizationId,
      params.expectedVersion,
      new Date(),
    );
    if (modifiedCount === 0) {
      throw new ConflictException('Listing was modified by another request — refresh and retry');
    }
  }

  /**
   * ERP polling: реальное состояние актуальности для конкретного listing
   * (не сохраняется на схеме — вычисляется на лету, тот же принцип, что
   * publication status читается из MarketplacePublication, не кэшируется
   * избыточно на canonical-сущности).
   */
  async getActualityState(listingId: Types.ObjectId, assetId: Types.ObjectId, organizationId: Types.ObjectId) {
    const listing = await this.listingRepository.findByIdForOrganization(listingId, organizationId);
    if (!listing || !listing.propertyAssetId.equals(assetId)) {
      throw new NotFoundException('Listing not found');
    }
    return this.buildActualityState(listing);
  }

  /**
   * Owner/realtor marketplace publishing wizard: identity-зеркало
   * confirmActuality — та же CAS/lifecycle-логика, listingRepository.
   * confirmActualityForIdentity вместо confirmActuality.
   */
  async confirmActualityForIdentity(params: {
    listingId: Types.ObjectId;
    assetId: Types.ObjectId;
    identityId: Types.ObjectId;
    expectedVersion: number;
  }): Promise<void> {
    const listing = await this.listingRepository.findByIdForIdentity(params.listingId, params.identityId);
    if (!listing || !listing.propertyAssetId.equals(params.assetId)) {
      throw new NotFoundException('Listing not found');
    }
    if (listing.status !== 'active' && listing.status !== 'expired') {
      throw new ConflictException(`Listing status is '${listing.status}', only 'active'/'expired' listings can confirm actuality`);
    }

    const { modifiedCount } = await this.listingRepository.confirmActualityForIdentity(
      params.listingId,
      params.identityId,
      params.expectedVersion,
      new Date(),
    );
    if (modifiedCount === 0) {
      throw new ConflictException('Listing was modified by another request — refresh and retry');
    }
  }

  async getActualityStateForIdentity(listingId: Types.ObjectId, assetId: Types.ObjectId, identityId: Types.ObjectId) {
    const listing = await this.listingRepository.findByIdForIdentity(listingId, identityId);
    if (!listing || !listing.propertyAssetId.equals(assetId)) {
      throw new NotFoundException('Listing not found');
    }
    return this.buildActualityState(listing);
  }

  private async buildActualityState(listing: {
    _id: Types.ObjectId;
    propertyAssetId: Types.ObjectId;
    dealType: ListingDealType;
    status: ListingStatus;
    version: number;
    lastConfirmedAt?: Date;
    createdAt: Date;
  }) {
    const asset = await this.propertyAssetRepository.findById(listing.propertyAssetId);
    if (!asset) {
      throw new NotFoundException('Property asset not found');
    }

    const category = resolveActualityCategory(listing.dealType, asset.propertyType);
    const thresholds = getActualityThresholds(category);
    const lastConfirmedAt = listing.lastConfirmedAt ?? listing.createdAt;
    const state =
      listing.status === 'active'
        ? computeActualityState({ dealType: listing.dealType, propertyType: asset.propertyType, lastConfirmedAt, now: new Date() })
        : null;

    return {
      listingId: listing._id.toString(),
      status: listing.status,
      category,
      thresholds,
      lastConfirmedAt: lastConfirmedAt.toISOString(),
      state,
      version: listing.version,
    };
  }

  /**
   * Батч-команда (owner decision xlsx #57) — НЕ подключена ни к какому
   * cron/scheduler (в кодовой базе нет ни одного пакета для этого,
   * добавлять новую зависимость без разрешения владельца запрещено ТЗ) —
   * вызывается явно (интеграционным тестом сейчас, автоматизацией позже,
   * когда появится решение по scheduler). Для каждой категории отдельно
   * вычисляет cutoff (пороги разные — mongodb query не может дёшево
   * выразить "разный порог в зависимости от вычисляемой на лету
   * категории" без join к PropertyAsset), сканирует active listings по
   * lastConfirmedAt, транзакционно (1) переводит listing в status:'expired'
   * (CAS на version) и (2) вызывает PublicationService.unpublish, если
   * publication существует и published — тот же generic unpublish, что
   * owner/admin используют. Идемпотентна по построению: повторный вызов
   * не находит уже expired listings повторно (findActiveListingsConfirmedBefore
   * фильтрует status:'active').
   */
  async expireOverdueListings(params: { limit?: number; now?: Date } = {}): Promise<{ expiredCount: number; errors: number }> {
    const now = params.now ?? new Date();
    const limit = params.limit ?? 100;
    let expiredCount = 0;
    let errors = 0;

    // Разные категории — разные overdue-пороги (rent 21д, secondary 60д,
    // other 15д) — самый широкий cutoff (secondary, 60 дней) отбирает
    // СУПЕРСЕТ кандидатов одним query; точная проверка per-listing
    // (категория зависит от propertyType родительского asset, не только
    // dealType) выполняется после чтения родителя, до реального expire.
    const widestCutoff = new Date(now.getTime() - getActualityThresholds('secondary').overdueDays * 24 * 60 * 60 * 1000);

    let cursor: Types.ObjectId | undefined;
    for (;;) {
      const batch = await this.listingRepository.findActiveListingsConfirmedBefore(widestCutoff, { cursor, limit });
      if (batch.length === 0) break;
      cursor = batch[batch.length - 1]!._id;

      for (const listing of batch) {
        try {
          const asset = await this.propertyAssetRepository.findById(listing.propertyAssetId);
          if (!asset) {
            this.logger.warn(`expireOverdueListings: PropertyAsset ${listing.propertyAssetId.toString()} не найден для listing ${listing._id.toString()} — пропускаю.`);
            continue;
          }

          const category = resolveActualityCategory(listing.dealType, asset.propertyType);
          const { overdueDays } = getActualityThresholds(category);
          const diffDays = Math.floor((now.getTime() - (listing.lastConfirmedAt ?? listing.createdAt).getTime()) / (1000 * 60 * 60 * 24));
          if (diffDays < overdueDays) {
            // Попал в widestCutoff pre-filter (secondary-порог), но его
            // СОБСТВЕННЫЙ (более узкий, например rent) порог ещё не
            // истёк — не трогаем.
            continue;
          }

          await runInTransaction(this.connection, async (session) => {
            const { modifiedCount } = await this.listingRepository.markExpired(listing._id, listing.version, session);
            if (modifiedCount === 0) {
              // Конкурентная модификация (owner confirmActuality/unpublish
              // между batch-чтением и этим transaction) — пропускаем, не
              // ошибка, следующий прогон переоценит актуальное состояние.
              return;
            }
            await this.publicationService.unpublish(
              {
                sourceType: 'listing',
                sourceId: listing._id,
                reason: `Automatic actuality expiry (${category} category, overdue ${diffDays}d >= ${overdueDays}d threshold)`,
                actorType: 'system',
                correlationId: `actuality-expiry-${listing._id.toString()}`,
              },
              session,
            ).catch(() => {
              // Publication может не существовать/уже не published
              // (listing никогда не публиковался, или уже unpublished) —
              // PublicationService.unpublish бросает ConflictException в
              // этом случае, тот же non-blocking трактовка, что D-06
              // admin unpublish на уже-unpublished запись. expired-переход
              // на Listing уже закоммичен независимо от исхода unpublish.
              this.logger.log(`expireOverdueListings: unpublish для listing ${listing._id.toString()} не применился (publication не в статусе published) — expired-статус listing сохранён.`);
            });
          });
          expiredCount += 1;
        } catch (error) {
          errors += 1;
          this.logger.error(`expireOverdueListings: ошибка обработки listing ${listing._id.toString()}: ${(error as Error).message}`);
        }
      }

      if (batch.length < limit) break;
    }

    return { expiredCount, errors };
  }
}
