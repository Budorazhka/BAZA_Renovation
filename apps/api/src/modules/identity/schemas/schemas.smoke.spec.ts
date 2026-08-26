import { IdentitySchema } from './identity.schema';
import { SessionSchema } from './session.schema';
import { ProductAccessSchema } from './product-access.schema';

/**
 * identity-модуль не имел ни одного теста до этого прохода (существовал
 * с C-этапа без покрытия) — закрывается полностью здесь, не только для
 * новой ProductAccessSchema, тем же паттерном, что developments/media/
 * publication/crm/admin модулей.
 */
describe('identity module schemas — smoke', () => {
  it('IdentitySchema инстанцируется без ошибок', () => {
    expect(IdentitySchema).toBeDefined();
  });

  it('SessionSchema инстанцируется без ошибок', () => {
    expect(SessionSchema).toBeDefined();
  });

  it('ProductAccessSchema инстанцируется без ошибок', () => {
    expect(ProductAccessSchema).toBeDefined();
  });
});
