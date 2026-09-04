import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { FavoriteDocument, type FavoriteTargetType } from '../schemas/favorite.schema';

/** Единственная точка доступа к коллекции marketplace_favorites (ADR-002). */
@Injectable()
export class FavoriteRepository {
  constructor(@InjectModel(FavoriteDocument.name) private readonly model: Model<FavoriteDocument>) {}

  async listForIdentity(identityId: Types.ObjectId): Promise<FavoriteDocument[]> {
    return this.model.find({ identityId }).sort({ createdAt: -1 }).exec();
  }

  /**
   * Добавление идемпотентно: повторное нажатие на сердечко не создаёт второй
   * записи и не считается ошибкой. Реализовано upsert-ом, а не проверкой перед
   * вставкой — проверка проигрывает гонке двух одновременных запросов.
   */
  async add(
    identityId: Types.ObjectId,
    targetType: FavoriteTargetType,
    slug: string,
  ): Promise<FavoriteDocument> {
    return this.model
      .findOneAndUpdate(
        { identityId, targetType, slug },
        { $setOnInsert: { identityId, targetType, slug } },
        { upsert: true, new: true },
      )
      .exec();
  }

  /** Удаление тоже идемпотентно: снятие уже снятого — не ошибка, а тот же итог. */
  async remove(identityId: Types.ObjectId, targetType: FavoriteTargetType, slug: string): Promise<boolean> {
    const { deletedCount } = await this.model.deleteOne({ identityId, targetType, slug }).exec();
    return (deletedCount ?? 0) > 0;
  }
}
