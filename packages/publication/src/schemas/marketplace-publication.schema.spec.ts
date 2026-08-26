import { MarketplacePublicationSchema } from './marketplace-publication.schema';

/**
 * Смок-тест: прямая инстанциация схемы через SchemaFactory.createForClass
 * (внутри импорта) — не бизнес-логика, а проверка decorator metadata
 * reflection, которая НЕ ловится typecheck/build. Найдено ранее трижды в
 * этой кодовой базе (AuditActorSchema/OwnerScopeSchema, MediaAssetSchema.
 * bucket, GeoPoint/GeoPolygon в developments-модуле) — тот же класс бага
 * (union-тип или GeoJSON `type`-поле, конфликтующее с зарезервированным
 * SchemaTypeOptions.type), написан заранее, не постфактум.
 */
describe('MarketplacePublicationSchema — smoke', () => {
  it('инстанцируется без ошибок', () => {
    expect(MarketplacePublicationSchema).toBeDefined();
  });
});
