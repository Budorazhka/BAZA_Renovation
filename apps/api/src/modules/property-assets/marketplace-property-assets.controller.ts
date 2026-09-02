import { Delete, Put } from '@nestjs/common';
import { CreatePropertyAssetMediaUploadIntentDto } from './dto/create-property-asset-media-upload-intent.dto';
import { ConfirmPropertyAssetMediaDto } from './dto/confirm-property-asset-media.dto';
import { UpdatePropertyAssetMediaDto } from './dto/update-property-asset-media.dto';
import { ReorderPropertyAssetMediaDto } from './dto/reorder-property-asset-media.dto';
import { BadRequestException, Body, Controller, Get, Headers, HttpCode, Param, Patch, Post, Req, Res, UseGuards } from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { Types } from 'mongoose';
import { MarketplaceAccountGuard } from '../../shared/marketplace-account/marketplace-account.guard';
import { requireMarketplaceAccountContext } from '../../shared/marketplace-account/marketplace-account-context.middleware';
import { AppException } from '../../shared/errors/app-exception';
import { ErrorCode } from '../../shared/errors/error-codes';
import { IdempotencyService } from '../../shared/idempotency/idempotency.service';
import { CreatePropertyAssetDto } from './dto/create-property-asset.dto';
import { CreateListingDto } from './dto/create-listing.dto';
import { UnpublishListingDto } from './dto/unpublish-listing.dto';
import { ConfirmActualityDto } from './dto/confirm-actuality.dto';
import { OverrideDuplicateDto } from './dto/override-duplicate.dto';
import { MarketplacePropertyAssetsService } from './marketplace-property-assets.service';
import { DedupeService } from './dedupe.service';
import { ActualityService } from './actuality.service';

function objectId(value: string, field: string): Types.ObjectId {
  if (!Types.ObjectId.isValid(value)) throw new BadRequestException(`${field} must be a valid ObjectId`);
  return new Types.ObjectId(value);
}

/**
 * Owner/realtor marketplace publishing wizard: зеркало
 * PropertyAssetsController (ERP), но `@UseGuards(MarketplaceAccountGuard)`
 * вместо `TenantGuard`/`PermissionGuard` — авторизация на уровне данных
 * (identityId в publisherScope должен совпадать с сессией), не через
 * PermissionGrant-матрицу (у marketplace-аккаунта нет Organization/Position,
 * которым назначаются гранты). Тот же путь `/property-assets/...`, но под
 * префиксом `/marketplace/` — разные security-границы для одной и той же
 * предметной области, тот же принцип, что уже применён к разделению public/
 * admin publication-контроллеров (D-04A/D-06).
 */
@Controller('marketplace/property-assets')
@UseGuards(MarketplaceAccountGuard)
export class MarketplacePropertyAssetsController {
  constructor(
    private readonly service: MarketplacePropertyAssetsService,
    private readonly idempotencyService: IdempotencyService,
    private readonly dedupeService: DedupeService,
    private readonly actualityService: ActualityService,
  ) {}

  @Post()
  @HttpCode(201)
  async create(
    @Req() req: FastifyRequest,
    @Body() dto: CreatePropertyAssetDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    const account = requireMarketplaceAccountContext(req);
    if (!idempotencyKey) {
      throw new AppException(ErrorCode.IDEMPOTENCY_KEY_REQUIRED, 'Idempotency-Key header is required');
    }

    const identityId = new Types.ObjectId(account.identityId);
    const requestBody = {
      propertyType: dto.propertyType,
      address: dto.location?.address ?? null,
      area: dto.characteristics?.area ?? null,
      representativePhone: dto.representativePhone ?? null,
    };

    const replay = await this.service.checkCreateReplay(identityId, 'marketplaceCreateAsset', idempotencyKey, requestBody);
    if (replay) {
      return replay.responseBody;
    }

    return this.service.createAsset(identityId, dto, { key: idempotencyKey, requestBody });
  }

  @Get()
  list(@Req() req: FastifyRequest) {
    const account = requireMarketplaceAccountContext(req);
    return this.service.listAssets(new Types.ObjectId(account.identityId));
  }

  @Get(':assetId')
  get(@Req() req: FastifyRequest, @Param('assetId') assetId: string) {
    const account = requireMarketplaceAccountContext(req);
    return this.service.getAsset(objectId(assetId, 'assetId'), new Types.ObjectId(account.identityId));
  }


  // --- MEDIA VERTICAL (MKT-004) ---

  @Post(':assetId/media/upload-intent')
  @HttpCode(201)
  createMediaUploadIntent(
    @Req() req: FastifyRequest,
    @Param('assetId') assetId: string,
    @Body() dto: CreatePropertyAssetMediaUploadIntentDto,
  ) {
    const account = requireMarketplaceAccountContext(req);
    return this.service.createMediaUploadIntent(
      objectId(assetId, 'assetId'),
      new Types.ObjectId(account.identityId),
      dto,
    );
  }

