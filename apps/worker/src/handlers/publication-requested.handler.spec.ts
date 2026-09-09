import { Types } from 'mongoose';
import { PublicationRequestedHandler } from './publication-requested.handler';
import type {
  DevelopmentRepository,
  BuildingRepository,
  UnitRepository,
  FloorPlanRepository,
  DevelopmentDocument,
  BuildingDocument,
  UnitDocument,
} from '@baza/development';
import type { ListingRepository, PropertyAssetRepository } from '@baza/property-assets';
import type { MarketplacePublicationRepository } from '@baza/publication';
import type { MediaAssetRepository, MediaStorageService } from '@baza/media-storage';

function makeEvent(payload: Record<string, unknown>) {
  return { aggregateId: new Types.ObjectId(), payload } as never;
}

function makeDevelopment(overrides: Partial<Record<string, unknown>> = {}): DevelopmentDocument {
  return {
    _id: new Types.ObjectId(),
    name: 'Malibu Residence',
    location: { country: 'Georgia', city: 'Batumi', address: 'x', geo: { type: 'Point', coordinates: [1, 2] } },
    classType: 'business',
    ...overrides,
  } as unknown as DevelopmentDocument;
}

function makeBuilding(overrides: Partial<Record<string, unknown>> = {}): BuildingDocument {
  return {
    _id: new Types.ObjectId(),
    developmentId: new Types.ObjectId(),
    name: 'Block A',
    floorsCount: 16,
    ...overrides,
  } as unknown as BuildingDocument;
}

function makeUnit(overrides: Partial<Record<string, unknown>> = {}): UnitDocument {
  return {
    _id: new Types.ObjectId(),
    buildingId: new Types.ObjectId(),
    floorId: new Types.ObjectId(),
    number: '101',
    kind: 'apartment',
    rooms: 2,
    area: 54.5,
    price: { amountMinorUnits: 65_000_00, currency: 'USD' },
    status: 'available',
    ...overrides,
  } as unknown as UnitDocument;
}

function makeListing(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    propertyAssetId: new Types.ObjectId(),
    dealType: 'sale',
    price: { amountMinorUnits: 10_000_000, currency: 'USD' },
    ...overrides,
  } as never;
}

function makeAsset(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    propertyType: 'apartment',
    location: { country: 'Georgia', city: 'Batumi', address: 'x', geo: { type: 'Point', coordinates: [1, 2] } },
    characteristics: { area: 55, rooms: 2 },
    ...overrides,
  } as never;
}

function makeHandler(overrides: {
  publicationRepository?: Partial<MarketplacePublicationRepository>;
  developmentRepository?: Partial<DevelopmentRepository>;
  listingRepository?: Partial<ListingRepository>;
  propertyAssetRepository?: Partial<PropertyAssetRepository>;
  mediaAssetRepository?: Partial<MediaAssetRepository>;
  storage?: Partial<MediaStorageService>;
  buildingRepository?: Partial<BuildingRepository>;
  unitRepository?: Partial<UnitRepository>;
  floorPlanRepository?: Partial<FloorPlanRepository>;
} = {}) {
  return new PublicationRequestedHandler(
    (overrides.publicationRepository ?? {}) as MarketplacePublicationRepository,
    (overrides.developmentRepository ?? { findById: jest.fn() }) as DevelopmentRepository,
    (overrides.listingRepository ?? { findById: jest.fn() }) as ListingRepository,
    (overrides.propertyAssetRepository ?? { findById: jest.fn() }) as PropertyAssetRepository,
    (overrides.mediaAssetRepository ?? { findByIds: jest.fn().mockResolvedValue([]) }) as MediaAssetRepository,
    (overrides.storage ?? { getPublicUrl: jest.fn((k: string) => `https://cdn.example.com/${k}`) }) as unknown as MediaStorageService,
    overrides.buildingRepository as BuildingRepository | undefined,
    overrides.unitRepository as UnitRepository | undefined,
    overrides.floorPlanRepository as FloorPlanRepository | undefined,
  );
}

