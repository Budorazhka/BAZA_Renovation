import { BuildingSchema } from './building.schema';
import { SectionSchema } from './section.schema';
import { FloorSchema } from './floor.schema';
import { FloorPlanSchema } from './floor-plan.schema';
import { UnitSchema } from './unit.schema';

/**
 * Smoke-тест: сам факт импорта этого файла загружает и инстанцирует пять
 * оставшихся в apps/api Mongoose-схем модуля через
 * SchemaFactory.createForClass — не бизнес-логика, а прямая проверка
 * decorator metadata reflection, которая НЕ ловится typecheck и НЕ
 * проверяется build (tsc не выполняет decorator runtime-код). Найдено
 * реальным прецедентом: MediaAssetSchema имела баг именно такого рода
 * (union-тип, импортированный извне файла схемы, ломал @Prop() reflection),
 * не пойманный ни одной из этих двух проверок — только первым тестом,
 * который реально загрузил схему целиком.
 *
 * DevelopmentSchema мигрировала в @baza/development (D-03, worker-доступ) —
 * её собственный смок-тест теперь в packages/development/src/schemas/
 * development.schema.spec.ts, не здесь.
 */
describe('developments module schemas — smoke', () => {
  it('BuildingSchema инстанцируется без ошибок', () => {
    expect(BuildingSchema).toBeDefined();
  });

  it('SectionSchema инстанцируется без ошибок', () => {
    expect(SectionSchema).toBeDefined();
  });

  it('FloorSchema инстанцируется без ошибок', () => {
    expect(FloorSchema).toBeDefined();
  });

  it('FloorPlanSchema инстанцируется без ошибок', () => {
    expect(FloorPlanSchema).toBeDefined();
  });

  it('UnitSchema инстанцируется без ошибок', () => {
    expect(UnitSchema).toBeDefined();
  });
});
