import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ListUnitsQueryDto } from './list-units-query.dto';

describe('ListUnitsQueryDto', () => {
  it('организация НЕ входит в допустимые query-поля DTO — forbidNonWhitelisted отклоняет organizationId', async () => {
    // ValidatorOptions {whitelist, forbidNonWhitelisted} — ровно то, что
    // глобальный ValidationPipe (apps/api/src/main.api.ts) передаёт в
    // validate() под капотом. plainToInstance сам по себе НЕ отбрасывает
    // лишние поля (это делает validate({whitelist:true}) на следующем шаге,
    // а forbidNonWhitelisted превращает лишнее поле в ошибку, не молча
    // вырезает) — реальная защита от organizationId работает здесь, а не
    // на уровне class-transformer.
    const instance = plainToInstance(ListUnitsQueryDto, { kind: 'apartment', organizationId: 'attacker-org' });
    const errors = await validate(instance, { whitelist: true, forbidNonWhitelisted: true });

    const organizationIdError = errors.find((e) => e.property === 'organizationId');
    expect(organizationIdError).toBeDefined();
    expect(organizationIdError?.constraints).toHaveProperty('whitelistValidation');
  });

  it('kind принимает только допустимые значения', async () => {
    const invalid = plainToInstance(ListUnitsQueryDto, { kind: 'not-a-real-kind' });
    const errors = await validate(invalid);
    expect(errors.some((e) => e.property === 'kind')).toBe(true);

    const valid = plainToInstance(ListUnitsQueryDto, { kind: 'parking' });
    const validErrors = await validate(valid);
    expect(validErrors.some((e) => e.property === 'kind')).toBe(false);
  });

  it('status принимает только допустимые значения', async () => {
    const invalid = plainToInstance(ListUnitsQueryDto, { status: 'not-a-real-status' });
    const errors = await validate(invalid);
    expect(errors.some((e) => e.property === 'status')).toBe(true);
  });

  it('limit по умолчанию 100, если не передан', () => {
    const instance = plainToInstance(ListUnitsQueryDto, {});
    expect(instance.limit).toBe(100);
  });

  it('limit>500 отклоняется валидацией', async () => {
    const instance = plainToInstance(ListUnitsQueryDto, { limit: '501' });
    const errors = await validate(instance);
    const limitError = errors.find((e) => e.property === 'limit');
    expect(limitError).toBeDefined();
    expect(limitError?.constraints).toHaveProperty('max');
  });

  it('limit=500 проходит валидацию (граница включительно)', async () => {
    const instance = plainToInstance(ListUnitsQueryDto, { limit: '500' });
    const errors = await validate(instance);
    expect(errors.some((e) => e.property === 'limit')).toBe(false);
  });

  it('limit меньше 1 отклоняется валидацией', async () => {
    const instance = plainToInstance(ListUnitsQueryDto, { limit: '0' });
    const errors = await validate(instance);
    const limitError = errors.find((e) => e.property === 'limit');
    expect(limitError).toBeDefined();
    expect(limitError?.constraints).toHaveProperty('min');
  });
});
