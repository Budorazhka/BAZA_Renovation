import { BuildingSchema } from './building.schema';
import { SectionSchema } from './section.schema';
import { FloorSchema } from './floor.schema';
import { FloorPlanSchema } from './floor-plan.schema';
import { UnitSchema } from './unit.schema';
import { DevelopmentSchema } from './development.schema';

describe('@baza/development schemas — smoke', () => {
  it('DevelopmentSchema инстанцируется без ошибок', () => {
    expect(DevelopmentSchema).toBeDefined();
  });

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