describe('PublicationRequestedHandler', () => {
  it('помечает build_failed для sourceType кроме development/listing (unit ещё не поддержан)', async () => {
    const publicationId = new Types.ObjectId();
    const markBuildFailedSpy = jest.fn().mockResolvedValue(undefined);
    const findByIdSpy = jest.fn();

    const handler = makeHandler({
      publicationRepository: { markBuildFailed: markBuildFailedSpy },
      developmentRepository: { findById: findByIdSpy },
    });

    await handler.handle(
      makeEvent({
        publicationId: publicationId.toString(),
        sourceType: 'unit',
        sourceId: new Types.ObjectId().toString(),
        version: 0,
      }),
    );

    expect(markBuildFailedSpy).toHaveBeenCalledWith(publicationId);
    expect(findByIdSpy).not.toHaveBeenCalled();
  });

  it('помечает build_failed, если Development не найден (удалён между publish и обработкой)', async () => {
    const publicationId = new Types.ObjectId();
    const markBuildFailedSpy = jest.fn().mockResolvedValue(undefined);

    const handler = makeHandler({
      publicationRepository: { markBuildFailed: markBuildFailedSpy },
      developmentRepository: { findById: jest.fn().mockResolvedValue(null) },
    });

    await handler.handle(
      makeEvent({
        publicationId: publicationId.toString(),
        sourceType: 'development',
        sourceId: new Types.ObjectId().toString(),
        version: 0,
      }),
    );

    expect(markBuildFailedSpy).toHaveBeenCalledWith(publicationId);
  });

  it('строит slug, вызывает markPublished с полной проекцией при успехе', async () => {
    const publicationId = new Types.ObjectId();
    const isSlugTakenSpy = jest.fn().mockResolvedValue(false);
    const markPublishedSpy = jest.fn().mockResolvedValue({ modifiedCount: 1 });

    const handler = makeHandler({
      publicationRepository: { isSlugTaken: isSlugTakenSpy, markPublished: markPublishedSpy },
      developmentRepository: { findById: jest.fn().mockResolvedValue(makeDevelopment()) },
    });

    await handler.handle(
      makeEvent({
        publicationId: publicationId.toString(),
        sourceType: 'development',
        sourceId: new Types.ObjectId().toString(),
        version: 3,
      }),
    );

    expect(markPublishedSpy).toHaveBeenCalledWith(
      publicationId,
      expect.objectContaining({
        expectedVersion: 3,
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

    const handler = makeHandler({
      publicationRepository: { isSlugTaken: isSlugTakenSpy, markPublished: markPublishedSpy },
      developmentRepository: { findById: jest.fn().mockResolvedValue(makeDevelopment()) },
    });

    await handler.handle(
      makeEvent({
        publicationId: publicationId.toString(),
        sourceType: 'development',
        sourceId: new Types.ObjectId().toString(),
        version: 0,
      }),
    );

    expect(isSlugTakenSpy).toHaveBeenCalledTimes(2);
    expect(markPublishedSpy).toHaveBeenCalledWith(
      publicationId,
      expect.objectContaining({ slug: 'malibu-residence-batumi-2' }),
    );
  });

  /**
   * MKT-002 hardening: реальная гонка между isSlugTaken pre-check (read) и
   * markPublished (write) — два worker-инстанса (ADR-001 допускает
   * несколько на один API) оба проходят isSlugTaken со значением false
   * ДО того, как любой из них зафиксировал write. Раньше unique-индекс на
   * slug ловил это на уровне MongoDB (E11000), но handler НЕ обрабатывал
   * эту ошибку — она проброшена наружу необработанной. Тест проверяет:
   * duplicate-key ИМЕННО на slug-индексе на первой попытке markPublished
   * → handler пробует следующий кандидат, не падает.
   */
  it('markPublished бросает duplicate-key на slug (гонка между isSlugTaken и write) — пробует следующий кандидат, не падает', async () => {
    const publicationId = new Types.ObjectId();
    const slugDuplicateError = Object.assign(new Error('E11000 duplicate key error collection: marketplace_publications index: slug_1'), {
      code: 11000,
      keyPattern: { slug: 1 },
    });
    const markPublishedSpy = jest
      .fn()
      .mockRejectedValueOnce(slugDuplicateError)
      .mockResolvedValueOnce({ modifiedCount: 1 });

    const handler = makeHandler({
      publicationRepository: { isSlugTaken: jest.fn().mockResolvedValue(false), markPublished: markPublishedSpy },
      developmentRepository: { findById: jest.fn().mockResolvedValue(makeDevelopment()) },
    });

    await expect(
      handler.handle(
        makeEvent({
          publicationId: publicationId.toString(),
          sourceType: 'development',
          sourceId: new Types.ObjectId().toString(),
          version: 0,
        }),
      ),
    ).resolves.toBeUndefined();

    expect(markPublishedSpy).toHaveBeenCalledTimes(2);
    expect(markPublishedSpy).toHaveBeenNthCalledWith(1, publicationId, expect.objectContaining({ slug: 'malibu-residence-batumi' }));
    expect(markPublishedSpy).toHaveBeenNthCalledWith(2, publicationId, expect.objectContaining({ slug: 'malibu-residence-batumi-2' }));
  });

  it('markPublished бросает НЕ-slug ошибку (например {sourceType,sourceId} unique) — пробрасывается наружу, не проглатывается как slug-коллизия', async () => {
    const publicationId = new Types.ObjectId();
    const otherDuplicateError = Object.assign(new Error('E11000 duplicate key error collection: marketplace_publications index: sourceType_1_sourceId_1'), {
      code: 11000,
      keyPattern: { sourceType: 1, sourceId: 1 },
    });
    const markPublishedSpy = jest.fn().mockRejectedValueOnce(otherDuplicateError);

    const handler = makeHandler({
      publicationRepository: { isSlugTaken: jest.fn().mockResolvedValue(false), markPublished: markPublishedSpy },
      developmentRepository: { findById: jest.fn().mockResolvedValue(makeDevelopment()) },
    });

    await expect(
      handler.handle(
        makeEvent({
          publicationId: publicationId.toString(),
          sourceType: 'development',
          sourceId: new Types.ObjectId().toString(),
          version: 0,
        }),
      ),
    ).rejects.toThrow(otherDuplicateError.message);

    expect(markPublishedSpy).toHaveBeenCalledTimes(1);
  });

  it('не бросает исключение, если markPublished вернул modifiedCount:0 (unpublish опередил worker)', async () => {
    const handler = makeHandler({
      publicationRepository: {
        isSlugTaken: jest.fn().mockResolvedValue(false),
        markPublished: jest.fn().mockResolvedValue({ modifiedCount: 0 }),
      },
      developmentRepository: { findById: jest.fn().mockResolvedValue(makeDevelopment()) },
    });

    await expect(
      handler.handle(
        makeEvent({
          publicationId: new Types.ObjectId().toString(),
          sourceType: 'development',
          sourceId: new Types.ObjectId().toString(),
          version: 0,
        }),
      ),
    ).resolves.toBeUndefined();
  });

  /**
   * D-03 race-fix: handler ПЕРЕДАЁТ payload.version как expectedVersion в
   * markPublished — реальное CAS-сравнение (version в MongoDB-фильтре)
   * проверяется repository/integration-тестом, не здесь (handler не
   * сравнивает версии сам). Этот тест доказывает, что handler корректно
   * прокидывает более старую версию из payload и корректно трактует
   * результат modifiedCount:0 как "не перезаписываю, не бросаю", тот же
   * код-путь, что уже покрыт для unpublish-гонки выше.
   */
  it('передаёт payload.version как expectedVersion — устаревшая версия события резолвится без throw, без повторной попытки', async () => {
    const publicationId = new Types.ObjectId();
    const markPublishedSpy = jest.fn().mockResolvedValue({ modifiedCount: 0 });

    const handler = makeHandler({
      publicationRepository: { isSlugTaken: jest.fn().mockResolvedValue(false), markPublished: markPublishedSpy },
      developmentRepository: { findById: jest.fn().mockResolvedValue(makeDevelopment()) },
    });

    await expect(
      handler.handle(
        makeEvent({
          publicationId: publicationId.toString(),
          sourceType: 'development',
          sourceId: new Types.ObjectId().toString(),
          version: 1, // устаревшая версия — на момент обработки publication уже на version:2+
        }),
      ),
    ).resolves.toBeUndefined();

    expect(markPublishedSpy).toHaveBeenCalledWith(publicationId, expect.objectContaining({ expectedVersion: 1 }));
    expect(markPublishedSpy).toHaveBeenCalledTimes(1);
  });

  describe('sourceType: listing (MKT-002)', () => {
    it('помечает build_failed, если Listing не найден (удалён между publish и обработкой)', async () => {
      const publicationId = new Types.ObjectId();
      const markBuildFailedSpy = jest.fn().mockResolvedValue(undefined);
      const assetFindByIdSpy = jest.fn();

      const handler = makeHandler({
        publicationRepository: { markBuildFailed: markBuildFailedSpy },
        listingRepository: { findById: jest.fn().mockResolvedValue(null) },
        propertyAssetRepository: { findById: assetFindByIdSpy },
      });

      await handler.handle(
        makeEvent({
          publicationId: publicationId.toString(),
          sourceType: 'listing',
          sourceId: new Types.ObjectId().toString(),
          version: 0,
        }),
      );

      expect(markBuildFailedSpy).toHaveBeenCalledWith(publicationId);
      expect(assetFindByIdSpy).not.toHaveBeenCalled();
    });

    it('помечает build_failed, если родительский PropertyAsset не найден', async () => {
      const publicationId = new Types.ObjectId();
      const markBuildFailedSpy = jest.fn().mockResolvedValue(undefined);

      const handler = makeHandler({
        publicationRepository: { markBuildFailed: markBuildFailedSpy },
        listingRepository: { findById: jest.fn().mockResolvedValue(makeListing()) },
        propertyAssetRepository: { findById: jest.fn().mockResolvedValue(null) },
      });

      await handler.handle(
        makeEvent({
          publicationId: publicationId.toString(),
          sourceType: 'listing',
          sourceId: new Types.ObjectId().toString(),
          version: 0,
        }),
      );

      expect(markBuildFailedSpy).toHaveBeenCalledWith(publicationId);
    });

    it('строит slug из propertyType-dealType-city, вызывает markPublished с полной проекцией из Listing+PropertyAsset', async () => {
      const publicationId = new Types.ObjectId();
      const isSlugTakenSpy = jest.fn().mockResolvedValue(false);
      const markPublishedSpy = jest.fn().mockResolvedValue({ modifiedCount: 1 });

      const handler = makeHandler({
        publicationRepository: { isSlugTaken: isSlugTakenSpy, markPublished: markPublishedSpy },
        listingRepository: { findById: jest.fn().mockResolvedValue(makeListing({ dealType: 'sale' })) },
        propertyAssetRepository: {
          findById: jest.fn().mockResolvedValue(makeAsset({ propertyType: 'apartment', location: { country: 'Georgia', city: 'Batumi', address: 'x', geo: { type: 'Point', coordinates: [1, 2] } } })),
        },
      });

      await handler.handle(
        makeEvent({
          publicationId: publicationId.toString(),
          sourceType: 'listing',
          sourceId: new Types.ObjectId().toString(),
          version: 2,
        }),
      );

      expect(markPublishedSpy).toHaveBeenCalledWith(
        publicationId,
        expect.objectContaining({
          expectedVersion: 2,
          slug: 'apartment-sale-batumi',
          seo: expect.objectContaining({ canonicalUrl: '/listings/apartment-sale-batumi' }),
          denormalizedFields: expect.objectContaining({ dealType: 'sale', propertyType: 'apartment' }),
          searchProjection: expect.objectContaining({ city: 'Batumi', dealType: 'sale' }),
        }),
      );
    });

    it('denormalizedFields не содержит organizationId/publisherScope/internal поля (whitelist mapper — не spread)', async () => {
      const publicationId = new Types.ObjectId();
      const markPublishedSpy = jest.fn().mockResolvedValue({ modifiedCount: 1 });

      const handler = makeHandler({
        publicationRepository: { isSlugTaken: jest.fn().mockResolvedValue(false), markPublished: markPublishedSpy },
        listingRepository: {
          findById: jest.fn().mockResolvedValue(
            makeListing({
              publisherScope: { type: 'organization', organizationId: new Types.ObjectId() },
              version: 7,
            }),
          ),
        },
        propertyAssetRepository: {
          findById: jest.fn().mockResolvedValue(
            makeAsset({ publisherScope: { type: 'organization', organizationId: new Types.ObjectId() } }),
          ),
        },
      });

      await handler.handle(
        makeEvent({
          publicationId: publicationId.toString(),
          sourceType: 'listing',
          sourceId: new Types.ObjectId().toString(),
          version: 0,
        }),
      );

      const [, callArgs] = markPublishedSpy.mock.calls[0] as [
        Types.ObjectId,
        { denormalizedFields: Record<string, unknown> },
      ];
      expect(callArgs.denormalizedFields).not.toHaveProperty('publisherScope');
      expect(callArgs.denormalizedFields).not.toHaveProperty('organizationId');
      expect(callArgs.denormalizedFields).not.toHaveProperty('version');
    });

    it('не бросает исключение, если markPublished вернул modifiedCount:0 (unpublish опередил worker)', async () => {
      const handler = makeHandler({
        publicationRepository: {
          isSlugTaken: jest.fn().mockResolvedValue(false),
          markPublished: jest.fn().mockResolvedValue({ modifiedCount: 0 }),
        },
        listingRepository: { findById: jest.fn().mockResolvedValue(makeListing()) },
        propertyAssetRepository: { findById: jest.fn().mockResolvedValue(makeAsset()) },
      });

      await expect(
        handler.handle(
          makeEvent({
            publicationId: new Types.ObjectId().toString(),
            sourceType: 'listing',
            sourceId: new Types.ObjectId().toString(),
            version: 0,
          }),
        ),
      ).resolves.toBeUndefined();
    });
  });
  it('MKT-004: проецирует только verified public media, сортируя cover первой и исключая private', async () => {
    const publicationId = new Types.ObjectId();
    const listingId = new Types.ObjectId();
    const assetId = new Types.ObjectId();
    const coverMediaId = new Types.ObjectId();
    const galleryMediaId = new Types.ObjectId();
    const privateMediaId = new Types.ObjectId();

    const listing = makeListing({ _id: listingId, propertyAssetId: assetId });
    const asset = makeAsset({
      _id: assetId,
      media: [
        { id: galleryMediaId.toString(), mediaAssetId: galleryMediaId, role: 'gallery', sortOrder: 1, isPrivate: false },
        { id: coverMediaId.toString(), mediaAssetId: coverMediaId, role: 'cover', sortOrder: 0, isPrivate: false, alt: 'Обложка' },
        { id: privateMediaId.toString(), mediaAssetId: privateMediaId, role: 'gallery', sortOrder: 2, isPrivate: true },
      ],
    });

    const mediaDocs = [
      {
        _id: coverMediaId,
        status: 'verified',
        bucket: 'public',
        variants: [{ type: 'card', assetPath: 'photos/cover.webp' }],
      },
      {
        _id: galleryMediaId,
        status: 'verified',
        bucket: 'public',
        variants: [{ type: 'detail', assetPath: 'photos/gallery.webp' }],
      },
      {
        _id: privateMediaId,
        status: 'verified',
        bucket: 'public',
        variants: [{ type: 'detail', assetPath: 'photos/private.webp' }],
      },
    ];

    const markPublishedSpy = jest.fn().mockResolvedValue({ modifiedCount: 1 });
    const handler = makeHandler({
      publicationRepository: {
        isSlugTaken: jest.fn().mockResolvedValue(false),
        markPublished: markPublishedSpy,
      },
      listingRepository: { findById: jest.fn().mockResolvedValue(listing) },
      propertyAssetRepository: { findById: jest.fn().mockResolvedValue(asset) },
      mediaAssetRepository: { findByIds: jest.fn().mockResolvedValue(mediaDocs) },
      storage: { getPublicUrl: (k: string) => `https://cdn.test/${k}` },
    });

    await handler.handle(
      makeEvent({
        publicationId: publicationId.toString(),
        sourceType: 'listing',
        sourceId: listingId.toString(),
        version: 1,
      }),
    );

    expect(markPublishedSpy).toHaveBeenCalledWith(
      publicationId,
      expect.objectContaining({
        denormalizedFields: expect.objectContaining({
          media: [
            {
              url: 'https://cdn.test/photos/cover.webp',
              role: 'cover',
              sortOrder: 0,
              alt: 'Обложка',
            },
            {
              url: 'https://cdn.test/photos/gallery.webp',
              role: 'gallery',
              sortOrder: 1,
              alt: undefined,
            },
          ],
        }),
      }),
    );
  });

  it('успешно публикует Unit с планировкой и изображением: planImageUrl разрешается через storage', async () => {
    const publicationId = new Types.ObjectId();
    const dev = makeDevelopment({ name: 'Sunrise Bay' });
    const building = makeBuilding({ developmentId: dev._id, name: 'Tower 1' });
    const floorPlanId = new Types.ObjectId();
    const imageAssetId = new Types.ObjectId();
    const unit = makeUnit({ buildingId: building._id, number: '42', floorPlanId });

    const floorPlan = {
      _id: floorPlanId,
      name: '2-Room Layout A',
      isEuro: true,
      imageAssetId,
    };

    const mediaDoc = {
      _id: imageAssetId,
      status: 'verified',
      bucket: 'public',
      variants: [{ type: 'card', assetPath: 'plans/layout-a-card.webp' }],
    };

    const markPublishedSpy = jest.fn().mockResolvedValue({ modifiedCount: 1 });

    const handler = makeHandler({
      publicationRepository: {
        isSlugTaken: jest.fn().mockResolvedValue(false),
        markPublished: markPublishedSpy,
      },
      unitRepository: { findById: jest.fn().mockResolvedValue(unit) },
      buildingRepository: { findById: jest.fn().mockResolvedValue(building) },
      developmentRepository: { findById: jest.fn().mockResolvedValue(dev) },
      floorPlanRepository: { findById: jest.fn().mockResolvedValue(floorPlan) },
      mediaAssetRepository: { findById: jest.fn().mockResolvedValue(mediaDoc) },
      storage: { getPublicUrl: jest.fn((p) => `https://cdn.example.com/${p}`) },
    });

    await handler.handle(
      makeEvent({
        publicationId: publicationId.toString(),
        sourceType: 'unit',
        sourceId: unit._id.toString(),
        version: 1,
      }),
    );

    const [, params] = markPublishedSpy.mock.calls[0];
    expect(params.denormalizedFields.floorPlan).toEqual({
      name: '2-Room Layout A',
      isEuro: true,
      imageUrl: 'https://cdn.example.com/plans/layout-a-card.webp',
    });
  });

  it('успешно публикует Unit при отсутствии планировки: floorPlan не попадает в denormalizedFields', async () => {
    const publicationId = new Types.ObjectId();
    const dev = makeDevelopment({ name: 'Sunrise Bay' });
    const building = makeBuilding({ developmentId: dev._id, name: 'Tower 1' });
    const unit = makeUnit({ buildingId: building._id, number: '43', floorPlanId: undefined });

    const markPublishedSpy = jest.fn().mockResolvedValue({ modifiedCount: 1 });

    const handler = makeHandler({
      publicationRepository: {
        isSlugTaken: jest.fn().mockResolvedValue(false),
        markPublished: markPublishedSpy,
      },
      unitRepository: { findById: jest.fn().mockResolvedValue(unit) },
      buildingRepository: { findById: jest.fn().mockResolvedValue(building) },
      developmentRepository: { findById: jest.fn().mockResolvedValue(dev) },
    });

    await handler.handle(
      makeEvent({
        publicationId: publicationId.toString(),
        sourceType: 'unit',
        sourceId: unit._id.toString(),
        version: 1,
      }),
    );

    const [, params] = markPublishedSpy.mock.calls[0];
    expect(params.denormalizedFields).not.toHaveProperty('floorPlan');
  });

  it('при публикации Development со смешанными валютами не выставляет единый priceFrom в проекциях', async () => {
    const publicationId = new Types.ObjectId();
    const devId = new Types.ObjectId();
    const b1 = makeBuilding({ _id: new Types.ObjectId(), developmentId: devId, name: 'Block A' });
    const u1 = makeUnit({ buildingId: b1._id, number: '10', price: { amountMinorUnits: 70_000_00, currency: 'USD' } });
    const u2 = makeUnit({ buildingId: b1._id, number: '11', price: { amountMinorUnits: 150_000_00, currency: 'GEL' } });

    const markPublishedSpy = jest.fn().mockResolvedValue({ modifiedCount: 1 });

    const handler = makeHandler({
      publicationRepository: { isSlugTaken: jest.fn().mockResolvedValue(false), markPublished: markPublishedSpy },
      developmentRepository: { findById: jest.fn().mockResolvedValue(makeDevelopment({ _id: devId })) },
      buildingRepository: { listByDevelopmentId: jest.fn().mockResolvedValue([b1]) },
      unitRepository: { listByBuildingIds: jest.fn().mockResolvedValue([u1, u2]) },
    });

    await handler.handle(
      makeEvent({
        publicationId: publicationId.toString(),
        sourceType: 'development',
        sourceId: devId.toString(),
        version: 1,
      }),
    );

    const [, params] = markPublishedSpy.mock.calls[0];
    expect(params.denormalizedFields).not.toHaveProperty('priceFrom');
    expect(params.searchProjection).not.toHaveProperty('priceAmountMinorUnits');
    expect(params.searchProjection).not.toHaveProperty('priceCurrency');
    expect(params.denormalizedFields.units).toHaveLength(2);
  });

  it('при публикации Development с 0 доступных юнитов не выставляет priceFrom', async () => {
    const publicationId = new Types.ObjectId();
    const devId = new Types.ObjectId();
    const b1 = makeBuilding({ _id: new Types.ObjectId(), developmentId: devId, name: 'Block A' });

    const markPublishedSpy = jest.fn().mockResolvedValue({ modifiedCount: 1 });

    const handler = makeHandler({
      publicationRepository: { isSlugTaken: jest.fn().mockResolvedValue(false), markPublished: markPublishedSpy },
      developmentRepository: { findById: jest.fn().mockResolvedValue(makeDevelopment({ _id: devId })) },
      buildingRepository: { listByDevelopmentId: jest.fn().mockResolvedValue([b1]) },
      unitRepository: { listByBuildingIds: jest.fn().mockResolvedValue([]) },
    });

    await handler.handle(
      makeEvent({
        publicationId: publicationId.toString(),
        sourceType: 'development',
        sourceId: devId.toString(),
        version: 1,
      }),
    );

    const [, params] = markPublishedSpy.mock.calls[0];
    expect(params.denormalizedFields).not.toHaveProperty('priceFrom');
    expect(params.searchProjection).not.toHaveProperty('priceAmountMinorUnits');
    expect(params.searchProjection).not.toHaveProperty('priceCurrency');
  });

});
