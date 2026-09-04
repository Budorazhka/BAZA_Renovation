import { randomUUID } from 'node:crypto';
import { expect, request as apiRequest } from '@playwright/test';
import { apiUrl } from './env';
import { registerIdentityOrFail } from './register';
import {
  STRONG_TEST_PASSWORD,
  uniqueAddress,
  uniqueDevelopmentName,
  uniqueLogin,
  uniquePhone,
} from './test-data';

/**
 * Засев публичного каталога реальными данными.
 *
 * Зачем. Runtime-стек поднимается с чистой базой, и проверки каталога шли по
 * пустой выдаче: сценарий требовал счётчик, счётчика на пустом каталоге нет.
 * Первым побуждением было ослабить проверку и принять пустое состояние — но так
 * гейт подтверждал бы, что страница умеет показывать «пусто», а не что каталог
 * работает. Правильный ход — дать окружению данные.
 *
 * **Ровно одна регистрация на весь засев.** `POST /auth/register` ограничен
 * пятью запросами в минуту на IP, а в CI все сценарии приходят с одного адреса.
 * Первая версия этой фикстуры заводила две организации — и выела бюджет,
 * из-за чего 429 получили ЧУЖИЕ сценарии (логаут и раскрытие контакта), которые
 * до этого проходили. Отсюда правило: засев не должен стоить больше одной
 * регистрации. Ожидание лимита живёт в `registerIdentityOrFail`.
 */

/**
 * Один опубликованный ЖК в каталоге. Возвращает slug публикации.
 *
 * Организация — `developer`: ЖК создаёт и публикует только застройщик
 * (`DevelopmentsService.requireDeveloperOrganization`), агентство получит отказ.
 *
 * Ожидание статуса `published` обязательно: проекцию собирает воркер
 * асинхронно, без ожидания сценарий пошёл бы искать в каталоге объект, которого
 * там ещё нет.
 */
export async function seedPublishedDevelopment(): Promise<string> {
  // Собственный HTTP-контекст: сессия живёт в cookie, и засев не должен ни
  // перебивать чужую сессию, ни зависеть от неё.
  const request = await apiRequest.newContext();
  try {
    const login = uniqueLogin('catalogue-developer');
    await registerIdentityOrFail(request, login, { password: STRONG_TEST_PASSWORD });

    const onboarding = await request.post(apiUrl('/organizations/register'), {
      data: { login, password: STRONG_TEST_PASSWORD, type: 'developer', name: `E2E Developer ${login}` },
    });
    expect(onboarding.status(), `org onboarding failed: ${await onboarding.text()}`).toBe(201);

    const developmentResponse = await request.post(apiUrl('/developments'), {
      headers: { 'Idempotency-Key': randomUUID() },
      data: {
        name: uniqueDevelopmentName(),
        location: {
          country: 'Georgia',
          city: 'Batumi',
          address: uniqueAddress(),
          geo: { type: 'Point', coordinates: [41.6412, 41.6501] },
        },
        contact: { phone: uniquePhone() },
        classType: 'comfort',
        // Именно ISO-дата: поле объявлено как @IsDateString(). Первая версия
        // передавала сюда «2027-Q4» — квартал из UI-формата — и получала 400.
        completionDate: '2027-12-01T00:00:00.000Z',
        description: 'Объект, засеянный сквозным гейтом для проверки каталога.',
      },
    });
    expect(developmentResponse.status(), `development create failed: ${await developmentResponse.text()}`).toBe(201);
    const development = await developmentResponse.json();

    const publishResponse = await request.post(apiUrl(`/developments/${development._id}/publish`), {
      headers: { 'Idempotency-Key': `e2e-catalogue-dev-${login}` },
    });
    expect(publishResponse.status(), `development publish failed: ${await publishResponse.text()}`).toBe(202);

    await expect
      .poll(
        async () => {
          const response = await request.get(apiUrl(`/developments/${development._id}/publication-status`));
          if (response.status() !== 200) return null;
          return (await response.json()).status;
        },
        { timeout: 60_000, intervals: [500, 1_000, 2_000] },
      )
      .toBe('published');

    const status = await (
      await request.get(apiUrl(`/developments/${development._id}/publication-status`))
    ).json();
    return status.slug as string;
  } finally {
    await request.dispose();
  }
}
