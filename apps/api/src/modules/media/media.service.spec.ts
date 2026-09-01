import { NotFoundException } from '@nestjs/common';
import { Types } from 'mongoose';
import { MediaService } from './media.service';
import { MediaObjectTooLargeError, type MediaAssetRepository, type MediaStorageService } from '@baza/media-storage';
import type { OwnerScope } from '@baza/tenant-scope';
import type { MediaMimeVerifierService } from './media-mime-verifier.service';
import type { AuditService } from '../audit/audit.service';
import type { OutboxService } from '../outbox/outbox.service';

function makeMockConnection() {
  return {
    startSession: jest.fn().mockResolvedValue({
      withTransaction: async (work: () => Promise<unknown>) => work(),
      endSession: jest.fn().mockResolvedValue(undefined),
    }),
  };
}

function makeOwnerScope(organizationId: Types.ObjectId): OwnerScope {
  return { type: 'organization', organizationId };
}

describe('MediaService.confirmUpload', () => {
  /**
   * ADR-002 требование 1 (tenant escape prevention) — найдено ревью как
   * critical: без этой проверки любая организация могла confirmить чужой
   * media_asset (прочитать содержимое, сменить статус, триггернуть worker).
   */
  it('бросает NotFoundException, если asset принадлежит ДРУГОЙ организации (IDOR)', async () => {
    const assetId = new Types.ObjectId();
    const actualOwnerOrgId = new Types.ObjectId();
    const attackerOrgId = new Types.ObjectId();
    const asset = {
      _id: assetId,
      ownerScope: makeOwnerScope(actualOwnerOrgId),
      bucket: 'private' as const,
      originalPath: `${assetId.toString()}/original.pdf`,
      declaredMimeType: 'application/pdf',
    };

    const findByIdSpy = jest.fn().mockResolvedValue(asset);
    const readObjectSpy = jest.fn();
    const verifySpy = jest.fn();
    const markVerifiedSpy = jest.fn();
    const markRejectedSpy = jest.fn();
    const auditAppendSpy = jest.fn();
    const outboxPublishSpy = jest.fn();

    const service = new MediaService(
      makeMockConnection() as never,
      {
        findById: findByIdSpy,
        markVerified: markVerifiedSpy,
        markRejected: markRejectedSpy,
      } as unknown as MediaAssetRepository,
      { readObject: readObjectSpy } as unknown as MediaStorageService,
      { verify: verifySpy } as unknown as MediaMimeVerifierService,
      { append: auditAppendSpy } as unknown as AuditService,
      { publish: outboxPublishSpy } as unknown as OutboxService,
    );

    await expect(
      service.confirmUpload({
        assetId,
        actorIdentityId: new Types.ObjectId(),
        expectedOwnerScope: makeOwnerScope(attackerOrgId),
        correlationId: 'test-correlation-id',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);

    // Атакующий не должен получить доступ к содержимому файла (readObject),
    // не должен вызвать verify, не должен изменить статус чужого asset,
    // не должен создать audit-запись или outbox-событие для чужого файла.
    expect(readObjectSpy).not.toHaveBeenCalled();
    expect(verifySpy).not.toHaveBeenCalled();
    expect(markVerifiedSpy).not.toHaveBeenCalled();
    expect(markRejectedSpy).not.toHaveBeenCalled();
    expect(auditAppendSpy).not.toHaveBeenCalled();
    expect(outboxPublishSpy).not.toHaveBeenCalled();
  });

  it('бросает NotFoundException, если asset вообще не найден', async () => {
    const findByIdSpy = jest.fn().mockResolvedValue(null);

    const service = new MediaService(
      makeMockConnection() as never,
      { findById: findByIdSpy } as unknown as MediaAssetRepository,
      {} as MediaStorageService,
      {} as MediaMimeVerifierService,
      {} as AuditService,
      {} as OutboxService,
    );

    await expect(
      service.confirmUpload({
        assetId: new Types.ObjectId(),
        actorIdentityId: new Types.ObjectId(),
        expectedOwnerScope: makeOwnerScope(new Types.ObjectId()),
        correlationId: 'test-correlation-id',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  /**
   * ADR-008: файл, не прошедший magic-byte verify, помечается rejected —
   * не verified, не публикует MediaVerified outbox-событие (worker не
   * должен генерировать derivative-варианты для отклонённого файла).
   */
  it('помечает asset rejected и НЕ публикует outbox-событие, если MIME не прошёл verify', async () => {
    const assetId = new Types.ObjectId();
    const organizationId = new Types.ObjectId();
    const asset = {
      _id: assetId,
      ownerScope: makeOwnerScope(organizationId),
      bucket: 'public' as const,
      originalPath: `${assetId.toString()}/original.jpg`,
      declaredMimeType: 'image/jpeg',
    };

    const findByIdSpy = jest.fn().mockResolvedValue(asset);
    const markRejectedSpy = jest.fn().mockResolvedValue({ modifiedCount: 1 });
    const markVerifiedSpy = jest.fn();
    const readObjectSpy = jest.fn().mockResolvedValue(Buffer.from('fake-bytes'));
    const verifySpy = jest.fn().mockResolvedValue({
      verified: false,
      checksum: 'abc123',
      rejectionReason: 'MIME не входит в allowlist',
    });
    const auditAppendSpy = jest.fn().mockResolvedValue(undefined);
    const outboxPublishSpy = jest.fn();

    const service = new MediaService(
      makeMockConnection() as never,
      { findById: findByIdSpy, markRejected: markRejectedSpy, markVerified: markVerifiedSpy } as unknown as MediaAssetRepository,
      { readObject: readObjectSpy } as unknown as MediaStorageService,
      { verify: verifySpy } as unknown as MediaMimeVerifierService,
      { append: auditAppendSpy } as unknown as AuditService,
      { publish: outboxPublishSpy } as unknown as OutboxService,
    );

    const result = await service.confirmUpload({
      assetId,
      actorIdentityId: new Types.ObjectId(),
      expectedOwnerScope: makeOwnerScope(organizationId),
      correlationId: 'test-correlation-id',
    });

    expect(result).toEqual({ status: 'rejected' });
    expect(markRejectedSpy).toHaveBeenCalledWith(assetId, 'MIME не входит в allowlist', expect.anything());
    expect(markVerifiedSpy).not.toHaveBeenCalled();
    expect(outboxPublishSpy).not.toHaveBeenCalled();
    expect(auditAppendSpy).toHaveBeenCalledTimes(1);
  });

  /**
   * Security review: presigned upload раньше не имел серверной проверки
   * фактического размера объекта — MediaStorageService.readObject теперь
   * бросает MediaObjectTooLargeError (HEAD-проверка до чтения тела в
   * память), confirmUpload должен трактовать это как обычный reject, не
   * как 500 и не буферизовать объект.
   */
  it('помечает asset rejected, если объект в storage превышает лимит размера (MediaObjectTooLargeError)', async () => {
    const assetId = new Types.ObjectId();
    const organizationId = new Types.ObjectId();
    const asset = {
      _id: assetId,
      ownerScope: makeOwnerScope(organizationId),
      bucket: 'public' as const,
      originalPath: `${assetId.toString()}/original.jpg`,
      declaredMimeType: 'image/jpeg',
    };

    const findByIdSpy = jest.fn().mockResolvedValue(asset);
    const markRejectedSpy = jest.fn().mockResolvedValue({ modifiedCount: 1 });
    const markVerifiedSpy = jest.fn();
    const readObjectSpy = jest.fn().mockRejectedValue(new MediaObjectTooLargeError(50_000_000, 20_000_000));
    const verifySpy = jest.fn();
    const auditAppendSpy = jest.fn().mockResolvedValue(undefined);
    const outboxPublishSpy = jest.fn();

    const service = new MediaService(
      makeMockConnection() as never,
      { findById: findByIdSpy, markRejected: markRejectedSpy, markVerified: markVerifiedSpy } as unknown as MediaAssetRepository,
      { readObject: readObjectSpy } as unknown as MediaStorageService,
      { verify: verifySpy } as unknown as MediaMimeVerifierService,
      { append: auditAppendSpy } as unknown as AuditService,
      { publish: outboxPublishSpy } as unknown as OutboxService,
    );

    const result = await service.confirmUpload({
      assetId,
      actorIdentityId: new Types.ObjectId(),
      expectedOwnerScope: makeOwnerScope(organizationId),
      correlationId: 'test-correlation-id',
    });

    expect(result).toEqual({ status: 'rejected' });
    expect(markRejectedSpy).toHaveBeenCalledWith(assetId, 'File exceeds size limit', expect.anything());
    expect(verifySpy).not.toHaveBeenCalled();
    expect(outboxPublishSpy).not.toHaveBeenCalled();
  });

  it('пробрасывает ошибку как есть, если readObject упал НЕ из-за размера (инфраструктурный сбой)', async () => {
    const assetId = new Types.ObjectId();
    const organizationId = new Types.ObjectId();
    const asset = {
      _id: assetId,
      ownerScope: makeOwnerScope(organizationId),
      bucket: 'public' as const,
      originalPath: `${assetId.toString()}/original.jpg`,
      declaredMimeType: 'image/jpeg',
    };

    const findByIdSpy = jest.fn().mockResolvedValue(asset);
    const markRejectedSpy = jest.fn();
    const readObjectSpy = jest.fn().mockRejectedValue(new Error('S3 connection refused'));

    const service = new MediaService(
      makeMockConnection() as never,
      { findById: findByIdSpy, markRejected: markRejectedSpy } as unknown as MediaAssetRepository,
      { readObject: readObjectSpy } as unknown as MediaStorageService,
      {} as unknown as MediaMimeVerifierService,
      {} as unknown as AuditService,
      {} as unknown as OutboxService,
    );

    await expect(
      service.confirmUpload({
        assetId,
        actorIdentityId: new Types.ObjectId(),
        expectedOwnerScope: makeOwnerScope(organizationId),
        correlationId: 'test-correlation-id',
      }),
    ).rejects.toThrow('S3 connection refused');
    expect(markRejectedSpy).not.toHaveBeenCalled();
  });

  it('помечает asset verified и публикует MediaVerified outbox-событие при успешном verify', async () => {
    const assetId = new Types.ObjectId();
    const organizationId = new Types.ObjectId();
    const asset = {
      _id: assetId,
      ownerScope: makeOwnerScope(organizationId),
      bucket: 'public' as const,
      originalPath: `${assetId.toString()}/original.png`,
      purpose: 'unit_photo',
      declaredMimeType: 'image/png',
    };

    const findByIdSpy = jest.fn().mockResolvedValue(asset);
    const markVerifiedSpy = jest.fn().mockResolvedValue({ modifiedCount: 1 });
    const readObjectSpy = jest.fn().mockResolvedValue(Buffer.from('fake-png-bytes'));
    const verifySpy = jest.fn().mockResolvedValue({
      verified: true,
      mimeType: 'image/png',
      checksum: 'def456',
    });
    const auditAppendSpy = jest.fn().mockResolvedValue(undefined);
    const outboxPublishSpy = jest.fn().mockResolvedValue(undefined);

    const service = new MediaService(
      makeMockConnection() as never,
      { findById: findByIdSpy, markVerified: markVerifiedSpy } as unknown as MediaAssetRepository,
      { readObject: readObjectSpy } as unknown as MediaStorageService,
      { verify: verifySpy } as unknown as MediaMimeVerifierService,
      { append: auditAppendSpy } as unknown as AuditService,
      { publish: outboxPublishSpy } as unknown as OutboxService,
    );

    const result = await service.confirmUpload({
      assetId,
      actorIdentityId: new Types.ObjectId(),
      expectedOwnerScope: makeOwnerScope(organizationId),
      correlationId: 'test-correlation-id',
    });

    expect(result).toEqual({ status: 'verified' });
    expect(markVerifiedSpy).toHaveBeenCalledWith(
      assetId,
      { verifiedMimeType: 'image/png', checksum: 'def456' },
      expect.anything(),
    );
    expect(outboxPublishSpy).toHaveBeenCalledTimes(1);
    expect(outboxPublishSpy).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'MediaVerified' }),
      expect.anything(),
    );
  });

  /**
   * Data-integrity: найдено ревью — magic-byte verify подтверждает allowlist-
   * членство реального MIME, но без явного сравнения с declaredMimeType файл
   * с подменённым содержимым (заявлен PNG, реально залит PDF) проходил бы
   * verify молча, раз оба формата допустимы по отдельности.
   */
  it('отклоняет asset, если реальный MIME отличается от заявленного на upload-intent', async () => {
    const assetId = new Types.ObjectId();
    const organizationId = new Types.ObjectId();
    const asset = {
      _id: assetId,
      ownerScope: makeOwnerScope(organizationId),
      bucket: 'public' as const,
      originalPath: `${assetId.toString()}/original.png`,
      declaredMimeType: 'image/png',
    };

    const findByIdSpy = jest.fn().mockResolvedValue(asset);
    const markRejectedSpy = jest.fn().mockResolvedValue({ modifiedCount: 1 });
    const markVerifiedSpy = jest.fn();
    const readObjectSpy = jest.fn().mockResolvedValue(Buffer.from('actually-a-pdf'));
    const verifySpy = jest.fn().mockResolvedValue({
      verified: true,
      mimeType: 'application/pdf',
      checksum: 'ghi789',
    });
    const auditAppendSpy = jest.fn().mockResolvedValue(undefined);
    const outboxPublishSpy = jest.fn();

    const service = new MediaService(
      makeMockConnection() as never,
      { findById: findByIdSpy, markRejected: markRejectedSpy, markVerified: markVerifiedSpy } as unknown as MediaAssetRepository,
      { readObject: readObjectSpy } as unknown as MediaStorageService,
      { verify: verifySpy } as unknown as MediaMimeVerifierService,
      { append: auditAppendSpy } as unknown as AuditService,
      { publish: outboxPublishSpy } as unknown as OutboxService,
    );

    const result = await service.confirmUpload({
      assetId,
      actorIdentityId: new Types.ObjectId(),
      expectedOwnerScope: makeOwnerScope(organizationId),
      correlationId: 'test-correlation-id',
    });

    expect(result).toEqual({ status: 'rejected' });
    expect(markRejectedSpy).toHaveBeenCalledWith(
      assetId,
      expect.stringMatching(/не совпадает/),
      expect.anything(),
    );
    expect(markVerifiedSpy).not.toHaveBeenCalled();
    expect(outboxPublishSpy).not.toHaveBeenCalled();
  });

  /**
   * ADR-006 идемпотентность: конкурентный confirmUpload для того же asset —
   * repository возвращает modifiedCount:0 (запись уже не в статусе pending,
   * второй вызов её не тронул), сервис не должен создавать дублирующуюся
   * audit-запись/outbox-событие поверх того, что уже сделал первый вызов.
   */
  it('не публикует повторный audit/outbox, если markVerified не изменил ни одной записи (конкурентный confirm)', async () => {
    const assetId = new Types.ObjectId();
    const organizationId = new Types.ObjectId();
    const asset = {
      _id: assetId,
      ownerScope: makeOwnerScope(organizationId),
      bucket: 'public' as const,
      originalPath: `${assetId.toString()}/original.png`,
      declaredMimeType: 'image/png',
    };

    const findByIdSpy = jest.fn().mockResolvedValue(asset);
    const markVerifiedSpy = jest.fn().mockResolvedValue({ modifiedCount: 0 });
    const readObjectSpy = jest.fn().mockResolvedValue(Buffer.from('fake-png-bytes'));
    const verifySpy = jest.fn().mockResolvedValue({
      verified: true,
      mimeType: 'image/png',
      checksum: 'def456',
    });
    const auditAppendSpy = jest.fn();
    const outboxPublishSpy = jest.fn();

    const service = new MediaService(
      makeMockConnection() as never,
      { findById: findByIdSpy, markVerified: markVerifiedSpy } as unknown as MediaAssetRepository,
      { readObject: readObjectSpy } as unknown as MediaStorageService,
      { verify: verifySpy } as unknown as MediaMimeVerifierService,
      { append: auditAppendSpy } as unknown as AuditService,
      { publish: outboxPublishSpy } as unknown as OutboxService,
    );

    const result = await service.confirmUpload({
      assetId,
      actorIdentityId: new Types.ObjectId(),
      expectedOwnerScope: makeOwnerScope(organizationId),
      correlationId: 'test-correlation-id',
    });

    expect(result).toEqual({ status: 'verified' });
    expect(auditAppendSpy).not.toHaveBeenCalled();
    expect(outboxPublishSpy).not.toHaveBeenCalled();
  });
});

describe('MediaService.getAssetForOwnerScope', () => {
  it('возвращает status/variants/bucket, если ownerScope совпадает', async () => {
    const assetId = new Types.ObjectId();
    const organizationId = new Types.ObjectId();
    const variants = [{ type: 'card' as const, assetPath: 'x/card/1.webp', exifStripped: true as const }];
    const asset = {
      _id: assetId,
      ownerScope: makeOwnerScope(organizationId),
      status: 'verified' as const,
      variants,
      bucket: 'public' as const,
    };

    const service = new MediaService(
      makeMockConnection() as never,
      { findById: jest.fn().mockResolvedValue(asset) } as unknown as MediaAssetRepository,
      {} as unknown as MediaStorageService,
      {} as unknown as MediaMimeVerifierService,
      {} as unknown as AuditService,
      {} as unknown as OutboxService,
    );

    const result = await service.getAssetForOwnerScope(assetId, makeOwnerScope(organizationId));

    expect(result).toEqual({ status: 'verified', variants, bucket: 'public' });
  });

  /**
   * ADR-002 требование 1 (tenant escape prevention) — та же IDOR-защита,
   * что confirmUpload: чужой assetId, даже подобранный/угаданный, не
   * должен раскрыть содержимое asset'а другой организации.
   */
  it('возвращает null, если ownerScope НЕ совпадает (IDOR)', async () => {
    const assetId = new Types.ObjectId();
    const actualOwnerOrgId = new Types.ObjectId();
    const attackerOrgId = new Types.ObjectId();
    const asset = {
      _id: assetId,
      ownerScope: makeOwnerScope(actualOwnerOrgId),
      status: 'verified' as const,
      variants: [],
      bucket: 'public' as const,
    };

    const service = new MediaService(
      makeMockConnection() as never,
      { findById: jest.fn().mockResolvedValue(asset) } as unknown as MediaAssetRepository,
      {} as unknown as MediaStorageService,
      {} as unknown as MediaMimeVerifierService,
      {} as unknown as AuditService,
      {} as unknown as OutboxService,
    );

    const result = await service.getAssetForOwnerScope(assetId, makeOwnerScope(attackerOrgId));

    expect(result).toBeNull();
  });

  it('возвращает null, если asset не найден', async () => {
    const service = new MediaService(
      makeMockConnection() as never,
      { findById: jest.fn().mockResolvedValue(null) } as unknown as MediaAssetRepository,
      {} as unknown as MediaStorageService,
      {} as unknown as MediaMimeVerifierService,
      {} as unknown as AuditService,
      {} as unknown as OutboxService,
    );

    const result = await service.getAssetForOwnerScope(new Types.ObjectId(), makeOwnerScope(new Types.ObjectId()));

    expect(result).toBeNull();
  });
});

describe('MediaService.getVariantUrl', () => {
  it('делегирует MediaStorageService.getPublicUrl с assetPath variant', async () => {
    const getPublicUrlSpy = jest.fn().mockReturnValue('https://cdn.example.com/x/card/1.webp');

    const service = new MediaService(
      makeMockConnection() as never,
      {} as unknown as MediaAssetRepository,
      { getPublicUrl: getPublicUrlSpy } as unknown as MediaStorageService,
      {} as unknown as MediaMimeVerifierService,
      {} as unknown as AuditService,
      {} as unknown as OutboxService,
    );

    const url = service.getVariantUrl({ type: 'card', assetPath: 'x/card/1.webp', exifStripped: true });

    expect(getPublicUrlSpy).toHaveBeenCalledWith('x/card/1.webp');
    expect(url).toBe('https://cdn.example.com/x/card/1.webp');
  });
});
