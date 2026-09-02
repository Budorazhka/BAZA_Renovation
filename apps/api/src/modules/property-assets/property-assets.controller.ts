import { Delete, Put } from '@nestjs/common';
import { CreatePropertyAssetMediaUploadIntentDto } from './dto/create-property-asset-media-upload-intent.dto';
import { ConfirmPropertyAssetMediaDto } from './dto/confirm-property-asset-media.dto';
import { UpdatePropertyAssetMediaDto } from './dto/update-property-asset-media.dto';
import { ReorderPropertyAssetMediaDto } from './dto/reorder-property-asset-media.dto';
import { BadRequestException, Body, Controller, Get, Headers, HttpCode, Param, Patch, Post, Query, Req, Res, UseGuards } from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { Types } from 'mongoose';
import { TenantGuard } from '../../shared/tenant/tenant.guard';
import { requireTenantContext } from '../../shared/tenant/tenant-context.middleware';
import { PermissionGuard } from '../authorization/permission.guard';
import { RequirePermission } from '../authorization/require-permission.decorator';
import { AppException } from '../../shared/errors/app-exception';
import { ErrorCode } from '../../shared/errors/error-codes';
import { IdempotencyService } from '../../shared/idempotency/idempotency.service';
import { CreatePropertyAssetDto } from './dto/create-property-asset.dto';
import { CreateListingDto } from './dto/create-listing.dto';
import { UnpublishListingDto } from './dto/unpublish-listing.dto';
import { ConfirmActualityDto } from './dto/confirm-actuality.dto';
import { OverrideDuplicateDto } from './dto/override-duplicate.dto';
import { PropertyAssetsService } from './property-assets.service';
import { DedupeService } from './dedupe.service';
import { ActualityService } from './actuality.service';

function objectId(value: string, field: string): Types.ObjectId {
  if (!Types.ObjectId.isValid(value)) throw new BadRequestException(`${field} must be a valid ObjectId`);
  return new Types.ObjectId(value);
}

@Controller('property-assets')
@UseGuards(TenantGuard, PermissionGuard)
export class PropertyAssetsController {
  constructor(
    private readonly service: PropertyAssetsService,
    private readonly idempotencyService: IdempotencyService,
    private readonly dedupeService: DedupeService,
    private readonly actualityService: ActualityService,
  ) {}

  @Post()
  @HttpCode(201)
  @RequirePermission('property_asset', 'create')
  async create(
    @Req() req: FastifyRequest,
    @Body() dto: CreatePropertyAssetDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    const tenant = requireTenantContext(req);
    if (!idempotencyKey) {
      throw new AppException(ErrorCode.IDEMPOTENCY_KEY_REQUIRED, 'Idempotency-Key header is required');
    }

    const identityId = new Types.ObjectId(tenant.identityId);
    const requestBody = {
      propertyType: dto.propertyType,
      address: dto.location?.address ?? null,
      area: dto.characteristics?.area ?? null,
      representativePhone: dto.representativePhone ?? null,
    };

    const replay = await this.service.checkCreateReplay(identityId, 'erpCreateAsset', idempotencyKey, requestBody);
    if (replay) {
      return replay.responseBody;
    }

    return this.service.createAsset(new Types.ObjectId(tenant.organizationId), dto, {
      identityId,
      key: idempotencyKey,
      requestBody,
    });
  }

  @Get()
  @RequirePermission('property_asset', 'read')
  list(@Req() req: FastifyRequest) {
    const tenant = requireTenantContext(req);
    return this.service.listAssets(new Types.ObjectId(tenant.organizationId));
  }

  @Get(':assetId')
  @RequirePermission('property_asset', 'read')
  get(@Req() req: FastifyRequest, @Param('assetId') assetId: string) {
    const tenant = requireTenantContext(req);
    return this.service.getAsset(objectId(assetId, 'assetId'), new Types.ObjectId(tenant.organizationId));
  }


