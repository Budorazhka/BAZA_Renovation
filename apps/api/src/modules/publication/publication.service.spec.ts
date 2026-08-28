import { ConflictException } from '@nestjs/common';
import { Types } from 'mongoose';
import { PublicationService } from './publication.service';
import type { MarketplacePublicationRepository } from '@baza/publication';
import type { AuditService } from '../audit/audit.service';
import type { OutboxService } from '../outbox/outbox.service';

describe('PublicationService.requestPublication', () => {
  it('upsert публикацию и публикует PublicationRequested в одной транзакции', async () => {
    const sourceId = new Types.ObjectId();
    const organizationId = new Types.ObjectId();
    const publication = { _id: new Types.ObjectId(), status: 'publication_pending', version: 1 };
    const upsertPendingSpy = jest.fn().mockResolvedValue(publication);
    const outboxPublishSpy = jest.fn().mockResolvedValue(undefined);
    const fakeSession = {} as never;

    const service = new PublicationService(
      { upsertPending: upsertPendingSpy } as unknown as MarketplacePublicationRepository,
      {} as AuditService,
      { publish: outboxPublishSpy } as unknown as OutboxService,
    );

    const result = await service.requestPublication(
      {
        sourceType: 'development',
        sourceId,
        publisherScope: { type: 'organization', organizationId },
        correlationId: 'test-correlation-id',
      },
      fakeSession,
    );

    expect(upsertPendingSpy).toHaveBeenCalledWith(
      { sourceType: 'development', sourceId, publisherScope: { type: 'organization', organizationId } },
      fakeSession,
    );
    expect(outboxPublishSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'PublicationRequested',
        aggregateType: 'development',
        aggregateId: sourceId,
        payload: expect.objectContaining({ version: 1 }),
        deduplicationKey: expect.stringContaining('v1'),
      }),
      fakeSession,
    );
    expect(result).toBe(publication);
  });
});

describe('PublicationService.rebuildIfCurrentlyPublished', () => {
  it('атомарный condition-update находит published-запись — переиздаёт PublicationRequested', async () => {
    const sourceId = new Types.ObjectId();
    const organizationId = new Types.ObjectId();
    const publication = { _id: new Types.ObjectId(), status: 'publication_pending', version: 2 };
    const markPendingIfPublishedSpy = jest.fn().mockResolvedValue(publication);
    const outboxPublishSpy = jest.fn().mockResolvedValue(undefined);
    const fakeSession = {} as never;

    const service = new PublicationService(
      { markPendingIfPublished: markPendingIfPublishedSpy } as unknown as MarketplacePublicationRepository,
      {} as AuditService,
      { publish: outboxPublishSpy } as unknown as OutboxService,
    );

    const result = await service.rebuildIfCurrentlyPublished(
      {
        sourceType: 'development',
        sourceId,
        publisherScope: { type: 'organization', organizationId },
        correlationId: 'test-correlation-id',
      },
      fakeSession,
    );

    expect(markPendingIfPublishedSpy).toHaveBeenCalledWith(
      'development',
      sourceId,
      { type: 'organization', organizationId },
      fakeSession,
    );
    expect(outboxPublishSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'PublicationRequested',
        aggregateId: sourceId,
        payload: expect.objectContaining({ version: 2 }),
        deduplicationKey: expect.stringContaining('v2'),
      }),
      fakeSession,
    );
    expect(result).toBe(publication);
  });

  it('condition-update не находит published-запись (unpublished/никогда не существовала) — НЕ публикует событие, возвращает null', async () => {
    const outboxPublishSpy = jest.fn();

    const service = new PublicationService(
      { markPendingIfPublished: jest.fn().mockResolvedValue(null) } as unknown as MarketplacePublicationRepository,
      {} as AuditService,
      { publish: outboxPublishSpy } as unknown as OutboxService,
    );

    const result = await service.rebuildIfCurrentlyPublished(
      {
        sourceType: 'development',
        sourceId: new Types.ObjectId(),
        publisherScope: { type: 'organization', organizationId: new Types.ObjectId() },
        correlationId: 'test-correlation-id',
      },
      {} as never,
    );

    expect(outboxPublishSpy).not.toHaveBeenCalled();
    expect(result).toBeNull();
  });
});

describe('PublicationService.unpublish', () => {
  it('пишет audit+outbox только при успешном unpublish (modifiedCount > 0)', async () => {
    const sourceId = new Types.ObjectId();
    const actorId = new Types.ObjectId();
    const auditAppendSpy = jest.fn().mockResolvedValue(undefined);
    const outboxPublishSpy = jest.fn().mockResolvedValue(undefined);
    const fakeSession = {} as never;

    const service = new PublicationService(
      { unpublish: jest.fn().mockResolvedValue({ modifiedCount: 1 }) } as unknown as MarketplacePublicationRepository,
      { append: auditAppendSpy } as unknown as AuditService,
      { publish: outboxPublishSpy } as unknown as OutboxService,
    );

    await service.unpublish(
      {
        sourceType: 'development',
        sourceId,
        reason: 'Duplicate listing detected',
        actorType: 'admin_account',
        actorId,
        correlationId: 'test-correlation-id',
      },
      fakeSession,
    );

    expect(auditAppendSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        actor: { type: 'admin_account', id: actorId },
        action: 'publication.unpublish',
        reason: 'Duplicate listing detected',
      }),
      fakeSession,
    );
    expect(outboxPublishSpy).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'UnpublicationRequested' }),
      fakeSession,
    );
  });

  it('бросает ConflictException и НЕ пишет audit/outbox, если публикация не была в статусе published', async () => {
    const auditAppendSpy = jest.fn();
    const outboxPublishSpy = jest.fn();

    const service = new PublicationService(
      { unpublish: jest.fn().mockResolvedValue({ modifiedCount: 0 }) } as unknown as MarketplacePublicationRepository,
      { append: auditAppendSpy } as unknown as AuditService,
      { publish: outboxPublishSpy } as unknown as OutboxService,
    );

    await expect(
      service.unpublish(
        {
          sourceType: 'development',
          sourceId: new Types.ObjectId(),
          reason: 'Some reason',
          actorType: 'admin_account',
          actorId: new Types.ObjectId(),
          correlationId: 'test-correlation-id',
        },
        {} as never,
      ),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(auditAppendSpy).not.toHaveBeenCalled();
    expect(outboxPublishSpy).not.toHaveBeenCalled();
  });
});
