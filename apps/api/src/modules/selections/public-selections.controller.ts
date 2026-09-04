import { Controller, Get, Param } from '@nestjs/common';
import { SelectionsService } from './selections.service';

/**
 * ПУБЛИЧНЫЙ (без TenantGuard/PermissionGuard — тот же принцип, что
 * PublicListingsController/PublicComplaintController) доступ клиента к
 * подборке по `publicToken` из ссылки `/selection/:token`.
 *
 * Единственный публичный эндпоинт — GET. `setReaction`/`updateItemNote` в
 * useDevSelectionsStore НЕ получают публичного аналога: разобрано явно —
 * в текущем UI (ClientSelectionPage.tsx) клиент не вызывает ни один из этих
 * двух методов, они используются ТОЛЬКО из аутентифицированной
 * SelectionsDevPage.tsx (агент сам проставляет реакцию/заметку со слов
 * клиента по телефону/чату). Публичная мутация без какой-либо
 * аутентификации по одному лишь предъявлению token — лишняя открытая
 * поверхность без потребителя; добавление осталось бы мёртвым кодом.
 * Если в будущем на ClientSelectionPage.tsx появятся кнопки лайка/вопроса —
 * это отдельная фича с собственным review той же публичной мутации.
 *
 * Rate-limit сознательно НЕ применён (в отличие от reveal-contact/
 * complaints): `publicToken` — 256 бит случайности (SelectionsService.
 * generatePublicToken), а не что-то из категории "мало вариантов, можно
 * перебрать" (email/phone на reveal-contact, форма на complaints) — угадать
 * его тем же способом, что и предсказать сессионный cookie, вычислительно
 * невозможно, а сам просмотр не раскрывает ничего кроме этой одной
 * подборки, whitelisted полей (см. toPublicDevSelection).
 */
@Controller('public/selections')
export class PublicSelectionsController {
  constructor(private readonly selectionsService: SelectionsService) {}

  @Get(':token')
  async getByToken(@Param('token') token: string) {
    return this.selectionsService.getPublicSelectionAndMarkViewed(token);
  }
}
