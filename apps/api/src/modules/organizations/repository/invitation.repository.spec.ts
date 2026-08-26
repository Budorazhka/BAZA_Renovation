import { Types } from 'mongoose';
import { InvitationRepository } from './invitation.repository';

describe('InvitationRepository.create', () => {
  it('передаёт все поля в model.create одним документом', async () => {
    const organizationId = new Types.ObjectId();
    const positionId = new Types.ObjectId();
    const identityId = new Types.ObjectId();
    const expiresAt = new Date();
    const createSpy = jest.fn().mockResolvedValue([{ _id: new Types.ObjectId() }]);
    const repository = new InvitationRepository({ create: createSpy } as never);

    const params = { organizationId, positionId, identityId, tokenHash: 'hash', email: 'a@b.com', expiresAt };
    await repository.create(params);

    expect(createSpy).toHaveBeenCalledWith([params], { session: undefined });
  });
});

describe('InvitationRepository.findByTokenHash', () => {
  it('запрашивает tokenHash явно (select:false на схеме)', async () => {
    const execSpy = jest.fn().mockResolvedValue(null);
    const selectSpy = jest.fn().mockReturnValue({ exec: execSpy });
    const findOneSpy = jest.fn().mockReturnValue({ select: selectSpy });
    const repository = new InvitationRepository({ findOne: findOneSpy } as never);

    await repository.findByTokenHash('some-hash');

    expect(findOneSpy).toHaveBeenCalledWith({ tokenHash: 'some-hash' });
    expect(selectSpy).toHaveBeenCalledWith('+tokenHash');
  });
});

describe('InvitationRepository.markActivated', () => {
  it('условие status:pending в фильтре — не реактивирует уже активированное приглашение', async () => {
    const id = new Types.ObjectId();
    const execSpy = jest.fn().mockResolvedValue({ modifiedCount: 1 });
    const updateOneSpy = jest.fn().mockReturnValue({ exec: execSpy });
    const repository = new InvitationRepository({ updateOne: updateOneSpy } as never);

    const result = await repository.markActivated(id);

    expect(updateOneSpy).toHaveBeenCalledWith(
      { _id: id, status: 'pending' },
      { $set: { status: 'activated' } },
      { session: undefined },
    );
    expect(result).toEqual({ modifiedCount: 1 });
  });
});