  // --- MEDIA VERTICAL (MKT-004) ---

  @Post(':assetId/media/upload-intent')
  @HttpCode(201)
  @RequirePermission('property_asset', 'edit')
  createMediaUploadIntent(
    @Req() req: FastifyRequest,
    @Param('assetId') assetId: string,
    @Body() dto: CreatePropertyAssetMediaUploadIntentDto,
  ) {
    const tenant = requireTenantContext(req);
    return this.service.createMediaUploadIntent(
      objectId(assetId, 'assetId'),
      new Types.ObjectId(tenant.organizationId),
      dto,
    );
  }

  @Post(':assetId/media/:mediaAssetId/confirm')
  @HttpCode(200)
  @RequirePermission('property_asset', 'edit')
  confirmMediaUpload(
    @Req() req: FastifyRequest,
    @Param('assetId') assetId: string,
    @Param('mediaAssetId') mediaAssetId: string,
    @Body() dto?: ConfirmPropertyAssetMediaDto,
  ) {
    const tenant = requireTenantContext(req);
    return this.service.confirmMediaUpload(
      objectId(assetId, 'assetId'),
      objectId(mediaAssetId, 'mediaAssetId'),
      new Types.ObjectId(tenant.organizationId),
      new Types.ObjectId(tenant.identityId),
      req.correlationId,
      dto,
    );
  }

  @Get(':assetId/media')
  @RequirePermission('property_asset', 'read')
  listMedia(@Req() req: FastifyRequest, @Param('assetId') assetId: string) {
    const tenant = requireTenantContext(req);
    return this.service.listMedia(objectId(assetId, 'assetId'), new Types.ObjectId(tenant.organizationId));
  }

  @Delete(':assetId/media/:mediaAssetId')
  @RequirePermission('property_asset', 'edit')
  deleteMedia(
    @Req() req: FastifyRequest,
    @Param('assetId') assetId: string,
    @Param('mediaAssetId') mediaAssetId: string,
  ) {
    const tenant = requireTenantContext(req);
    return this.service.deleteMedia(
      objectId(assetId, 'assetId'),
      objectId(mediaAssetId, 'mediaAssetId'),
      new Types.ObjectId(tenant.organizationId),
    );
  }

  @Patch(':assetId/media/:mediaAssetId')
  @RequirePermission('property_asset', 'edit')
  updateMediaItem(
    @Req() req: FastifyRequest,
    @Param('assetId') assetId: string,
    @Param('mediaAssetId') mediaAssetId: string,
    @Body() dto: UpdatePropertyAssetMediaDto,
  ) {
    const tenant = requireTenantContext(req);
    return this.service.updateMediaItem(
      objectId(assetId, 'assetId'),
      objectId(mediaAssetId, 'mediaAssetId'),
      new Types.ObjectId(tenant.organizationId),
      dto,
    );
  }

  @Put(':assetId/media/order')
  @RequirePermission('property_asset', 'edit')
  reorderMedia(
    @Req() req: FastifyRequest,
    @Param('assetId') assetId: string,
    @Body() dto: ReorderPropertyAssetMediaDto,
  ) {
    const tenant = requireTenantContext(req);
    return this.service.reorderMedia(
      objectId(assetId, 'assetId'),
      new Types.ObjectId(tenant.organizationId),
      dto.items,
    );
  }

  @Post(':assetId/listings')
  @HttpCode(201)
  @RequirePermission('listing', 'create')
  async createListing(
    @Req() req: FastifyRequest,
    @Param('assetId') assetId: string,
    @Body() dto: CreateListingDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    const tenant = requireTenantContext(req);
    if (!idempotencyKey) {
      throw new AppException(ErrorCode.IDEMPOTENCY_KEY_REQUIRED, 'Idempotency-Key header is required');
    }

    const identityId = new Types.ObjectId(tenant.identityId);
    const requestBody = { assetId, dealType: dto.dealType, price: dto.price ? { ...dto.price } : null };

    const replay = await this.service.checkCreateReplay(identityId, 'erpCreateListing', idempotencyKey, requestBody);
    if (replay) {
      return replay.responseBody;
    }

    return this.service.createListing(objectId(assetId, 'assetId'), new Types.ObjectId(tenant.organizationId), dto, {
      identityId,
      key: idempotencyKey,
      requestBody,
    });
  }

