import { ContactSchema } from './contact.schema';
import { LeadSchema } from './lead.schema';
import { LeadEventSchema } from './lead-event.schema';

/**
 * Смок-тест — прямая инстанциация схем. Тот же паттерн, что developments/
 * media/publication/development модулей — decorator metadata reflection
 * не ловится typecheck/build.
 */
describe('crm module schemas — smoke', () => {
  it('ContactSchema инстанцируется без ошибок', () => {
    expect(ContactSchema).toBeDefined();
  });

  it('LeadSchema инстанцируется без ошибок', () => {
    expect(LeadSchema).toBeDefined();
  });

  it('LeadEventSchema инстанцируется без ошибок (дискриминированный union changedBy)', () => {
    expect(LeadEventSchema).toBeDefined();
  });
});
