import { Types } from 'mongoose';
import { UnitPriceChangedHandler } from './unit-price-changed.handler';
import type { OutboxEventDocument } from '@baza/domain-events';
import type { UnitRepository, BuildingRepository } from '@baza/development';
import type { MarketplacePublicationRepository } from '@baza/publication';

describe('UnitPriceChangedHandler', () => {
  it('обновляет denormalizedFields.priceFrom и searchProjection в опубликованном ЖК', async () => {
    const unitId = new Types.ObjectId();
    const buildingId = new Types.ObjectId();
    const developmentId = new Types.ObjectId();
    const publicationId = new Types.ObjectId();

    const unitRepository = {
      findById: jest.fn().mockResolvedValue({
        _id: unitId,
        buildingId,
        number: '101',
        kind: 'apartment',
        price: { amountMinorUnits: 4500000, currency: 'USD' },
      }),
      listByBuildingIds: jest.fn().mockResolvedValue([
        {
          _id: unitId,
          buildingId,
          number: '101',
          kind: 'apartment',
          area: 50,
          price: { amountMinorUnits: 4500000, currency: 'USD' },
          status: 'available',
        },
      ]),
    };

    const buildingRepository = {
      findById: jest.fn().mockResolvedValue({ _id: buildingId, developmentId, name: 'Block A' }),
      listByDevelopmentId: jest.fn().mockResolvedValue([{ _id: buildingId, name: 'Block A' }]),
    };

    const publicationRepository = {
      findBySource: jest.fn().mockImplementation((sourceType: string) => {
        if (sourceType === 'development') {
          return Promise.resolve({
            _id: publicationId,
            version: 1,
            status: 'published',
            denormalizedFields: { name: 'Sunset Resort' },
            searchProjection: {},
          });
        }
        return Promise.resolve(null);
      }),
      updateProjection: jest.fn().mockResolvedValue({}),
    };

    const handler = new UnitPriceChangedHandler(
      unitRepository as unknown as UnitRepository,
      buildingRepository as unknown as BuildingRepository,
      publicationRepository as unknown as MarketplacePublicationRepository,
    );

    const event = {
      aggregateId: unitId,
      payload: { amountMinorUnits: 4500000, currency: 'USD' },
    } as unknown as OutboxEventDocument;

    await handler.handle(event);

    expect(publicationRepository.updateProjection).toHaveBeenCalledWith(
      publicationId,
      expect.objectContaining({
        denormalizedFields: expect.objectContaining({
          priceFrom: { amountMinorUnits: 4500000, currency: 'USD' },
        }),
        searchProjection: expect.objectContaining({
          priceAmountMinorUnits: 4500000,
          priceCurrency: 'USD',
        }),
      }),
      { expectedVersion: 1 },
    );
  });

  it('очищает priceFrom и поисковые цены в ЖК, если после изменения появились смешанные валюты', async () => {
    const unitId = new Types.ObjectId();
    const unit2Id = new Types.ObjectId();
    const buildingId = new Types.ObjectId();
    const developmentId = new Types.ObjectId();
    const publicationId = new Types.ObjectId();

    const unitRepository = {
      findById: jest.fn().mockResolvedValue({
        _id: unitId,
        buildingId,
        number: '101',
        kind: 'apartment',
        price: { amountMinorUnits: 4500000, currency: 'GEL' },
      }),
      listByBuildingIds: jest.fn().mockResolvedValue([
        {
          _id: unitId,
          buildingId,
          number: '101',
          kind: 'apartment',
          area: 50,
          price: { amountMinorUnits: 4500000, currency: 'GEL' },
          status: 'available',
        },
        {
          _id: unit2Id,
          buildingId,
          number: '102',
          kind: 'apartment',
          area: 60,
          price: { amountMinorUnits: 5000000, currency: 'USD' },
          status: 'available',
        },
      ]),
    };

    const buildingRepository = {
      findById: jest.fn().mockResolvedValue({ _id: buildingId, developmentId, name: 'Block A' }),
      listByDevelopmentId: jest.fn().mockResolvedValue([{ _id: buildingId, name: 'Block A' }]),
    };

    const publicationRepository = {
      findBySource: jest.fn().mockImplementation((sourceType: string) => {
        if (sourceType === 'development') {
          return Promise.resolve({
            _id: publicationId,
            version: 1,
            status: 'published',
            denormalizedFields: { name: 'Sunset Resort', priceFrom: { amountMinorUnits: 4000000, currency: 'USD' } },
            searchProjection: { priceAmountMinorUnits: 4000000, priceCurrency: 'USD' },
          });
        }
        return Promise.resolve(null);
      }),
      updateProjection: jest.fn().mockResolvedValue({}),
    };

    const handler = new UnitPriceChangedHandler(
      unitRepository as unknown as UnitRepository,
      buildingRepository as unknown as BuildingRepository,
      publicationRepository as unknown as MarketplacePublicationRepository,
    );

    const event = {
      aggregateId: unitId,
      payload: { amountMinorUnits: 4500000, currency: 'GEL' },
    } as unknown as OutboxEventDocument;

    await handler.handle(event);

    const callArg = publicationRepository.updateProjection.mock.calls[0][1];
    expect(callArg.denormalizedFields).not.toHaveProperty('priceFrom');
    expect(callArg.searchProjection).not.toHaveProperty('priceAmountMinorUnits');
    expect(callArg.searchProjection).not.toHaveProperty('priceCurrency');
    expect(callArg.denormalizedFields.units).toHaveLength(2);
  });

  it('обновляет denormalizedFields и searchProjection для публикации отдельного юнита (unitPub)', async () => {
    const unitId = new Types.ObjectId();
    const buildingId = new Types.ObjectId();
    const unitPubId = new Types.ObjectId();

    const unitRepository = {
      findById: jest.fn().mockResolvedValue({
        _id: unitId,
        buildingId,
        number: '101',
        kind: 'apartment',
        price: { amountMinorUnits: 7700000, currency: 'GEL' },
      }),
      listByBuildingIds: jest.fn().mockResolvedValue([]),
    };

    const buildingRepository = {
      findById: jest.fn().mockResolvedValue(null),
    };

    const publicationRepository = {
      findBySource: jest.fn().mockImplementation((sourceType: string, id: Types.ObjectId) => {
        if (sourceType === 'unit' && id.equals(unitId)) {
          return Promise.resolve({
            _id: unitPubId,
            version: 1,
            status: 'published',
            denormalizedFields: { number: '101', price: { amountMinorUnits: 6000000, currency: 'USD' } },
            searchProjection: { priceAmountMinorUnits: 6000000, priceCurrency: 'USD' },
          });
        }
        return Promise.resolve(null);
      }),
      updateProjection: jest.fn().mockResolvedValue({}),
    };

    const handler = new UnitPriceChangedHandler(
      unitRepository as unknown as UnitRepository,
      buildingRepository as unknown as BuildingRepository,
      publicationRepository as unknown as MarketplacePublicationRepository,
    );

    const event = {
      aggregateId: unitId,
      payload: { amountMinorUnits: 7700000, currency: 'GEL' },
    } as unknown as OutboxEventDocument;

    await handler.handle(event);

    expect(publicationRepository.updateProjection).toHaveBeenCalledWith(
      unitPubId,
      expect.objectContaining({
        denormalizedFields: expect.objectContaining({
          price: { amountMinorUnits: 7700000, currency: 'GEL' },
        }),
        searchProjection: expect.objectContaining({
          priceAmountMinorUnits: 7700000,
          priceCurrency: 'GEL',
        }),
      }),
      { expectedVersion: 1 },
    );
  });

  it('делает retry при CAS-конфликте версии (updateProjection возвращает null на первой попытке)', async () => {
    const unitId = new Types.ObjectId();
    const buildingId = new Types.ObjectId();
    const developmentId = new Types.ObjectId();
    const publicationId = new Types.ObjectId();

    const unitRepository = {
      findById: jest.fn().mockResolvedValue({
        _id: unitId,
        buildingId,
        number: '101',
        kind: 'apartment',
        price: { amountMinorUnits: 4500000, currency: 'USD' },
      }),
      listByBuildingIds: jest.fn().mockResolvedValue([
        {
          _id: unitId,
          buildingId,
          number: '101',
          kind: 'apartment',
          area: 50,
          price: { amountMinorUnits: 4500000, currency: 'USD' },
          status: 'available',
        },
      ]),
    };

    const buildingRepository = {
      findById: jest.fn().mockResolvedValue({ _id: buildingId, developmentId, name: 'Block A' }),
      listByDevelopmentId: jest.fn().mockResolvedValue([{ _id: buildingId, name: 'Block A' }]),
    };

    let callCount = 0;
    const publicationRepository = {
      findBySource: jest.fn().mockImplementation((sourceType: string) => {
        if (sourceType === 'development') {
          callCount++;
          return Promise.resolve({
            _id: publicationId,
            version: callCount,
            status: 'published',
            denormalizedFields: { name: 'Sunset Resort' },
            searchProjection: {},
          });
        }
        return Promise.resolve(null);
      }),
      updateProjection: jest
        .fn()
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ _id: publicationId }),
    };

    const handler = new UnitPriceChangedHandler(
      unitRepository as unknown as UnitRepository,
      buildingRepository as unknown as BuildingRepository,
      publicationRepository as unknown as MarketplacePublicationRepository,
    );

    const event = {
      aggregateId: unitId,
      payload: { amountMinorUnits: 4500000, currency: 'USD' },
    } as unknown as OutboxEventDocument;

    await handler.handle(event);

    expect(publicationRepository.updateProjection).toHaveBeenCalledTimes(2);
    expect(publicationRepository.updateProjection).toHaveBeenNthCalledWith(
      1,
      publicationId,
      expect.any(Object),
      { expectedVersion: 1 },
    );
    expect(publicationRepository.updateProjection).toHaveBeenNthCalledWith(
      2,
      publicationId,
      expect.any(Object),
      { expectedVersion: 2 },
    );
  });
});
