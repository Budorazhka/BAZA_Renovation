import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { RevealContactDto, toUtmRecord, UtmDto } from './reveal-contact.dto';

describe('RevealContactDto.utm', () => {
  // Те же опции, что глобальный ValidationPipe (main.api.ts) передаёт в
  // validate() под капотом — реальная защита работает здесь, не на уровне
  // одного class-transformer (тот же принцип, что list-units-query.dto.spec.ts).
  const options = { whitelist: true, forbidNonWhitelisted: true };

  it('произвольный (не utm_*) вложенный ключ отклоняется как whitelist-нарушение, не сохраняется молча', async () => {
    const instance = plainToInstance(RevealContactDto, {
      requesterPhone: '+995500000001',
      utm: { utm_source: 'google', attacker_payload: '<script>alert(1)</script>' },
    });

    const errors = await validate(instance, options);

    const utmError = errors.find((e) => e.property === 'utm');
    expect(utmError).toBeDefined();
    const nestedError = utmError?.children?.find((e) => e.property === 'attacker_payload');
    expect(nestedError?.constraints).toHaveProperty('whitelistValidation');
  });

  it('пять стандартных utm_* ключей проходят валидацию', async () => {
    const instance = plainToInstance(RevealContactDto, {
      requesterPhone: '+995500000001',
      utm: {
        utm_source: 'google',
        utm_medium: 'cpc',
        utm_campaign: 'batumi-summer',
        utm_term: 'apartment',
        utm_content: 'ad-1',
      },
    });

    const errors = await validate(instance, options);

    expect(errors).toHaveLength(0);
  });

  it('слишком длинное значение utm_source отклоняется', async () => {
    const instance = plainToInstance(RevealContactDto, {
      requesterPhone: '+995500000001',
      utm: { utm_source: 'a'.repeat(201) },
    });

    const errors = await validate(instance, options);

    const utmError = errors.find((e) => e.property === 'utm');
    const nestedError = utmError?.children?.find((e) => e.property === 'utm_source');
    expect(nestedError?.constraints).toHaveProperty('isLength');
  });

  it('без utm вообще — валидация проходит (поле опционально)', async () => {
    const instance = plainToInstance(RevealContactDto, { requesterPhone: '+995500000001' });

    const errors = await validate(instance, options);

    expect(errors).toHaveLength(0);
  });
});

describe('toUtmRecord', () => {
  it('undefined остаётся undefined', () => {
    expect(toUtmRecord(undefined)).toBeUndefined();
  });

  it('пустой UtmDto (все поля undefined) конвертируется в undefined, не {}', () => {
    const empty = plainToInstance(UtmDto, {});
    expect(toUtmRecord(empty)).toBeUndefined();
  });

  it('заполненные поля конвертируются в плоский Record, незаполненные отбрасываются', () => {
    const utm = plainToInstance(UtmDto, { utm_source: 'google', utm_medium: 'cpc' });

    expect(toUtmRecord(utm)).toEqual({ utm_source: 'google', utm_medium: 'cpc' });
  });
});