  @Post(':assetId/media/:mediaAssetId/confirm')
  @HttpCode(200)
  confirmMediaUpload(
    @Req() req: FastifyRequest,
    @Param('assetId') assetId: string,
    @Param('mediaAssetId') mediaAssetId: string,
    @Body() dto?: ConfirmPropertyAssetMediaDto,
  ) {
    const account = requireMarketplaceAccountContext(req);
    return this.service.confirmMediaUpload(
      objectId(assetId, 'assetId'),
      objectId(mediaAssetId, 'mediaAssetId'),
      new Types.ObjectId(account.identityId),
      req.correlationId,
      dto,
    );
  }

  @Get(':assetId/media')
  listMedia(@Req() req: FastifyRequest, @Param('assetId') assetId: string) {
    const account = requireMarketplaceAccountContext(req);
    return this.service.listMedia(objectId(assetId, 'assetId'), new Types.ObjectId(account.identityId));
  }

  @Delete(':assetId/media/:mediaAssetId')
  deleteMedia(
    @Req() req: FastifyRequest,
    @Param('assetId') assetId: string,
    @Param('mediaAssetId') mediaAssetId: string,
  ) {
    const account = requireMarketplaceAccountContext(req);
    return this.service.deleteMedia(
      objectId(assetId, 'assetId'),
      objectId(mediaAssetId, 'mediaAssetId'),
      new Types.ObjectId(account.identityId),
    );
  }

  @Patch(':assetId/media/:mediaAssetId')
  updateMediaItem(
    @Req() req: FastifyRequest,
    @Param('assetId') assetId: string,
    @Param('mediaAssetId') mediaAssetId: string,
    @Body() dto: UpdatePropertyAssetMediaDto,
  ) {
    const account = requireMarketplaceAccountContext(req);
    return this.service.updateMediaItem(
      objectId(assetId, 'assetId'),
      objectId(mediaAssetId, 'mediaAssetId'),
      new Types.ObjectId(account.identityId),
      dto,
    );
  }

  @Put(':assetId/media/order')
  reorderMedia(
    @Req() req: FastifyRequest,
    @Param('assetId') assetId: string,
    @Body() dto: ReorderPropertyAssetMediaDto,
  ) {
    const account = requireMarketplaceAccountContext(req);
    return this.service.reorderMedia(
      objectId(assetId, 'assetId'),
      new Types.ObjectId(account.identityId),
      dto.items,
    );
  }

  @Post(':assetId/listings')
  @HttpCode(201)
  async createListing(
    @Req() req: FastifyRequest,
    @Param('assetId') assetId: string,
    @Body() dto: CreateListingDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    const account = requireMarketplaceAccountContext(req);
    if (!idempotencyKey) {
      throw new AppException(ErrorCode.IDEMPOTENCY_KEY_REQUIRED, 'Idempotency-Key header is required');
    }

    const identityId = new Types.ObjectId(account.identityId);
    const requestBody = {
      assetId,
      dealType: dto.dealType,
      price: dto.price ? { ...dto.price } : null,
    };

    const replay = await this.service.checkCreateReplay(
      identityId,
      'marketplaceCreateListing',
      idempotencyKey,
      requestBody,
    );
    if (replay) {
      return replay.responseBody;
    }

    return this.service.createListing(objectId(assetId, 'assetId'), identityId, dto, {
      key: idempotencyKey,
      requestBody,
    });
  }

  @Get(':assetId/listings')
  listListings(@Req() req: FastifyRequest, @Param('assetId') assetId: string) {
    const account = requireMarketplaceAccountContext(req);
    return this.service.listListings(objectId(assetId, 'assetId'), new Types.ObjectId(account.identityId));
  }

  @Patch(':assetId/listings/:listingId/activate')
  activateListing(@Req() req: FastifyRequest, @Param('assetId') assetId: string, @Param('listingId') listingId: string) {
    const account = requireMarketplaceAccountContext(req);
    return this.service.activateListing(
      objectId(listingId, 'listingId'),
      objectId(assetId, 'assetId'),
      new Types.ObjectId(account.identityId),
    );
  }

  @Post(':assetId/listings/:listingId/publish')
  async publishListing(
    @Req() req: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
    @Param('assetId') assetId: string,
    @Param('listingId') listingId: string,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    const account = requireMarketplaceAccountContext(req);

    if (!idempotencyKey) {
      throw new AppException(ErrorCode.IDEMPOTENCY_KEY_REQUIRED, 'Idempotency-Key header is required');
    }

    const identityId = new Types.ObjectId(account.identityId);
    const requestBody = { listingId };

    const replay = await this.idempotencyService.checkReplay({
      identityId,
      operation: 'publishListingMarketplace',
      key: idempotencyKey,
      requestBody,
    });
    if (replay) {
      reply.status(replay.responseStatus);
      return replay.responseBody;
    }

    const result = await this.service.publishListing({
      listingId: objectId(listingId, 'listingId'),
      assetId: objectId(assetId, 'assetId'),
      identityId,
      idempotencyKey,
      correlationId: req.correlationId,
    });

    if (result.replay) {
      reply.status(result.replay.responseStatus);
      return result.replay.responseBody;
    }

    reply.status(202);
    return {
      id: result.publicationId.toString(),
      sourceType: 'listing',
      sourceId: listingId,
      status: result.status,
    };
  }

