import { Types } from 'mongoose';
import { PositionRepository } from './position.repository';

describe('PositionRepository.findAllByOrganization', () => {
  /**
   * Найдено реальным E2E-прогоном: closed-позиции (teamApi.ts::remove)
   * оставались видны в GET /team-users list — исправлено фильтром на
   * уровне запроса, эта проверка защищает от регрессии.
   */
  it('фильтр исключает status:closed', async () => {
    const organizationId = new Types.ObjectId();
    const execSpy = jest.fn().mockResolvedValue([]);
    const findSpy = jest.fn().mockReturnValue({ exec: execSpy });
    const repository = new PositionRepository({ find: findSpy } as never);

    await repository.findAllByOrganization(organizationId);

    expect(findSpy).toHaveBeenCalledWith({ organizationId, status: { $ne: 'closed' } });
  });
});

describe('PositionRepository.updateParent', () => {
  /**
   * Реальный найденный баг (second-opinion ревью): раньше возвращался
   * modifiedCount, который MongoDB зануляет для no-op $set (тот же
   * parentPositionId, что уже стоит на записи) — идемпотентный повторный
   * вызов ошибочно трактовался вызывающим кодом как "позиция не найдена".
   * matchedCount не подвержен этой проблеме — эта проверка защищает от
   * регрессии на уровне repository.
   */
  it('возвращает matchedCount, не modifiedCount', async () => {
    const positionId = new Types.ObjectId();
    const parentPositionId = new Types.ObjectId();
    const execSpy = jest.fn().mockResolvedValue({ matchedCount: 1, modifiedCount: 0 });
    const updateOneSpy = jest.fn().mockReturnValue({ exec: execSpy });
    const repository = new PositionRepository({ updateOne: updateOneSpy } as never);

    const result = await repository.updateParent(positionId, parentPositionId);

    expect(updateOneSpy).toHaveBeenCalledWith(
      { _id: positionId },
      { $set: { parentPositionId } },
      { session: undefined },
    );
    expect(result).toEqual({ matchedCount: 1 });
  });
});

describe('PositionRepository.setAvatarAsset', () => {
  it('пишет avatarAssetId через $set', async () => {
    const positionId = new Types.ObjectId();
    const assetId = new Types.ObjectId();
    const execSpy = jest.fn().mockResolvedValue({ matchedCount: 1 });
    const updateOneSpy = jest.fn().mockReturnValue({ exec: execSpy });
    const repository = new PositionRepository({ updateOne: updateOneSpy } as never);

    const result = await repository.setAvatarAsset(positionId, assetId);

    expect(updateOneSpy).toHaveBeenCalledWith({ _id: positionId }, { $set: { avatarAssetId: assetId } });
    expect(result).toEqual({ matchedCount: 1 });
  });
});

describe('PositionRepository.markClosed', () => {
  it('условие status:vacant в фильтре — не закрывает занятую позицию', async () => {
    const positionId = new Types.ObjectId();
    const execSpy = jest.fn().mockResolvedValue({ modifiedCount: 1 });
    const updateOneSpy = jest.fn().mockReturnValue({ exec: execSpy });
    const repository = new PositionRepository({ updateOne: updateOneSpy } as never);

    await repository.markClosed(positionId);

    expect(updateOneSpy).toHaveBeenCalledWith(
      { _id: positionId, status: 'vacant' },
      { $set: { status: 'closed' } },
      { session: undefined },
    );
  });
});
