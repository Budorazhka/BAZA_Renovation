import { test, expect } from '../fixtures/test';
import { registerIdentityOrFail } from '../fixtures/register';
import { env } from '../fixtures/env';
import { uniqueLogin, STRONG_TEST_PASSWORD } from '../fixtures/test-data';

/**
 * Вход через форму и переход в кабинет — то есть ровно то, что делает человек.
 *
 * Почему этого не хватало раньше. Сессию проверял только `04-logout`, но он
 * ходит в API через `marketplaceApiClient`, а тот всегда проставляет `Origin`.
 * Браузер на SAME-ORIGIN GET его не шлёт, а фронт по умолчанию ходит в API
 * через свой же прокси (`VITE_API_BASE_URL=/api/v1`). В итоге `POST
 * /auth/login` проходил и ставил cookie, а следующий `GET /auth/session` падал
 * с AUTH_AUDIENCE_MISMATCH: клиент читал это как «гость», `RequireAuth` уводил
 * на форму входа, и попасть в кабинет было нельзя вообще. Ни один сценарий
 * этого не ловил, потому что ни один не заходил в кабинет браузером.
 *
 * Отсюда форма проверки: не «ответ на login равен 200», а «после входа кабинет
 * открывается и не отдаёт обратно на форму».
 */
test.describe('вход в кабинет через браузер', () => {
  test('после входа кабинет открывается и не возвращает на форму входа', async ({ page, request }) => {
    const login = uniqueLogin('cabinet');
    // Регистрация вне браузера: предмет проверки — вход и сессия, а не форма
    // регистрации, которую уже проходит сценарий мастера публикации.
    await registerIdentityOrFail(request, login, {
      password: STRONG_TEST_PASSWORD,
      origin: env.marketplaceOrigin,
    });

    await page.goto('/auth/login');
    await expect(page.getByTestId('auth-page')).toBeVisible();

    await page.getByTestId('auth-input-login').fill(login);
    await page.getByTestId('auth-input-password').fill(STRONG_TEST_PASSWORD);

    const loginResponsePromise = page.waitForResponse(
      (res) => res.url().includes('/auth/login') && res.request().method() === 'POST',
    );
    await page.getByTestId('auth-submit-btn').click();
    expect((await loginResponsePromise).status()).toBe(200);

    // Вход уводит в кабинет сам: AuthPage редиректит на `next`, по умолчанию
    // это `/account/properties`.
    await expect(page).toHaveURL(/\/account\/properties/);
    await expect(page.getByRole('heading', { name: 'Мои объекты' })).toBeVisible();

    // Главная проверка: сессия переживает НОВУЮ загрузку страницы. Именно здесь
    // ломалось — форма исчезала, а следующий заход в кабинет отдавал на логин.
    await page.goto('/account/properties');
    await expect(page).toHaveURL(/\/account\/properties/);
    await expect(page.getByRole('heading', { name: 'Мои объекты' })).toBeVisible();
    await expect(page.getByTestId('auth-page')).toHaveCount(0);
  });
});
