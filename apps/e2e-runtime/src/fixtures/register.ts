import { expect, type APIRequestContext } from '@playwright/test';
import { apiUrl } from './env';

export interface RegisterBody {
  identityId?: string;
  message?: string;
}

/**
 * Регистрация identity через настоящий HTTP с ожиданием лимита.
 *
 * `POST /auth/register` ограничен пятью запросами в минуту на IP, а в CI весь
 * набор приходит с одного адреса: смоук, засев каталога, засев объявления для
 * раскрытия контакта, мастер публикации и съёмка экранов делят один бюджет.
 * Копий этого рецепта было четыре, ожидание лимита — ровно в одной, и потому
 * 429 регулярно получал не тот сценарий, который перебрал бюджет, а следующий
 * за ним. Дважды это роняло зелёный гейт и один раз оставило съёмку кабинета
 * без сессии.
 *
 * Отсюда единственная точка регистрации: гонка за общий лимит — нормальный ход
 * событий в CI, и ждать окно должен каждый, а не один.
 */
export async function registerIdentity(
  request: APIRequestContext,
  login: string,
  options: { password: string; origin?: string },
): Promise<{ status: number; body: RegisterBody }> {
  const headers = options.origin ? { Origin: options.origin } : undefined;

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const response = await request.post(apiUrl('/auth/register'), {
      ...(headers ? { headers } : {}),
      data: { login, password: options.password },
    });
    if (response.status() !== 429) {
      return { status: response.status(), body: await response.json().catch(() => undefined) };
    }
    // Окно лимита — 60 секунд; ждём заметную его часть, а не сотни миллисекунд.
    await new Promise((resolve) => setTimeout(resolve, 20_000));
  }

  throw new Error(`register ${login}: лимит 429 не отпустил за четыре попытки`);
}

/** То же, но с проверкой успеха: для засева, где регистрация — не предмет теста. */
export async function registerIdentityOrFail(
  request: APIRequestContext,
  login: string,
  options: { password: string; origin?: string },
): Promise<void> {
  const { status, body } = await registerIdentity(request, login, options);
  expect(status, `register failed: ${JSON.stringify(body)}`).toBe(201);
}
