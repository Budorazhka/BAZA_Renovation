import { Types } from 'mongoose';
import { DuplicateCandidateRepository } from './duplicate-candidate.repository';

const signals = { phoneMatch: true, addressMatch: false, roomsAreaFloorMatch: false };

describe('DuplicateCandidateRepository', () => {
  describe('upsertDetected — normalizePair', () => {
    it('нормализует пару (A,B) и (B,A) к одному и тому же канонич. порядку (меньший hex первым)', async () => {
      const findOne = jest.fn().mockReturnValue({ session: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue(null) }) });
      const create = jest.fn().mockResolvedValue([{ _id: new Types.ObjectId() }]);
      const model = { findOne, create } as never;
      const repository = new DuplicateCandidateRepository(model);

      // Гарантированный порядок: id1 < id2 лексикографически (ObjectId
      // монотонно возрастают по времени создания в большинстве случаев,
      // но здесь берём буквально строковое сравнение hex, как это делает
      // сам repository).
      const id1 = new Types.ObjectId('000000000000000000000001');
      const id2 = new Types.ObjectId('000000000000000000000002');

      await repository.upsertDetected(id2, id1, signals);
      const [findOneCallArgs] = findOne.mock.calls[0] as [{ propertyAssetIdA: Types.ObjectId; propertyAssetIdB: Types.ObjectId }];
      expect(findOneCallArgs.propertyAssetIdA.equals(id1)).toBe(true);
      expect(findOneCallArgs.propertyAssetIdB.equals(id2)).toBe(true);

      await repository.upsertDetected(id1, id2, signals);
      const [secondCallArgs] = findOne.mock.calls[1] as [{ propertyAssetIdA: Types.ObjectId; propertyAssetIdB: Types.ObjectId }];
      expect(secondCallArgs.propertyAssetIdA.equals(id1)).toBe(true);
      expect(secondCallArgs.propertyAssetIdB.equals(id2)).toBe(true);
    });

    it('обновляет signals для существующей detected-записи, не создаёт вторую', async () => {
      const existingDoc = { status: 'detected', signals: { phoneMatch: false, addressMatch: false, roomsAreaFloorMatch: false }, save: jest.fn().mockResolvedValue(undefined) };
      const findOne = jest.fn().mockReturnValue({ session: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue(existingDoc) }) });
      const create = jest.fn();
      const model = { findOne, create } as never;
      const repository = new DuplicateCandidateRepository(model);

      const result = await repository.upsertDetected(new Types.ObjectId(), new Types.ObjectId(), signals);

      expect(create).not.toHaveBeenCalled();
      expect(existingDoc.save).toHaveBeenCalled();
      expect(existingDoc.signals).toEqual(signals);
      expect(result).toBe(existingDoc);
    });

    it('НЕ обновляет signals/не трогает существующую override_not_duplicate/confirmed_duplicate запись (уже принятое решение не должно молча измениться)', async () => {
      const existingDoc = { status: 'override_not_duplicate', signals: { phoneMatch: false, addressMatch: false, roomsAreaFloorMatch: false }, save: jest.fn() };
      const findOne = jest.fn().mockReturnValue({ session: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue(existingDoc) }) });
      const model = { findOne, create: jest.fn() } as never;
      const repository = new DuplicateCandidateRepository(model);

      const result = await repository.upsertDetected(new Types.ObjectId(), new Types.ObjectId(), signals);

      expect(existingDoc.save).not.toHaveBeenCalled();
      expect(result).toBe(existingDoc);
    });
  });

  describe('findBlockingCandidates', () => {
    it('ищет по обеим сторонам пары, только detected/confirmed_duplicate (не override_not_duplicate)', async () => {
      const find = jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue([]) });
      const model = { find } as never;
      const repository = new DuplicateCandidateRepository(model);
      const assetId = new Types.ObjectId();

      await repository.findBlockingCandidates(assetId);

      expect(find).toHaveBeenCalledWith({
        $or: [{ propertyAssetIdA: assetId }, { propertyAssetIdB: assetId }],
        status: { $in: ['detected', 'confirmed_duplicate'] },
      });
    });
  });

  describe('findCandidatesForAsset', () => {
    it('ищет всех кандидатов по обеим сторонам пары без фильтра по статусу', async () => {
      const find = jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue([]) });
      const model = { find } as never;
      const repository = new DuplicateCandidateRepository(model);
      const assetId = new Types.ObjectId();

      await repository.findCandidatesForAsset(assetId);

      expect(find).toHaveBeenCalledWith({
        $or: [{ propertyAssetIdA: assetId }, { propertyAssetIdB: assetId }],
      });
    });
  });

  describe('override', () => {
    it('CAS-фильтр требует status:detected — не даёт override уже confirmed_duplicate', async () => {
      const updateOne = jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue({ modifiedCount: 1 }) });
      const model = { updateOne } as never;
      const repository = new DuplicateCandidateRepository(model);
      const id = new Types.ObjectId();
      const overrideByIdentityId = new Types.ObjectId();

      await repository.override(id, { overrideReason: 'Not the same unit, verified in person', overrideByIdentityId });

      expect(updateOne).toHaveBeenCalledWith(
        { _id: id, status: 'detected' },
        expect.objectContaining({
          $set: expect.objectContaining({ status: 'override_not_duplicate', overrideByIdentityId }),
        }),
        expect.anything(),
      );
    });
  });

  describe('markConfirmedDuplicate', () => {
    it('фильтр допускает confirm из detected И override_not_duplicate (не только detected) — admin может отменить override владельца', async () => {
      const updateOne = jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue({ modifiedCount: 1 }) });
      const model = { updateOne } as never;
      const repository = new DuplicateCandidateRepository(model);
      const id = new Types.ObjectId();
      const confirmByAdminAccountId = new Types.ObjectId();

      const result = await repository.markConfirmedDuplicate(id, {
        reason: 'Verified same physical unit by phone',
        confirmByAdminAccountId,
      });

      expect(updateOne).toHaveBeenCalledWith(
        { _id: id, status: { $ne: 'confirmed_duplicate' } },
        expect.objectContaining({
          $set: expect.objectContaining({
            status: 'confirmed_duplicate',
            confirmReason: 'Verified same physical unit by phone',
            confirmByAdminAccountId,
          }),
        }),
        expect.anything(),
      );
      expect(result).toEqual({ modifiedCount: 1 });
    });

    it('не может confirm уже confirmed_duplicate (modifiedCount:0)', async () => {
      const updateOne = jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue({ modifiedCount: 0 }) });
      const model = { updateOne } as never;
      const repository = new DuplicateCandidateRepository(model);

      const result = await repository.markConfirmedDuplicate(new Types.ObjectId(), {
        reason: 'test',
        confirmByAdminAccountId: new Types.ObjectId(),
      });

      expect(result).toEqual({ modifiedCount: 0 });
    });
  });

  describe('listForReview', () => {
    it('фильтрует по переданным статусам и cursor, сортирует по _id, лимитирует', async () => {
      const sort = jest.fn().mockReturnThis();
      const limit = jest.fn().mockReturnThis();
      const exec = jest.fn().mockResolvedValue([]);
      const find = jest.fn().mockReturnValue({ sort, limit, exec });
      const model = { find } as never;
      const repository = new DuplicateCandidateRepository(model);
      const cursor = new Types.ObjectId();

      await repository.listForReview(['detected', 'override_not_duplicate'], { cursor, limit: 20 });

      expect(find).toHaveBeenCalledWith({
        status: { $in: ['detected', 'override_not_duplicate'] },
        _id: { $gt: cursor },
      });
      expect(sort).toHaveBeenCalledWith({ _id: 1 });
      expect(limit).toHaveBeenCalledWith(20);
    });

    it('без cursor не добавляет _id-фильтр (первая страница)', async () => {
      const sort = jest.fn().mockReturnThis();
      const limit = jest.fn().mockReturnThis();
      const exec = jest.fn().mockResolvedValue([]);
      const find = jest.fn().mockReturnValue({ sort, limit, exec });
      const model = { find } as never;
      const repository = new DuplicateCandidateRepository(model);

      await repository.listForReview(['detected'], { limit: 20 });

      expect(find).toHaveBeenCalledWith({ status: { $in: ['detected'] } });
    });
  });
});