  @Post(':assetId/listings/:listingId/unpublish')
  async unpublishListing(
    @Req() req: FastifyRequest,
    @Param('assetId') assetId: string,
    @Param('listingId') listingId: string,
    @Body() dto: UnpublishListingDto,
  ) {
    const account = requireMarketplaceAccountContext(req);
    const identityId = new Types.ObjectId(account.identityId);

    await this.service.unpublishListing({
      listingId: objectId(listingId, 'listingId'),
      assetId: objectId(assetId, 'assetId'),
      identityId,
      reason: dto.reason,
      correlationId: req.correlationId,
    });

    return this.service.getListingPublicationStatus(objectId(listingId, 'listingId'), objectId(assetId, 'assetId'), identityId);
  }

  @Get(':assetId/listings/:listingId/publication-status')
  getPublicationStatus(@Req() req: FastifyRequest, @Param('assetId') assetId: string, @Param('listingId') listingId: string) {
    const account = requireMarketplaceAccountContext(req);
    return this.service.getListingPublicationStatus(
      objectId(listingId, 'listingId'),
      objectId(assetId, 'assetId'),
      new Types.ObjectId(account.identityId),
    );
  }

  @Patch(':assetId/listings/:listingId/confirm-actuality')
  async confirmActuality(
    @Req() req: FastifyRequest,
    @Param('assetId') assetId: string,
    @Param('listingId') listingId: string,
    @Body() dto: ConfirmActualityDto,
  ) {
    const account = requireMarketplaceAccountContext(req);
    const identityId = new Types.ObjectId(account.identityId);
    await this.actualityService.confirmActualityForIdentity({
      listingId: objectId(listingId, 'listingId'),
      assetId: objectId(assetId, 'assetId'),
      identityId,
      expectedVersion: dto.expectedVersion,
    });
    return this.actualityService.getActualityStateForIdentity(objectId(listingId, 'listingId'), objectId(assetId, 'assetId'), identityId);
  }

  @Get(':assetId/listings/:listingId/actuality')
  getActuality(@Req() req: FastifyRequest, @Param('assetId') assetId: string, @Param('listingId') listingId: string) {
    const account = requireMarketplaceAccountContext(req);
    return this.actualityService.getActualityStateForIdentity(
      objectId(listingId, 'listingId'),
      objectId(assetId, 'assetId'),
      new Types.ObjectId(account.identityId),
    );
  }

  @Get(':assetId/duplicate-candidates')
  async getDuplicateCandidates(@Req() req: FastifyRequest, @Param('assetId') assetId: string) {
    const account = requireMarketplaceAccountContext(req);
    await this.service.getAsset(objectId(assetId, 'assetId'), new Types.ObjectId(account.identityId));
    const candidates = await this.dedupeService.getCandidatesForAsset(objectId(assetId, 'assetId'));
    return candidates.map((c) => ({
      id: c._id.toString(),
      status: c.status,
      signals: c.signals,
      overrideReason: c.overrideReason,
      overrideAt: c.overrideAt ? c.overrideAt.toISOString() : undefined,
      detectedAt: c.detectedAt ? c.detectedAt.toISOString() : undefined,
    }));
  }

  /**
   * DEDUPE-001: owner override — DedupeService.overrideDuplicate проверяет,
   * что marketplace-аккаунт владеет хотя бы одной из сторон candidate
   * (publisherScope.marketplace_account === session.identityId). Чужой
   * candidate получает 404 (non-disclosure).
   */
  @Post('duplicate-candidates/:duplicateCandidateId/override')
  async overrideDuplicate(
    @Req() req: FastifyRequest,
    @Param('duplicateCandidateId') duplicateCandidateId: string,
    @Body() dto: OverrideDuplicateDto,
  ) {
    const account = requireMarketplaceAccountContext(req);
    const actorIdentityId = new Types.ObjectId(account.identityId);
    await this.dedupeService.overrideDuplicate({
      duplicateCandidateId: objectId(duplicateCandidateId, 'duplicateCandidateId'),
      reason: dto.reason,
      actorScope: { type: 'marketplace_account', identityId: actorIdentityId },
      actorIdentityId,
      correlationId: req.correlationId,
    });
    return { id: duplicateCandidateId, status: 'override_not_duplicate' };
  }
}
