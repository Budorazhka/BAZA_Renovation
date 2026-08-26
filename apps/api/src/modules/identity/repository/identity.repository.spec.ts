import { Types } from 'mongoose';
import { IdentityRepository } from './identity.repository';

describe('IdentityRepository.updateStatus', () => {
  it('deactivated: $set status+deactivatedAt', async () => {
    const id = new Types.ObjectId();
    const execSpy = jest.fn().mockResolvedValue({ modifiedCount: 1 });
    const updateOneSpy = jest.fn().mockReturnValue({ exec: execSpy });
    const repository = new IdentityRepository({ updateOne: updateOneSpy } as never);

    await repository.updateStatus(id, 'deactivated');

    expect(updateOneSpy).toHaveBeenCalledTimes(1);
    const [filter, update] = updateOneSpy.mock.calls[0] as [
      unknown,
      { $set: { status: string; deactivatedAt: Date } },
    ];
    expect(filter).toEqual({ _id: id });
    expect(update.$set.status).toBe('deactivated');
    expect(update.$set.deactivatedAt).toBeInstanceOf(Date);
  });

  it('active: $set status + $unset deactivatedAt (не оставляет старую дату)', async () => {
    const id = new Types.ObjectId();
    const execSpy = jest.fn().mockResolvedValue({ modifiedCount: 1 });
    const updateOneSpy = jest.fn().mockReturnValue({ exec: execSpy });
    const repository = new IdentityRepository({ updateOne: updateOneSpy } as never);

    await repository.updateStatus(id, 'active');

    const [, update] = updateOneSpy.mock.calls[0] as [
      unknown,
      { $set: { status: string }; $unset: { deactivatedAt: number } },
    ];
    expect(update.$set.status).toBe('active');
    expect(update.$unset).toEqual({ deactivatedAt: 1 });
  });
});

describe('IdentityRepository.createPendingInvite', () => {
  it('создаёт Identity без passwordHash, status:pending_invite', async () => {
    const createSpy = jest.fn().mockResolvedValue({ _id: new Types.ObjectId() });
    const repository = new IdentityRepository({ create: createSpy } as never);

    await repository.createPendingInvite('invited@example.com');

    expect(createSpy).toHaveBeenCalledWith({ normalizedLogin: 'invited@example.com', status: 'pending_invite' });
  });
});

describe('IdentityRepository.setPasswordAndActivate', () => {
  it('условие status:pending_invite в фильтре — не активирует уже активную Identity повторно', async () => {
    const id = new Types.ObjectId();
    const execSpy = jest.fn().mockResolvedValue({ modifiedCount: 1 });
    const updateOneSpy = jest.fn().mockReturnValue({ exec: execSpy });
    const repository = new IdentityRepository({ updateOne: updateOneSpy } as never);

    const result = await repository.setPasswordAndActivate(id, 'hashed-password');

    expect(updateOneSpy).toHaveBeenCalledWith(
      { _id: id, status: 'pending_invite' },
      { $set: { passwordHash: 'hashed-password', status: 'active' } },
    );
    expect(result).toEqual({ modifiedCount: 1 });
  });
});

describe('IdentityRepository.findByNormalizedLogin', () => {
  it('ищет без пароля (не auth-путь, existence-check)', async () => {
    const execSpy = jest.fn().mockResolvedValue(null);
    const findOneSpy = jest.fn().mockReturnValue({ exec: execSpy });
    const repository = new IdentityRepository({ findOne: findOneSpy } as never);

    await repository.findByNormalizedLogin('someone@example.com');

    expect(findOneSpy).toHaveBeenCalledWith({ normalizedLogin: 'someone@example.com' });
  });
});
