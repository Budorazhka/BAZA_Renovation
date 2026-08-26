import { Types } from 'mongoose';
import { PositionProfileRepository } from './position-profile.repository';

describe('PositionProfileRepository.create', () => {
  it('передаёт positionId/organizationId + все поля в одном документе', async () => {
    const positionId = new Types.ObjectId();
    const organizationId = new Types.ObjectId();
    const createSpy = jest.fn().mockResolvedValue([{ _id: new Types.ObjectId() }]);
    const repository = new PositionProfileRepository({ create: createSpy } as never);

    await repository.create(positionId, organizationId, { phone: '+79990000000', skills: ['sales'] });

    expect(createSpy).toHaveBeenCalledWith(
      [{ positionId, organizationId, phone: '+79990000000', skills: ['sales'] }],
      { session: undefined },
    );
  });
});

describe('PositionProfileRepository.findByPositionIds', () => {
  it('batched $in запрос, не N отдельных', async () => {
    const positionIds = [new Types.ObjectId(), new Types.ObjectId()];
    const execSpy = jest.fn().mockResolvedValue([]);
    const findSpy = jest.fn().mockReturnValue({ exec: execSpy });
    const repository = new PositionProfileRepository({ find: findSpy } as never);

    await repository.findByPositionIds(positionIds);

    expect(findSpy).toHaveBeenCalledWith({ positionId: { $in: positionIds } });
  });
});

describe('PositionProfileRepository.upsertFields', () => {
  it('upsert:true — создаёт профиль для позиции, у которой его ещё не было', async () => {
    const positionId = new Types.ObjectId();
    const organizationId = new Types.ObjectId();
    const execSpy = jest.fn().mockResolvedValue({ upsertedCount: 1, modifiedCount: 0 });
    const updateOneSpy = jest.fn().mockReturnValue({ exec: execSpy });
    const repository = new PositionProfileRepository({ updateOne: updateOneSpy } as never);

    await repository.upsertFields(positionId, organizationId, { city: 'Tbilisi' });

    expect(updateOneSpy).toHaveBeenCalledWith(
      { positionId },
      { $set: { city: 'Tbilisi', organizationId } },
      { upsert: true },
    );
  });
});
