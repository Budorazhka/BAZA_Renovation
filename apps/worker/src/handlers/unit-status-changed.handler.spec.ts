import { Types } from 'mongoose';
import { UnitStatusChangedHandler } from './unit-status-changed.handler';
import type { OutboxEventDocument } from '@baza/domain-events';
import type { UnitRepository, BuildingRepository } from '@baza/development';
import type { MarketplacePublicationRepository } from '@baza/publication';

describe('UnitStatusChangedHandler', () => {
  it('обновляет список доступных юнитов и priceFrom при переводе юнита в reserved/sold', async () => {
    const unit1Id = new Types.ObjectId();
    const unit2Id = new Types.ObjectId();
    const buildingId = new Types.ObjectId();
    const developmentId = new Types.ObjectId();
    const publicationId = new Types.ObjectId();

    const unitRepository = {
      findById: jest.fn().mockResolvedValue({
        _id: unit1Id,
        buildingId,
        status: 'reserved',
      }),
      listByBuildingIds: jest.fn().mockResolvedValue([
        {
          _id: unit2Id,
          buildingId,
          number: '102',
          kind: 'apartment',
          area: 60,
          price: { amountMinorUnits: 6000000, currency: 'USD' },
          status: 'available',
        },
      ]),
    };

    const buildingRepository = {
      findById: jest.fn().mockResolvedValue({ _id: buildingId, developmentId, name: 'Block A' }),
      listByDevelopmentId: jest.fn().mockResolvedValue([{ _id: buildingId, name: 'Block A' }]),
    };

    const publicationRepository = {
      findBySource: jest.fn().mockResolvedValue({
        _id: publicationId,
        version: 1,
        status: 'published',
        denormalizedFields: { name: 'Sunset Resort' },
        searchProjection: {},
      }),
      updateProjection: jest.fn().mockResolvedValue({}),
    };

    const handler = new UnitStatusChangedHandler(
      unitRepository as unknown as UnitRepository,
      buildingRepository as unknown as BuildingRepository,
      publicationRepository as unknown as MarketplacePublicationRepository,
    );

    const event = {
      aggregateId: unit1Id,
      payload: { status: 'reserved' },
    } as unknown as OutboxEventDocument;

    await handler.handle(event);

    expect(publicationRepository.updateProjection).toHaveBeenCalledWith(
      publicationId,
      expect.objectContaining({
        denormalizedFields: expect.objectContaining({
          priceFrom: { amountMinorUnits: 6000000, currency: 'USD' },
          units: [
            expect.objectContaining({
              id: unit2Id.toString(),
              number: '102',
            }),
          ],
        }),
        searchProjection: expect.objectContaining({
          priceAmountMinorUnits: 6000000,
          priceCurrency: 'USD',
        }),
      }),
      { expectedVersion: 1 },
    );
  });

  it('снимает priceFrom и поисковую цену при переводе последней квартиры в reserved/sold', async () => {
    const unitId = new Types.ObjectId();
    const buildingId = new Types.ObjectId();
    const developmentId = new Types.ObjectId();
    const publicationId = new Types.ObjectId();

    const unitRepository = {
      findById: jest.fn().mockResolvedValue({
        _id: unitId,
        buildingId,
        status: 'sold',
      }),
      listByBuildingIds: jest.fn().mockResolvedValue([]),
    };

    const buildingRepository = {
      findById: jest.fn().mockResolvedValue({ _id: buildingId, developmentId, name: 'Block A' }),
      listByDevelopmentId: jest.fn().mockResolvedValue([{ _id: buildingId, name: 'Block A' }]),
    };

    const publicationRepository = {
      findBySource: jest.fn().mockResolvedValue({
        _id: publicationId,
        version: 1,
        status: 'published',
        denormalizedFields: {
          name: 'Sunset Resort',
          priceFrom: { amountMinorUnits: 6000000, currency: 'USD' },
          units: [{ id: unitId.toString() }],
        },
        searchProjection: { priceAmountMinorUnits: 6000000, priceCurrency: 'USD' },
      }),
      updateProjection: jest.fn().mockResolvedValue({}),
    };

    const handler = new UnitStatusChangedHandler(
      unitRepository as unknown as UnitRepository,
      buildingRepository as unknown as BuildingRepository,
      publicationRepository as unknown as MarketplacePublicationRepository,
    );

    const event = {
      aggregateId: unitId,
      payload: { status: 'sold' },
    } as unknown as OutboxEventDocument;

    await handler.handle(event);

    const callArg = publicationRepository.updateProjection.mock.calls[0][1];
    expect(callArg.denormalizedFields).not.toHaveProperty('priceFrom');
    expect(callArg.denormalizedFields).not.toHaveProperty('units');
    expect(callArg.searchProjection).not.toHaveProperty('priceAmountMinorUnits');
    expect(callArg.searchProjection).not.toHaveProperty('priceCurrency');
  });

  it('восстанавливает priceFrom и поисковую цену при возврате квартиры в статус available', async () => {
    const unitId = new Types.ObjectId();
    const buildingId = new Types.ObjectId();
    const developmentId = new Types.ObjectId();
    const publicationId = new Types.ObjectId();

    const unitRepository = {
      findById: jest.fn().mockResolvedValue({
        _id: unitId,
        buildingId,
        status: 'available',
      }),
      listByBuildingIds: jest.fn().mockResolvedValue([
        {
          _id: unitId,
          buildingId,
          number: '101',
          kind: 'apartment',
          area: 55,
          price: { amountMinorUnits: 5500000, currency: 'USD' },
          status: 'available',
        },
      ]),
    };

    const buildingRepository = {
      findById: jest.fn().mockResolvedValue({ _id: buildingId, developmentId, name: 'Block A' }),
      listByDevelopmentId: jest.fn().mockResolvedValue([{ _id: buildingId, name: 'Block A' }]),
    };

    const publicationRepository = {
      findBySource: jest.fn().mockResolvedValue({
        _id: publicationId,
        version: 1,
        status: 'published',
        denormalizedFields: { name: 'Sunset Resort' },
        searchProjection: {},
      }),
      updateProjection: jest.fn().mockResolvedValue({}),
    };

    const handler = new UnitStatusChangedHandler(
      unitRepository as unknown as UnitRepository,
      buildingRepository as unknown as BuildingRepository,
      publicationRepository as unknown as MarketplacePublicationRepository,
    );

    const event = {
      aggregateId: unitId,
      payload: { status: 'available' },
    } as unknown as OutboxEventDocument;

    await handler.handle(event);

    expect(publicationRepository.updateProjection).toHaveBeenCalledWith(
      publicationId,
      expect.objectContaining({
        denormalizedFields: expect.objectContaining({
          priceFrom: { amountMinorUnits: 5500000, currency: 'USD' },
          units: [
            expect.objectContaining({
              id: unitId.toString(),
              number: '101',
            }),
          ],
        }),
        searchProjection: expect.objectContaining({
          priceAmountMinorUnits: 5500000,
          priceCurrency: 'USD',
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
        status: 'available',
      }),
      listByBuildingIds: jest.fn().mockResolvedValue([
        {
          _id: unitId,
          buildingId,
          number: '101',
          kind: 'apartment',
          area: 50,
          price: { amountMinorUnits: 5500000, currency: 'USD' },
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

    const handler = new UnitStatusChangedHandler(
      unitRepository as unknown as UnitRepository,
      buildingRepository as unknown as BuildingRepository,
      publicationRepository as unknown as MarketplacePublicationRepository,
    );

    const event = {
      aggregateId: unitId,
      payload: { status: 'available' },
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
