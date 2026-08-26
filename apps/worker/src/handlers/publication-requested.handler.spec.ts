import { Types } from 'mongoose';
import { PublicationRequestedHandler } from './publication-requested.handler';
import type { DevelopmentRepository } from '@baza/development';
import type { MarketplacePublicationRepository } from '@baza/publication';

function makeEvent(payload: Record<string, unknown>) {
  return { aggregateId: new Types.ObjectId(), payload } as never;
}

function makeDevelopment(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    name: 'Malibu Residence',
    location: { country: 'Georgia', city: 'Batumi', address: 'x', geo: { type: 'Point', coordinates: [1, 2] } },
    classType: 'business',
    ...overrides,
  } as never;
}

describe('PublicationRequestedHandler', () => {
  it('помечает build_failed для sourceType кроме development (unit/listing ещё не поддержаны)', async () => {
    const publicationId = new Types.ObjectId();
    const markBuildFailedSpy = jest.fn().mockResolvedValue(undefined);
    const findByIdSpy = jest.fn();

    const handler = new PublicationRequestedHandler(
      { markBuildFailed: markBuildFailedSpy } as unknown as MarketplacePublicationRepository,
      { findById: findByIdSpy } as unknown as DevelopmentRepository,
    );

    await handler.handle(
      makeEvent({ publicationId: publicationId.toString(), sourceType: 'unit', sourceId: new Types.ObjectId().toString() }),
    );

    expect(markBuildFailedSpy).toHaveBeenCalledWith(publicationId);
    expect(findByIdSpy).not.toHaveBeenCalled();
  });

  it('помечает build_failed, если Development не найден (удалён между publish и обработкой)', async () => {
    const publicationId = new Types.ObjectId();
    const markBuildFailedSpy = jest.fn().mockResolvedValue(undefined);

    const handler = new PublicationRequestedHandler(
      { markBuildFailed: markBuildFailedSpy } as unknown as MarketplacePublicationRepository,
      { findById: jest.fn().mockResolvedValue(null) } as unknown as DevelopmentRepository,
    );

    await handler.handle(
      makeEvent({
        publicationId: publicationId.toString(),
        sourceType: 'development',
        sourceId: new Types.ObjectId().toString(),
      }),
    );

    expect(markBuildFailedSpy).toHaveBeenCalledWith(publicationId);
  });

  it('строит slug, вызывает markPublished с полной проекцией при успехе', async () => {
    const publicationId = new Types.ObjectId();
    const isSlugTakenSpy = jest.fn().mockResolvedValue(false);
    const markPublishedSpy = jest.fn().mockResolvedValue({ modifiedCount: 1 });

    const handler = new PublicationRequestedHandler(
      {
        isSlugTaken: isSlugTakenSpy,
        markPublished: markPublishedSpy,
      } as unknown as MarketplacePublicationRepository,
      { findById: jest.fn().mockResolvedValue(makeDevelopment()) } as unknown as DevelopmentRepository,
    );

    await handler.handle(
      makeEvent({
        publicationId: publicationId.toString(),
        sourceType: 'development',
        sourceId: new Types.ObjectId().toString(),
      }),
    );

    expect(markPublishedSpy).toHaveBeenCalledWith(
      publicationId,
      expect.objectContaining({
        slug: 'malibu-residence-batumi',
        seo: expect.objectContaining({ title: expect.stringContaining('Malibu Residence') }),
        denormalizedFields: expect.objectContaining({ name: 'Malibu Residence' }),
        searchProjection: expect.objectContaining({ city: 'Batumi' }),
      }),
    );
  });

  /**
   * ADR-005: slug уникальность — при коллизии пробует следующий кандидат.
   */
  it('пробует следующий slug-кандидат при коллизии', async () => {
    const publicationId = new Types.ObjectId();
    const isSlugTakenSpy = jest
      .fn()
      .mockResolvedValueOnce(true) // 'malibu-residence-batumi' занят
      .mockResolvedValueOnce(false); // 'malibu-residence-batumi-2' свободен
    const markPublishedSpy = jest.fn().mockResolvedValue({ modifiedCount: 1 });

    const handler = new PublicationRequestedHandler(
      { isSlugTaken: isSlugTakenSpy, markPublished: markPublishedSpy } as unknown as MarketplacePublicationRepository,
      { findById: jest.fn().mockResolvedValue(makeDevelopment()) } as unknown as DevelopmentRepository,
    );

    await handler.handle(
      makeEvent({
        publicationId: publicationId.toString(),
        sourceType: 'development',
        sourceId: new Types.ObjectId().toString(),
      }),
    );

    expect(isSlugTakenSpy).toHaveBeenCalledTimes(2);
    expect(markPublishedSpy).toHaveBeenCalledWith(
      publicationId,
      expect.objectContaining({ slug: 'malibu-residence-batumi-2' }),
    );
  });

  it('не бросает исключение, если markPublished вернул modifiedCount:0 (unpublish опередил worker)', async () => {
    const handler = new PublicationRequestedHandler(
      {
        isSlugTaken: jest.fn().mockResolvedValue(false),
        markPublished: jest.fn().mockResolvedValue({ modifiedCount: 0 }),
      } as unknown as MarketplacePublicationRepository,
      { findById: jest.fn().mockResolvedValue(makeDevelopment()) } as unknown as DevelopmentRepository,
    );

    await expect(
      handler.handle(
        makeEvent({
          publicationId: new Types.ObjectId().toString(),
          sourceType: 'development',
          sourceId: new Types.ObjectId().toString(),
        }),
      ),
    ).resolves.toBeUndefined();
  });
});
