import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type FavoriteTargetType = 'development' | 'listing';

/**
 * Объект, сохранённый покупателем в избранное.
 *
 * До 04.09.2026 избранного не существовало: сердечко на карточке было локальным
 * состоянием React (`useState(false)`), которое сбрасывалось при переходе на
 * другую страницу, а раздел «Избранное» показывал захардкоженный список,
 * никак не связанный с тем, что человек нажимал.
 *
 * **Ключ — slug публикации, а не id сущности.** Так избранное не зависит от
 * того, что именно опубликовано (ЖК или объявление), и не требует доступа к
 * приватным коллекциям: страница избранного дочитывает карточки теми же
 * публичными эндпоинтами `GET /public/developments/:slug` и
 * `GET /public/listings/:slug`, которыми пользуется весь каталог.
 * Плата за это — если slug когда-нибудь сменится, ссылка на избранное
 * протухнет. Slug генерируется однажды при первой сборке публикации и дальше
 * не меняется, поэтому цена признана приемлемой.
 *
 * Привязано к `identityId`, а не к организации: избранное принадлежит человеку,
 * а не компании (тот же принцип, что `publisherScope.marketplace_account`).
 */
@Schema({ collection: 'marketplace_favorites', timestamps: { createdAt: 'createdAt', updatedAt: false } })
export class FavoriteDocument extends Document {
  declare _id: Types.ObjectId;

  @Prop({ required: true, type: Types.ObjectId })
  identityId!: Types.ObjectId;

  @Prop({ required: true, enum: ['development', 'listing'] })
  targetType!: FavoriteTargetType;

  @Prop({ required: true })
  slug!: string;

  declare createdAt: Date;
}

export const FavoriteSchema = SchemaFactory.createForClass(FavoriteDocument);

/**
 * Уникальность на уровне базы, а не «проверим перед вставкой»: два одновременных
 * нажатия на сердечко не должны создавать два одинаковых избранных. Сервис
 * ловит 11000 и трактует его как «уже в избранном», то есть операция
 * идемпотентна по построению.
 */
FavoriteSchema.index({ identityId: 1, targetType: 1, slug: 1 }, { unique: true });

/** Список избранного читается всегда по одному владельцу и сортируется по дате. */
FavoriteSchema.index({ identityId: 1, createdAt: -1 });
