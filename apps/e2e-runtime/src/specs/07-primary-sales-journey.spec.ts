import { test, expect } from '../fixtures/test';
import { apiUrl, env } from '../fixtures/env';
import { erpApiClient, marketplaceApiClient } from '../fixtures/api-clients';
import { uniqueLogin, STRONG_TEST_PASSWORD, uniquePhone } from '../fixtures/test-data';

/**
 * P1-05: Полный пользовательский сценарий продаж первички
 * («ЖК -> шахматка -> пакетная цена -> публикация -> витрина -> лид -> бронь в ERP -> сделка в CRM»)
 */
test.describe('P1-05: primary sales journey', () => {
  test.describe.configure({ timeout: 120_000 });

  test('executes complete primary sales lifecycle across ERP, API, worker projection, and marketplace', async ({
    request,
  }) => {
    const erp = erpApiClient(request);
    const mkt = marketplaceApiClient(request);

    // 1. Регистрация девелопера и организации
    const devLogin = uniqueLogin('dev_owner');
    const registerRes = await erp.register(devLogin, STRONG_TEST_PASSWORD);
    expect(registerRes.status).toBe(201);

    const orgRes = await erp.registerOrganization({
      login: devLogin,
      password: STRONG_TEST_PASSWORD,
      name: 'Batumi Prime Development',
      type: 'developer',
    });
    expect(orgRes.status).toBe(201);
    const orgId = (orgRes.body as any).organizationId;
    expect(orgId).toBeDefined();

    // 2. Создание ЖК
    const devRes = await erp.createDevelopment({
      name: 'Batumi Sunset Towers',
      location: {
        country: 'Georgia',
        city: 'Batumi',
        address: 'Khimshiashvili St, 25',
        geo: { type: 'Point', coordinates: [41.64, 41.64] },
      },
      contact: {
        phone: '+995555112233',
        whatsapp: '+995555112233',
        telegram: '@batumi_sunset',
      },
      classType: 'comfort',
    });
    expect(devRes.status).toBe(201);
    // Развития/корпуса/юниты отдаются как есть (Mongoose-документ), без DTO
    // с явным полем id — конвенция всего этого модуля: docs/api/conventions.md
    // "внутренние связи между сущностями — неизменяемый _id". id есть только
    // там, где заведён явный DTO-маппер (leads, bookings, lms) — здесь его нет.
    const devId = (devRes.body as any)._id;
    expect(devId).toBeDefined();

    // 3. Создание корпуса
    const bldRes = await erp.createBuilding(devId, {
      name: 'Block A',
      floorsCount: 5,
    });
    expect(bldRes.status).toBe(201);
    const bldId = (bldRes.body as any)._id;
    expect(bldId).toBeDefined();

    // 4. Генерация шахматки (5 этажей, по 4 квартиры = 20 квартир)
    const chessRes = await erp.generateChessboard(bldId, {
      fromFloor: 1,
      toFloor: 5,
      unitsPerFloor: 4,
      numberingScheme: 'floor_prefix',
      defaultKind: 'apartment',
      rooms: 2,
      defaultArea: 50,
      defaultPrice: { amountMinorUnits: 5000000, currency: 'USD' },
    });
    // generateChessboard — @HttpCode(201) (создаёт юниты), не 200.
    expect(chessRes.status).toBe(201);
    expect((chessRes.body as any).generatedUnits).toBe(20);

    // 5. Пакетное обновление цен: наценка 10%
    const batchRes = await erp.batchUpdatePrices(devId, {
      buildingId: bldId,
      operationType: 'percentage',
      value: 10,
      reason: 'Предстартовое повышение цен',
    });
    expect(batchRes.status).toBe(200);
    expect((batchRes.body as any).updatedCount).toBe(20);

    // Проверяем список юнитов в ERP
    const unitsRes = await erp.listUnits(bldId);
    expect(unitsRes.status).toBe(200);
    const units = (unitsRes.body as any).items || (unitsRes.body as any);
    expect(units.length).toBe(20);
    expect(units[0].price.amountMinorUnits).toBe(5500000);
    const chosenUnit = units[0];

    // 6. Публикация ЖК на витрину
    const pubRes = await erp.publishDevelopment(devId);
    expect(pubRes.status).toBe(202);

    // Ожидаем обработки воркером публикации
    let devSlug: string | undefined;
    for (let attempt = 0; attempt < 30; attempt++) {
      const catRes = await request.get(apiUrl('/public/developments?limit=50'), {
        headers: { Origin: env.marketplaceOrigin },
      });
      if (catRes.status() === 200) {
        const catBody = await catRes.json();
        // public.controller.ts::toPublicCard разворачивает denormalizedFields
        // прямо в тело карточки (name/priceFrom/slug — верхний уровень), не
        // передаёт их как вложенный объект.
        const found = (catBody.items || []).find((item: any) => item.name === 'Batumi Sunset Towers');
        if (found) {
          devSlug = found.slug;
          expect(found.priceFrom?.amountMinorUnits).toBe(5500000);
          break;
        }
      }
      await new Promise((r) => setTimeout(r, 500));
    }
    expect(devSlug).toBeDefined();

    // 7. Покупатель на витрине оставляет заявку (reveal-contact)
    const revealRes = await request.post(apiUrl(`/public/developments/${devSlug}/reveal-contact`), {
      headers: { Origin: env.marketplaceOrigin },
      data: {
        requesterName: 'Иван Покупатель',
        requesterPhone: uniquePhone(),
        // UtmDto whitelist'ит только стандартные utm_* ключи (см.
        // crm/dto/reveal-contact.dto.ts) — 'source' там 400.
        utm: { utm_source: 'e2e-test' },
      },
    });
    expect(revealRes.status()).toBe(200);
    const revealBody = await revealRes.json();
    expect(revealBody.phone).toBe('+995555112233');
    const leadId = revealBody.leadId;
    expect(leadId).toBeDefined();

    // 8. Менеджер в ERP видит входящий лид в CRM
    const leadsRes = await erp.listLeads();
    expect(leadsRes.status).toBe(200);
    const leads = (leadsRes.body as any).items || [];
    const matchedLead = leads.find((l: any) => l.id === leadId);
    expect(matchedLead).toBeDefined();

    // 9. Менеджер бронирует квартиру под этот лид
    const bookRes = await erp.createBooking({
      unitId: chosenUnit.id || chosenUnit._id,
      leadId,
      startsAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString(),
    });
    expect(bookRes.status).toBe(201);
    const bookingId = (bookRes.body as any).id || (bookRes.body as any)._id;
    expect(bookingId).toBeDefined();

    // 10. Перевод брони в сделку
    const dealRes = await erp.convertBookingToDeal(bookingId, {
      title: 'Сделка по квартире 101 — Sunset Towers',
      expectedCommission: { amountMinorUnits: 165000, currency: 'USD' },
    });
    // convertToDeal — @HttpCode(201) (создаёт Deal), матчит OpenAPI.
    expect(dealRes.status).toBe(201);
    expect((dealRes.body as any).deal?.id || (dealRes.body as any).deal?._id || (dealRes.body as any).dealId).toBeDefined();
  });
});
