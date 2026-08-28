import { Types } from 'mongoose';
import { PropertyAssetRepository } from './property-asset.repository';

describe('PropertyAssetRepository', () => {
  it('filters reads by publisherScope.organizationId', async () => {
    const findOne = jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue({}) });
    const model = { findOne } as never;
    const repository = new PropertyAssetRepository(model);
    const id = new Types.ObjectId();
    const organizationId = new Types.ObjectId();

    await repository.findByIdForOrganization(id, organizationId);

    expect(findOne).toHaveBeenCalledWith({
      _id: id,
      'publisherScope.type': 'organization',
      'publisherScope.organizationId': organizationId,
    });
  });

  it('worker-side findById has no tenant filter', async () => {
    const findOne = jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue({}) });
    const model = { findOne } as never;
    const repository = new PropertyAssetRepository(model);
    const id = new Types.ObjectId();

    await repository.findById(id);

    expect(findOne).toHaveBeenCalledWith({ _id: id });
  });

  describe('marketplace publishing wizard — identity-scoped methods', () => {
    it('findByIdForIdentity filters by publisherScope.type:marketplace_account + identityId', async () => {
      const findOne = jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue({}) });
      const model = { findOne } as never;
      const repository = new PropertyAssetRepository(model);
      const id = new Types.ObjectId();
      const identityId = new Types.ObjectId();

      await repository.findByIdForIdentity(id, identityId);

      expect(findOne).toHaveBeenCalledWith({
        _id: id,
        'publisherScope.type': 'marketplace_account',
        'publisherScope.identityId': identityId,
      });
    });

    it('listForIdentity filters by publisherScope.type:marketplace_account + identityId', async () => {
      const sort = jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue([]) });
      const find = jest.fn().mockReturnValue({ sort });
      const model = { find } as never;
      const repository = new PropertyAssetRepository(model);
      const identityId = new Types.ObjectId();

      await repository.listForIdentity(identityId);

      expect(find).toHaveBeenCalledWith({
        'publisherScope.type': 'marketplace_account',
        'publisherScope.identityId': identityId,
      });
    });
  });
});
