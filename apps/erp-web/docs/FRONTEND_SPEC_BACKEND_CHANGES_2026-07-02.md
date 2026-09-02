# Спека для фронта: Все изменения бэкенда

Дата: 2026-07-02
Коммиты: `a960d59`, `0922d52`, `3500d72`, `63ca843`

---

## 1. Досье клиента — новые секции

**Файл:** `src/types/clientDossier.ts`

`IClientDossier` получил 16 новых опциональных объектов. Существующие поля (`summary`, `clientIntent`, `budget`, `location`, `readiness`, `characteristics`, `risks`, `aiIntentions`, `suggestedReplies`, `clientParams`) **без изменений**.

### Новые типы для импорта

```typescript
import {
  DossierProfile,
  DossierGoals,
  DossierGeography,
  DossierFinance,
  DossierPropertyProfile,
  DossierObjections,
  DossierDecisionMakers,
  DossierCommunication,
  DossierBehavior,
  DossierInvestmentProfile,
  DossierMatchingProfile,
  DossierScoring,
  DossierTrust,
  DossierLegalReadiness,
  DossierRecommendations,
  DossierDataQuality,
} from 'shared-types-path/types/clientDossier';
```

### Новые поля на `IClientDossier`

| Поле | Тип | Описание |
|------|-----|----------|
| `profile?` | `DossierProfile` | Контакты, язык, источник лида |
| `goals?` | `DossierGoals` | Тип цели, описание, триггеры |
| `geography?` | `DossierGeography` | Город, район, микролокация, нежелательные зоны |
| `finance?` | `DossierFinance` | Бюджеты, взнос, рассрочка, сроки |
| `propertyProfile?` | `DossierPropertyProfile` | Тип объекта, комнаты, вид, состояние |
| `objections?` | `DossierObjections` | Главное препятствие, страхи |
| `decisionMakers?` | `DossierDecisionMakers` | Кто решает, платит, влияет |
| `communication?` | `DossierCommunication` | Канал, время, стиль, тон |
| `behavior?` | `DossierBehavior` | Поведение vs заявленное |
| `investmentProfile?` | `DossierInvestmentProfile` | Тип инвестора, горизонт, риск |
| `matchingProfile?` | `DossierMatchingProfile` | Жёсткие/мягкие критерии, запреты |
| `scoring?` | `DossierScoring` | Температура 0-100, вероятность сделки |
| `trust?` | `DossierTrust` | Доверие к менеджеру/платформе/стране |
| `legalReadiness?` | `DossierLegalReadiness` | Готовность к сделке, документы |
| `recommendations?` | `DossierRecommendations` | Что предлагать/не предлагать |
| `dataQuality?` | `DossierDataQuality` | Уверенность AI, что уточнить |

### Примеры ключевых типов

```typescript
interface DossierScoring {
  temperature?: number;      // 0-100
  dealProbability?: number;  // 0-100
  leadQuality?: number;      // 0-100
  investmentMaturity?: string;
  competitorChurnRisk?: number;
}

interface DossierGoals {
  primaryGoal?: string;
  goalType?: 'life' | 'investment' | 'rent' | 'relocation' | 'capital_preservation' | 'business';
  goalDetail?: string;
  emotionalTriggers?: string[];
}

interface DossierRecommendations {
  whatToOffer?: string[];
  whatNotToOffer?: string[];
  top3Objects?: string;
  managerTask?: string;
}
```

---

## 2. Заметки лида — теперь Markdown

**Файл:** `src/services/CrmAiService.ts`

Поле `notes` на лиде теперь содержит **Markdown** вместо plain-text.

### Было

```
summary
Намерение: инвестор
Бюджет: $100k
Параметры клиента:
имя: Иван
```

### Стало

```markdown
Клиент инвестор, интересуется Батуми...

## Данные лида
- **Имя:** Иван
- **Телефон:** +995555123456

## Цель и мотивация
- **Намерение:** инвестировать в курортную недвижимость
- **Тип цели:** investment

## Финансы
- **Бюджет:** $80-120k
- **Рассрочка:** нужна

## Скоринги
- **Температура:** 65/100
- **Вероятность сделки:** 72%

## Рекомендации AI
- **Предлагать:**
  - готовые апартаменты у моря
- **Задача менеджеру:** отправить 3 варианта
```

### Структура секций (порядок)

1. AI-резюме (summary — без заголовка)
2. `## Данные лида`
3. `## Цель и мотивация`
4. `## География`
5. `## Финансы`
6. `## Инвестиционный профиль`
7. `## Желаемый объект`
8. `## Возражения`
9. `## Лица решения`
10. `## Коммуникация`
11. `## Скоринги`
12. `## Доверие`
13. `## Юридическая готовность`
14. `## Рекомендации AI`
15. `## Профиль подбора`
16. `## Качество данных`
17. `## Подтверждённые факты`
18. `## Риски и возражения`
19. `## Следующие шаги`
20. `## Отказ`
21. `## Параметры клиента`
22. `## Понравившийся объект`
23. `## Телефон из чата`

