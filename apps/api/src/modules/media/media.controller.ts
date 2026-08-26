import { Body, Controller, HttpCode, Param, Post, Req, UseGuards } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { Types } from 'mongoose';
import { TenantGuard } from '../../shared/tenant/tenant.guard';
import { requireTenantContext } from '../../shared/tenant/tenant-context.middleware';
import { PermissionGuard } from '../authorization/permission.guard';
import { RequirePermission } from '../authorization/require-permission.decorator';
import { AppException } from '../../shared/errors/app-exception';
import { ErrorCode } from '../../shared/errors/error-codes';
import { MediaService } from './media.service';
import { CreateUploadIntentDto } from './dto/create-upload-intent.dto';
import { MEDIA_PURPOSE_BUCKET } from './media.constants';

/**
 * ERP tenant-scoped media endpoints (ADR-008). Ограничено organization
 * ownerScope в этом первом проходе — marketplace_account (независимый
 * собственник без ERP) upload flow требует marketplace-audience сессии
 * (ADR-004), которая ещё не имеет собственного tenant-эквивалента guard'а;
 * не реализуется здесь как заглушка, а оставлено явно вне scope C-09
 * до появления реального marketplace self-serve сценария.
 *
 * permission-matrix.md не специфицирует media-права явно (документ Stage B
 * написан до появления media-модуля как реализуемой сущности в Stage C) —
 * resource `media_asset` / action `upload` введены здесь, следуют тому же
 * `resource.action` формату, что и остальная матрица. Зафиксировано явно,
 * не введено молча — при следующем ревью permission-matrix.md этот раздел
 * должен быть добавлен туда как источник истины, а не только жить в коде.
 */
@Controller('media')
@UseGuards(TenantGuard, PermissionGuard)
export class MediaController {
  constructor(private readonly mediaService: MediaService) {}

  @Post('upload-intent')
  @HttpCode(201)
  @RequirePermission('media_asset', 'upload')
  async createUploadIntent(
    @Req() req: FastifyRequest,
    @Body() dto: CreateUploadIntentDto,
  ): Promise<{ assetId: string; uploadUrl: string }> {
    const tenantContext = requireTenantContext(req);

    // DTO уже валидирует purpose через @IsIn(Object.keys(MEDIA_PURPOSE_BUCKET)),
    // но noUncheckedIndexedAccess типизирует lookup как possibly-undefined —
    // явная проверка вместо non-null assertion, чтобы не полагаться молча
    // на то, что DTO-валидация не изменится в будущем.
    const bucket = MEDIA_PURPOSE_BUCKET[dto.purpose];
    if (!bucket) {
      throw new AppException(ErrorCode.VALIDATION_FAILED, `Unknown media purpose: ${dto.purpose}`);
    }

    return this.mediaService.createUploadIntent({
      ownerScope: { type: 'organization', organizationId: new Types.ObjectId(tenantContext.organizationId) },
      declaredMimeType: dto.declaredMimeType,
      sizeBytes: dto.sizeBytes,
      purpose: dto.purpose,
      bucket,
    });
  }

  @Post(':assetId/confirm')
  @HttpCode(200)
  @RequirePermission('media_asset', 'upload')
  async confirmUpload(
    @Req() req: FastifyRequest,
    @Param('assetId') assetIdParam: string,
  ): Promise<{ status: 'verified' | 'rejected' }> {
    const tenantContext = requireTenantContext(req);

    return this.mediaService.confirmUpload({
      assetId: new Types.ObjectId(assetIdParam),
      actorIdentityId: new Types.ObjectId(tenantContext.identityId),
      expectedOwnerScope: {
        type: 'organization',
        organizationId: new Types.ObjectId(tenantContext.organizationId),
      },
      correlationId: req.correlationId,
    });
  }
}
