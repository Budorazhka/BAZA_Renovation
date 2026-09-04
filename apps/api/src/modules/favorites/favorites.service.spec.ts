import { Types } from 'mongoose';
import { FavoritesService } from './favorites.service';
import type { FavoriteRepository } from './repository/favorite.repository';

function makeService(repository: Partial<FavoriteRepository>) {
  return new FavoritesService(repository as FavoriteRepository);
}

describe('FavoritesService', () => {
  const identityId = new Types.ObjectId();

  it('список отдаёт только тип, slug и дату — без внутренних полей', async () => {
    const service = makeService({
      listForIdentity: jest.fn().mockResolvedValue([
        {
          _id: new Types.ObjectId(),
          identityId,
          targetType: 'development',
          slug: 'zhk-batumi',
          createdAt: new Date('2026-09-01T10:00:00.000Z'),
        },
      ]),
    });

    const result = await service.list(identityId);

    expect(result).toEqual([
      { targetType: 'development', slug: 'zhk-batumi', createdAt: '2026-09-01T10:00:00.000Z' },
    ]);
    // identityId — чужой внутренний идентификатор, наружу ему нечего делать.
    expect(result[0]).not.toHaveProperty('identityId');
    expect(result[0]).not.toHaveProperty('_id');
  });

  it('список запрашивается строго по владельцу сессии', async () => {
    const listForIdentity = jest.fn().mockResolvedValue([]);
    const service = makeService({ listForIdentity });

    await service.list(identityId);

    expect(listForIdentity).toHaveBeenCalledWith(identityId);
  });

  it('добавление передаёт владельца, тип и slug без изменений', async () => {
    const add = jest.fn().mockResolvedValue({
      targetType: 'listing',
      slug: 'kvartira-vake',
      createdAt: new Date('2026-09-02T08:00:00.000Z'),
    });
    const service = makeService({ add });

    const result = await service.add(identityId, 'listing', 'kvartira-vake');

    expect(add).toHaveBeenCalledWith(identityId, 'listing', 'kvartira-vake');
    expect(result.slug).toBe('kvartira-vake');
  });

  it('снятие уже снятого не ошибка: возвращает removed=false', async () => {
    const service = makeService({ remove: jest.fn().mockResolvedValue(false) });

    await expect(service.remove(identityId, 'development', 'zhk-batumi')).resolves.toEqual({
      removed: false,
    });
  });
});