### Правила форматирования

- Заголовки: `## Название секции`
- Ключ-значение: `- **Ключ:** Значение`
- Списки: `- элемент` (с отступом `  -` для вложенных)
- Каждая секция через пустую строку

### Что нужно на фронте

1. **Рендеринг Markdown** — добавить Markdown-рендерер в карточку лида (react-markdown или аналог)
2. **Парсинг секций** (если не используешь рендерер) — парсить `## заголовки` и `- **ключ:** значение`

---

## 3. WebSocket события

### `crm:action_required` — изменённые action'ы

| Action | Статус | Описание |
|--------|--------|----------|
| `update_notes` | **УДАЛЁН** | Заметки теперь обновляются только бэкендом из досье |
| `create_lead` | **УДАЛЁН** | Создание лида — backend-only |
| `move_stage` | ✅ Без изменений | Фронт получает событие для UI-обновления |
| `add_history` | ✅ Без изменений | |
| `add_comment` | ✅ Без изменений | |
| `already_linked` | ✅ Без изменений | |
| `update_lead` | ✅ Без изменений | |

**Важно:** Если фронт обрабатывал `update_notes` или `create_lead` — удалить эти обработчики.

### `crm:context_update` — без изменений

### `dialog:dossier_updated` — добавлены новые поля

Событие теперь содержит полный dossier со всеми 16 новыми секциями. `stripBackendOnlyDossier` убирает только `clientParams`, остальное — видно на фронте.

---

## 4. CRM API — что изменилось

### Создание лида (`POST /crm/leads`)

- Этап по умолчанию: `needs_analysis` (бэкенд задаёт явно)
- После создания автоматически: `addHistory` + `createStageComment`
- **Без изменений для фронта** — фронт не создаёт лиды

### Смена этапа (`PATCH /crm/leads/{id}/stage`)

При смене этапа бэкенд теперь автоматически:
1. `moveStage()` — меняет этап
2. `createStageComment()` — создаёт комментарий на новом этапе
3. `addHistory()` — записывает в историю: `{from} → {to}: {comment}`

**Для фронта:** ничего менять не нужно, но теперь при смене этапа AI-ом в CRM будут появляться комментарии и история.

### Запись контакта (`POST /crm/leads/{id}/contact-action`)

При каждом входящем сообщении бэкенд вызывает `recordContact(leadId, 'chat')`.

**Для фронта:** ничего менять не нужно.

---

## 5. Что нужно сделать на фронте

### Приоритет 1 — Обязательно

- [ ] Обновить TypeScript-тип `IClientDossier` (скопировать из бэкенда)
- [ ] Удалить обработчики `update_notes` и `create_lead` из `crm:action_required`
- [ ] Добавить Markdown-рендерер для `notes` в карточке лида

### Приоритет 2 — UI досье

- [ ] Показать `scoring.temperature` и `scoring.dealProbability` (полоски 0-100)
- [ ] Показать `objections.mainObstacle` и `objections.howToRemove`
- [ ] Показать `recommendations.whatToOffer` / `whatNotToOffer`
- [ ] Показать `goals.goalType` (бейдж) и `goals.goalDetail`
- [ ] Показать `finance` (бюджет, сроки, рассрочка)

### Приоритет 3 — Остальное

- [ ] `geography` — район, микролокация, нежелательные зоны
- [ ] `propertyProfile` — тип, площадь, вид, НЕ предлагать
- [ ] `investmentProfile` — тип инвестора, горизонт, риск
- [ ] `trust` — доверие к менеджеру/платформе/стране
- [ ] `legalReadiness` — готовность к сделке, документы
- [ ] `dataQuality` — уверенность AI, что уточнить
- [ ] `decisionMakers` — кто решает, платит, влияет
- [ ] `communication` — канал, время, стиль

---

## 6. Сводка изменённых файлов

| Файл | Что изменилось |
|------|----------------|
| `src/types/clientDossier.ts` | 16 новых интерфейсов + IClientDossier расширен |
| `src/services/GeminiService.ts` | Промпт досье переписан (22 секции TZ) |
| `src/models/Dialog.ts` | 16 новых Schema.Types.Mixed полей |
| `src/types/aiSettings.ts` | `buildClientDossierPromptBlock` — новые секции |
| `src/services/CrmAiService.ts` | Markdown-заметки, пересборка из досье, addHistory/createStageComment на создании лида |
| `src/services/AiReplyService.ts` | Удалён `update_notes`, move_stage с addHistory+createStageComment |
| `src/services/UrgentAlertService.ts` | Форматирование досье — новые секции |
| `src/services/WhatsAppService.ts` | Добавлен recordContact |
| `src/services/TelegramService.ts` | Добавлен recordContact |
| `src/services/TelegramUserService.ts` | Добавлен recordContact |
