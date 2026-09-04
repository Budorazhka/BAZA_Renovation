import { Injectable } from '@nestjs/common';
import { Types } from 'mongoose';
import { FavoriteRepository } from './repository/favorite.repository';
import type { FavoriteTargetType } from './schemas/favorite.schema';

export interface FavoriteView {
  targetType: FavoriteTargetType;
  slug: string;
  createdAt: string;
}

@Injectable()
export class FavoritesService {
  constructor(private readonly repository: FavoriteRepository) {}

  /**
   * Избранное владельца сессии.
   *
   * Отдаёт только тип и slug: карточки страница дочитывает публичными
   * эндпоинтами каталога. Так избранное не дублирует проекцию публикации и не
   * может разойтись с ней в цене или адресе.
   */
  async list(identityId: Types.ObjectId): Promise<FavoriteView[]> {
    const items = await this.repository.listForIdentity(identityId);
    return items.map((item) => ({
      targetType: item.targetType,
      slug: item.slug,
      createdAt: item.createdAt.toISOString(),
    }));
  }

  async add(identityId: Types.ObjectId, targetType: FavoriteTargetType, slug: string): Promise<FavoriteView> {
    const created = await this.repository.add(identityId, targetType, slug);
    return {
      targetType: created.targetType,
      slug: created.slug,
      createdAt: created.createdAt.toISOString(),
    };
  }

  /**
   * Существование объекта здесь НЕ проверяется намеренно.
   *
   * Публичные карточки читаются по slug без аутентификации, поэтому проверка
   * ничего не защищает: узнать, существует ли slug, и так можно одним GET.
   * Зато проверка стоила бы лишнего запроса на каждое нажатие сердечка и
   * ломала бы избранное в момент, когда объект временно снят с публикации.
   * Несуществующий slug просто не отрисуется на странице избранного.
   */
  async remove(identityId: Types.ObjectId, targetType: FavoriteTargetType, slug: string): Promise<{ removed: boolean }> {
    return { removed: await this.repository.remove(identityId, targetType, slug) };
  }
}
