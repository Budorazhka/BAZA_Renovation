import { Types } from 'mongoose';
import { MediaAssetRepository } from './media-asset.repository';

describe('MediaAssetRepository', () => {
  describe('create', () => {
    it('передаёт явный _id и default status:pending, variants:[]', async () => {
      const createSpy = jest.fn().mockResolvedValue([{ _id: 'stub' }]);
      const mockModel = { create: createSpy };

      const repository = new MediaAssetRepository(mockModel as never);
      const assetId = new Types.ObjectId();
      const organizationId = new Types.ObjectId();

      await repository.create({
        _id: assetId,
        ownerScope: { type: 'organization', organizationId },
        declaredMimeType: 'image/png',
        sizeBytes: 1000,
        bucket: 'public',
        originalPath: `${assetId.toString()}/original.png`,
        purpose: 'unit_photo',
      });

      expect(createSpy).toHaveBeenCalledWith([
        expect.objectContaining({
          _id: assetId,
          status: 'pending',
          variants: [],
        }),
      ]);
    });
  });

  describe('markVerified', () => {
    it('сверяется с session и условием status:pending в фильтре', async () => {
      const id = new Types.ObjectId();
      const fakeSession = { id: 'session-marker' } as never;
      const execSpy = jest.fn().mockResolvedValue({ modifiedCount: 1 });
      const updateOneSpy = jest.fn().mockReturnValue({ exec: execSpy });
      const mockModel = { updateOne: updateOneSpy };

      const repository = new MediaAssetRepository(mockModel as never);
      const result = await repository.markVerified(
        id,
        { verifiedMimeType: 'image/png', checksum: 'abc' },
        fakeSession,
      );

      expect(updateOneSpy).toHaveBeenCalledWith(
        { _id: id, status: 'pending' },
        { $set: { status: 'verified', verifiedMimeType: 'image/png', checksum: 'abc' } },
        { session: fakeSession },
      );
      expect(result).toEqual({ modifiedCount: 1 });
    });

    it('возвращает modifiedCount:0, если запись уже не в статусе pending (конкурентный confirm)', async () => {
      const execSpy = jest.fn().mockResolvedValue({ modifiedCount: 0 });
      const mockModel = { updateOne: jest.fn().mockReturnValue({ exec: execSpy }) };

      const repository = new MediaAssetRepository(mockModel as never);
      const result = await repository.markVerified(
        new Types.ObjectId(),
        { verifiedMimeType: 'image/png', checksum: 'abc' },
        {} as never,
      );

      expect(result).toEqual({ modifiedCount: 0 });
    });
  });

  describe('markRejected', () => {
    it('сверяется с session и условием status:pending в фильтре', async () => {
      const id = new Types.ObjectId();
      const fakeSession = {} as never;
      const execSpy = jest.fn().mockResolvedValue({ modifiedCount: 1 });
      const updateOneSpy = jest.fn().mockReturnValue({ exec: execSpy });
      const mockModel = { updateOne: updateOneSpy };

      const repository = new MediaAssetRepository(mockModel as never);
      await repository.markRejected(id, 'MIME mismatch', fakeSession);

      expect(updateOneSpy).toHaveBeenCalledWith(
        { _id: id, status: 'pending' },
        { $set: { status: 'rejected', rejectionReason: 'MIME mismatch' } },
        { session: fakeSession },
      );
    });
  });

  describe('appendVariant', () => {
    it('пушит variant в массив variants', async () => {
      const id = new Types.ObjectId();
      const execSpy = jest.fn().mockResolvedValue(undefined);
      const updateOneSpy = jest.fn().mockReturnValue({ exec: execSpy });
      const mockModel = { updateOne: updateOneSpy };

      const repository = new MediaAssetRepository(mockModel as never);
      const variant = { type: 'thumbnail' as const, assetPath: 'x/thumbnail/1.webp', exifStripped: true as const };
      await repository.appendVariant(id, variant);

      expect(updateOneSpy).toHaveBeenCalledWith({ _id: id }, { $push: { variants: variant } });
    });
  });

  describe('findStalePending', () => {
    it('фильтрует по status:pending и createdAt < olderThan, с limit', async () => {
      const olderThan = new Date('2026-01-01');
      const execSpy = jest.fn().mockResolvedValue([]);
      const limitSpy = jest.fn().mockReturnValue({ exec: execSpy });
      const findSpy = jest.fn().mockReturnValue({ limit: limitSpy });
      const mockModel = { find: findSpy };

      const repository = new MediaAssetRepository(mockModel as never);
      await repository.findStalePending(olderThan, 50);

      expect(findSpy).toHaveBeenCalledWith({ status: 'pending', createdAt: { $lt: olderThan } });
      expect(limitSpy).toHaveBeenCalledWith(50);
    });
  });
});
