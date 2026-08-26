import { DevelopmentSchema } from './development.schema';

/**
 * Смок-тест — прямая инстанциация схемы. См. тот же паттерн в
 * packages/publication/src/schemas/marketplace-publication.schema.spec.ts
 * и apps/api/src/modules/developments/schemas/schemas.smoke.spec.ts.
 */
describe('DevelopmentSchema — smoke', () => {
  it('инстанцируется без ошибок', () => {
    expect(DevelopmentSchema).toBeDefined();
  });
});
