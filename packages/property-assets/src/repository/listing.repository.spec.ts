import { Types } from 'mongoose';
import { ListingRepository } from './listing.repository';

describe('ListingRepository', () => {
  it('markPublishing CAS-фильтр требует status active И version, не только tenant match', async () => {
    const updateOne = jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue({ modifiedCount: 1 }) });
    const model = { updateOne } as never;
    const repository = new ListingRepository(model);
    const id = new Types.ObjectId();
    const organizationId = new Types.ObjectId();
    const session = {} as never;

    await repository.markPublishing(id, organizationId, 3, session);

    expect(updateOne).toHaveBeenCalledWith(
      {
        _id: id,
        'publisherScope.type': 'organization',
        'publisherScope.organizationId': organizationId,
        status: 'active',
        version: 3,
      },
      { $inc: { version: 1 } },
      { session },
    );
  });

  it('worker-side findById has no tenant filter', async () => {
    const findOne = jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue({}) });
    const model = { findOne } as never;
    const repository = new ListingRepository(model);
    const id = new Types.ObjectId();

    await repository.findById(id);

    expect(findOne).toHaveBeenCalledWith({ _id: id });
  });

  describe('activate — ACT-001', () => {
    it('проставляет lastConfirmedAt:now при первой активации', async () => {
      const findOneAndUpdate = jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue({}) });
      const model = { findOneAndUpdate } as never;
      const repository = new ListingRepository(model);
      const id = new Types.ObjectId();
      const organizationId = new Types.ObjectId();
      const now = new Date('2026-08-28T00:00:00Z');

      await repository.activate(id, organizationId, now);

      expect(findOneAndUpdate).toHaveBeenCalledWith(
        { _id: id, 'publisherScope.type': 'organization', 'publisherScope.organizationId': organizationId, status: 'draft' },
        { $set: { status: 'active', lastConfirmedAt: now }, $inc: { version: 1 } },
        { new: true, session: undefined },
      );
    });
  });

  describe('confirmActuality — ACT-001', () => {
    it('CAS-фильтр требует status IN [active, expired] И version, устанавливает status:active + сбрасывает lastConfirmedAt', async () => {
      const updateOne = jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue({ modifiedCount: 1 }) });
      const model = { updateOne } as never;
      const repository = new ListingRepository(model);
      const id = new Types.ObjectId();
      const organizationId = new Types.ObjectId();
      const now = new Date('2026-08-28T00:00:00Z');

      await repository.confirmActuality(id, organizationId, 4, now);

      expect(updateOne).toHaveBeenCalledWith(
        { _id: id, 'publisherScope.type': 'organization', 'publisherScope.organizationId': organizationId, status: { $in: ['active', 'expired'] }, version: 4 },
        { $set: { status: 'active', lastConfirmedAt: now }, $inc: { version: 1 } },
        { session: undefined },
      );
    });
  });

  describe('markExpired — ACT-001', () => {
    it('CAS-фильтр требует status:active, БЕЗ tenant-фильтра (system actor, batch job)', async () => {
      const updateOne = jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue({ modifiedCount: 1 }) });
      const model = { updateOne } as never;
      const repository = new ListingRepository(model);
      const id = new Types.ObjectId();

      await repository.markExpired(id, 2);

      expect(updateOne).toHaveBeenCalledWith(
        { _id: id, status: 'active', version: 2 },
        { $set: { status: 'expired' }, $inc: { version: 1 } },
        { session: undefined },
      );
    });
  });

  describe('findActiveListingsConfirmedBefore — ACT-001 batch scan', () => {
    it('фильтрует по status:active и lastConfirmedAt < cutoff, cursor pagination', async () => {
      const find = jest.fn().mockReturnValue({ sort: jest.fn().mockReturnThis(), limit: jest.fn().mockReturnThis(), exec: jest.fn().mockResolvedValue([]) });
      const model = { find } as never;
      const repository = new ListingRepository(model);
      const cutoff = new Date('2026-08-01T00:00:00Z');
      const cursor = new Types.ObjectId();

      await repository.findActiveListingsConfirmedBefore(cutoff, { cursor, limit: 50 });

      expect(find).toHaveBeenCalledWith({ status: 'active', lastConfirmedAt: { $lt: cutoff }, _id: { $gt: cursor } });
    });
  });

  describe('marketplace publishing wizard — identity-scoped methods', () => {
    it('findByIdForIdentity filters by publisherScope.type:marketplace_account + identityId', async () => {
      const findOne = jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue({}) });
      const model = { findOne } as never;
      const repository = new ListingRepository(model);
      const id = new Types.ObjectId();
      const identityId = new Types.ObjectId();

      await repository.findByIdForIdentity(id, identityId);

      expect(findOne).toHaveBeenCalledWith({
        _id: id,
        'publisherScope.type': 'marketplace_account',
        'publisherScope.identityId': identityId,
      });
    });

    it('listForAssetIdentity filters by propertyAssetId + publisherScope.type:marketplace_account + identityId', async () => {
      const sort = jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue([]) });
      const find = jest.fn().mockReturnValue({ sort });
      const model = { find } as never;
      const repository = new ListingRepository(model);
      const assetId = new Types.ObjectId();
      const identityId = new Types.ObjectId();

      await repository.listForAssetIdentity(assetId, identityId);

      expect(find).toHaveBeenCalledWith({
        propertyAssetId: assetId,
        'publisherScope.type': 'marketplace_account',
        'publisherScope.identityId': identityId,
      });
    });

    it('activateForIdentity CAS-фильтр требует status:draft + publisherScope.identityId', async () => {
      const findOneAndUpdate = jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue({}) });
      const model = { findOneAndUpdate } as never;
      const repository = new ListingRepository(model);
      const id = new Types.ObjectId();
      const identityId = new Types.ObjectId();
      const now = new Date('2026-08-28T00:00:00Z');

      await repository.activateForIdentity(id, identityId, now);

      expect(findOneAndUpdate).toHaveBeenCalledWith(
        { _id: id, 'publisherScope.type': 'marketplace_account', 'publisherScope.identityId': identityId, status: 'draft' },
        { $set: { status: 'active', lastConfirmedAt: now }, $inc: { version: 1 } },
        { new: true, session: undefined },
      );
    });

    it('markPublishingForIdentity CAS-фильтр требует status:active + version + publisherScope.identityId', async () => {
      const updateOne = jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue({ modifiedCount: 1 }) });
      const model = { updateOne } as never;
      const repository = new ListingRepository(model);
      const id = new Types.ObjectId();
      const identityId = new Types.ObjectId();
      const session = {} as never;

      await repository.markPublishingForIdentity(id, identityId, 3, session);

      expect(updateOne).toHaveBeenCalledWith(
        { _id: id, 'publisherScope.type': 'marketplace_account', 'publisherScope.identityId': identityId, status: 'active', version: 3 },
        { $inc: { version: 1 } },
        { session },
      );
    });

    it('confirmActualityForIdentity CAS-фильтр допускает status IN [active, expired] + publisherScope.identityId', async () => {
      const updateOne = jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue({ modifiedCount: 1 }) });
      const model = { updateOne } as never;
      const repository = new ListingRepository(model);
      const id = new Types.ObjectId();
      const identityId = new Types.ObjectId();
      const now = new Date('2026-08-28T00:00:00Z');

      await repository.confirmActualityForIdentity(id, identityId, 4, now);

      expect(updateOne).toHaveBeenCalledWith(
        { _id: id, 'publisherScope.type': 'marketplace_account', 'publisherScope.identityId': identityId, status: { $in: ['active', 'expired'] }, version: 4 },
        { $set: { status: 'active', lastConfirmedAt: now }, $inc: { version: 1 } },
        { session: undefined },
      );
    });

    it('findActiveForDealTypeIdentity фильтрует по propertyAssetId + dealType + status:active + identityId', async () => {
      const findOne = jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue(null) });
      const model = { findOne } as never;
      const repository = new ListingRepository(model);
      const assetId = new Types.ObjectId();
      const identityId = new Types.ObjectId();

      await repository.findActiveForDealTypeIdentity(assetId, identityId, 'sale');

      expect(findOne).toHaveBeenCalledWith({
        propertyAssetId: assetId,
        dealType: 'sale',
        status: 'active',
        'publisherScope.type': 'marketplace_account',
        'publisherScope.identityId': identityId,
      });
    });
  });
});
