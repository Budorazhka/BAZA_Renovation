import { PropertyAssetSchema } from './property-asset.schema';
import { ListingSchema } from './listing.schema';
import { DuplicateCandidateSchema } from './duplicate-candidate.schema';
import { ListingRevisionSchema } from './listing-revision.schema';
import { ComplaintSchema } from './complaint.schema';

/**
 * Смок-тест: сам факт импорта этого файла загружает и инстанцирует обе
 * Mongoose-схемы модуля через SchemaFactory.createForClass — не бизнес-
 * логика, прямая проверка decorator metadata reflection (не ловится
 * typecheck/build, см. c10-foundation-release-gate.md для прецедента
 * MediaAssetSchema/GeoPointSchema). PropertyAssetDocument.location.geo
 * использует тот же GeoJSON-паттерн ({type:'Point', coordinates}), уже
 * дважды ловивший этот класс бага в Development/Building/FloorPlan —
 * здесь GeoPointSchema объявлена как explicit `new MongooseSchema(...)`
 * (не inline), тот же фикс, что уже применён там.
 */
describe('property-assets package schemas — smoke', () => {
  it('PropertyAssetSchema инстанцируется без ошибок', () => {
    expect(PropertyAssetSchema).toBeDefined();
  });

  it('ListingSchema инстанцируется без ошибок', () => {
    expect(ListingSchema).toBeDefined();
  });

  it('DuplicateCandidateSchema инстанцируется без ошибок', () => {
    expect(DuplicateCandidateSchema).toBeDefined();
  });

  it('ListingRevisionSchema инстанцируется без ошибок', () => {
    expect(ListingRevisionSchema).toBeDefined();
  });

  it('ComplaintSchema инстанцируется без ошибок', () => {
    expect(ComplaintSchema).toBeDefined();
  });
});