  @Get(':assetId/listings')
  @RequirePermission('listing', 'read')
  listListings(@Req() req: FastifyRequest, @Param('assetId') assetId: string) {
    const tenant = requireTenantContext(req);
    return this.service.listListings(objectId(assetId, 'assetId'), new Types.ObjectId(tenant.organizationId));
  }

  @Patch(':assetId/listings/:listingId/activate')
  @RequirePermission('listing', 'edit')
  activateListing(@Req() req: FastifyRequest, @Param('assetId') assetId: string, @Param('listingId') listingId: string) {
    const tenant = requireTenantContext(req);
    return this.service.activateListing(
      objectId(listingId, 'listingId'),
      objectId(assetId, 'assetId'),
      new Types.ObjectId(tenant.organizationId),
      new Types.ObjectId(tenant.identityId),
    );
  }

  /**
   * MKT-002: ADR-005/ADR-006 паттерн, тот же, что
   * DevelopmentsController.publishDevelopment — 202 Accepted, worker
   * строит проекцию асинхронно. Idempotency-Key обязателен; повторный
   * запрос с тем же ключом и тем же listingId возвращает сохранённый
   * ответ, другой listingId под тем же ключом — IDEMPOTENCY_KEY_CONFLICT
   * (проверяется IdempotencyService.checkReplay через requestHash).
   */
  @Post(':assetId/listings/:listingId/publish')
  @RequirePermission('listing', 'edit')
  async publishListing(
    @Req() req: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
    @Param('assetId') assetId: string,
    @Param('listingId') listingId: string,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    const tenant = requireTenantContext(req);

    if (!idempotencyKey) {
      throw new AppException(ErrorCode.IDEMPOTENCY_KEY_REQUIRED, 'Idempotency-Key header is required');
    }

    const actorIdentityId = new Types.ObjectId(tenant.identityId);
    const requestBody = { listingId };

    const replay = await this.idempotencyService.checkReplay({
      identityId: actorIdentityId,
      operation: 'publishListing',
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
      organizationId: new Types.ObjectId(tenant.organizationId),
      actorIdentityId,
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

  /**
   * MKT-002: owner-unpublish — синхронный, тот же PublicationService.unpublish,
   * что admin unpublish (D-06), actor:'identity'. reason обязателен.
   */
  @Post(':assetId/listings/:listingId/unpublish')
  @RequirePermission('listing', 'edit')
  async unpublishListing(
    @Req() req: FastifyRequest,
    @Param('assetId') assetId: string,
    @Param('listingId') listingId: string,
    @Body() dto: UnpublishListingDto,
  ) {
    const tenant = requireTenantContext(req);

    await this.service.unpublishListing({
      listingId: objectId(listingId, 'listingId'),
      assetId: objectId(assetId, 'assetId'),
      organizationId: new Types.ObjectId(tenant.organizationId),
      reason: dto.reason,
      actorIdentityId: new Types.ObjectId(tenant.identityId),
      correlationId: req.correlationId,
    });

    return this.service.getListingPublicationStatus(
      objectId(listingId, 'listingId'),
      objectId(assetId, 'assetId'),
      new Types.ObjectId(tenant.organizationId),
    );
  }

  @Get(':assetId/listings/:listingId/publication-status')
  @RequirePermission('listing', 'read')
  getPublicationStatus(@Req() req: FastifyRequest, @Param('assetId') assetId: string, @Param('listingId') listingId: string) {
    const tenant = requireTenantContext(req);
    return this.service.getListingPublicationStatus(
      objectId(listingId, 'listingId'),
      objectId(assetId, 'assetId'),
      new Types.ObjectId(tenant.organizationId),
    );
  }

  /**
   * Часть 1: недельная история версий карточки — тот же permission, что
   * остальные read-эндпоинты над этим listing/asset (не изобретаем новый
   * resource). `listingId` опционален (query) — без него возвращается вся
   * история asset'а, включая `asset_created` (до появления любого listing).
   */
  @Get(':assetId/revisions')
  @RequirePermission('listing', 'read')
  listRevisions(@Req() req: FastifyRequest, @Param('assetId') assetId: string, @Query('listingId') listingId?: string) {
    const tenant = requireTenantContext(req);
    return this.service.listRevisions(
      objectId(assetId, 'assetId'),
      new Types.ObjectId(tenant.organizationId),
      listingId ? objectId(listingId, 'listingId') : undefined,
    );
  }

  /**
   * ACT-001: владелец подтверждает актуальность — сбрасывает
   * actuality-часы, listing остаётся active (не публикует заново, если
   * был unpublished — republish отдельный явный шаг).
   */
  @Patch(':assetId/listings/:listingId/confirm-actuality')
  @RequirePermission('listing', 'edit')
  async confirmActuality(
    @Req() req: FastifyRequest,
    @Param('assetId') assetId: string,
    @Param('listingId') listingId: string,
    @Body() dto: ConfirmActualityDto,
  ) {
    const tenant = requireTenantContext(req);
    await this.actualityService.confirmActuality({
      listingId: objectId(listingId, 'listingId'),
      assetId: objectId(assetId, 'assetId'),
      organizationId: new Types.ObjectId(tenant.organizationId),
      expectedVersion: dto.expectedVersion,
    });
    return this.getActuality(req, assetId, listingId);
  }

  @Get(':assetId/listings/:listingId/actuality')
  @RequirePermission('listing', 'read')
  getActuality(@Req() req: FastifyRequest, @Param('assetId') assetId: string, @Param('listingId') listingId: string) {
    const tenant = requireTenantContext(req);
    return this.actualityService.getActualityState(
      objectId(listingId, 'listingId'),
      objectId(assetId, 'assetId'),
      new Types.ObjectId(tenant.organizationId),
    );
  }

  @Get(':assetId/duplicate-candidates')
  @RequirePermission('listing', 'read')
  async getDuplicateCandidates(@Req() req: FastifyRequest, @Param('assetId') assetId: string) {
    const tenant = requireTenantContext(req);
    await this.service.getAsset(objectId(assetId, 'assetId'), new Types.ObjectId(tenant.organizationId));
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
   * DEDUPE-001: owner override (xlsx #70) — "Я ПОДТВЕРЖДАЮ ЧТО ЭТО НЕ
   * ДУБЛЬ". DedupeService.overrideDuplicate проверяет, что организация
   * владеет хотя бы одной из сторон candidate (publisherScope.organization === tenant.organizationId).
   * Чужой candidate получает 404 (non-disclosure).
   */
  @Post('duplicate-candidates/:duplicateCandidateId/override')
  @RequirePermission('listing', 'edit')
  async overrideDuplicate(
    @Req() req: FastifyRequest,
    @Param('duplicateCandidateId') duplicateCandidateId: string,
    @Body() dto: OverrideDuplicateDto,
  ) {
    const tenant = requireTenantContext(req);
    await this.dedupeService.overrideDuplicate({
      duplicateCandidateId: objectId(duplicateCandidateId, 'duplicateCandidateId'),
      reason: dto.reason,
      actorScope: { type: 'organization', organizationId: new Types.ObjectId(tenant.organizationId) },
      actorIdentityId: new Types.ObjectId(tenant.identityId),
      correlationId: req.correlationId,
    });
    return { id: duplicateCandidateId, status: 'override_not_duplicate' };
  }
}
