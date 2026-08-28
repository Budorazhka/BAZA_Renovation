# Public Listing Lead Flow & Contact Reveal (Secondary & Rent)

**Дата:** 29.08.2026  
**Вертикаль:** MKT-002 / LEAD-001 (Marketplace Public Secondary & Rent Leads)  
**Ветка:** `codex/public-listing-leads`

---

## 1. Обзор архитектуры

Публичный lead flow для объявлений вторичной недвижимости и аренды реализует безопасное и транзакционное раскрытие контактных данных представителя объекта с автоматическим созданием лида в CRM организации-владельца.

### Ключевые требования и инварианты:
1. **Гостевой доступ без утечки данных (Non-Disclosure):**
   - Эндпоинт `POST /api/v1/public/listings/:slug/reveal-contact` общедоступен и не требует сессии.
   - Ответ содержит строго публичные поля: `{ phone, leadId }`.
   - Внутренние поля (`organizationId`, `publisherScope`, `identityId`, дубликаты, заметки) никогда не возвращаются и не раскрываются.
   - Для несуществующего slug, неопубликованной карточки, slug другого типа (например, ЖК) или отсутствующего канонического объекта возвращается единый код `404 Not Found`.

2. **Защита от злоупотреблений и сбора контактов (Rate Limiting):**
   - Эндпоинт защищён `@UseGuards(ThrottlerGuard)` с лимитом **5 запросов за 60 секунд на IP**.
   - При превышении возвращается `429 Too Many Requests`.

3. **Транзакционность и CRM-инварианты (MongoDB ReplicaSet Sessions):**
   - Резолвинг `MarketplacePublication(slug)` → `Listing(sourceId)` → `PropertyAsset(propertyAssetId)` → `organizationId`.
   - Внутри единой транзакции (`runInTransaction`):
     1. **Contact De-duplication:** Поиск существующего `Contact` по `requesterPhone` в рамках организации. Если найден — переиспользуется; если нет — создаётся новый с ролью `buyer`.
     2. **Lead Creation:** Создаётся новый `Lead` со ссылкой на `organizationId`, `contactId`, `stage: 'new'` и `source: { route: '/listings/' + slug, publicationId, utm, referrer }`.
     3. **LeadEvent Creation:** Создаётся запись в append-only истории `LeadEvent` (`stage: 'new'`, `changedBy: { type: 'system' }`).
     4. **Audit Trail:** Создаётся системная запись в `audit_events` (`actor: { type: 'system' }`, `action: 'lead.create_from_reveal'`, `resource: 'lead'`, `resourceId: lead._id`).

4. **Фронтенд Marketplace Web:**
   - Компонент `ListingContactForm` интегрирован в `ListingDetailPage`.
   - Сбор обязательного номера телефона и опционального имени.
   - Автоматический сбор UTM-меток из `window.location.search` (`utm_source`, `utm_medium`, `utm_campaign` и др.).
   - Блокировка кнопки и защита от двойного клика при отправке.
   - Информативные состояния ошибок (404, 429, валидация, сетевая ошибка с кнопкой «Попробовать снова»).
   - Успешное состояние с отображением прямого номера телефона в виде кликабельной ссылки `tel:`.
   - Полное отсутствие mock-данных и localStorage-фоллбэков.

---

## 2. OpenAPI Спецификация

```yaml
/public/listings/{slug}/reveal-contact:
  post:
    operationId: revealListingContact
    summary: Раскрытие контакта для листинга вторички/аренды
    tags: [public-marketplace]
    security: []
    parameters:
      - name: slug
        in: path
        required: true
        schema: {type: string}
    requestBody:
      required: true
      content:
        application/json:
          schema:
            $ref: '#/components/schemas/RevealContactRequest'
    responses:
      '200':
        description: Контакт раскрыт, Lead создан в организации-владельце листинга
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/RevealContactResponse'
      '400':
        description: VALIDATION_FAILED — requesterPhone обязателен для создания лида
        $ref: '#/components/responses/Error'
      '404':
        description: PUBLICATION_NOT_FOUND
        $ref: '#/components/responses/Error'
      '429':
        description: RATE_LIMITED
        $ref: '#/components/responses/Error'
```

---

## 3. Тестирование

- **Unit Tests (`apps/api`):**
  - `crm.service.spec.ts` — 43 unit-теста (покрывают создание Contact/Lead/LeadEvent/Audit, tenant de-duplication, валидацию телефона, non-disclosure 404 для всех сценариев).
- **Integration Tests (`apps/api`):**
  - `listing-reveal-lead.integration-spec.ts` — 7 интеграционных тестов с реальным HTTP-вызовом Fastify и реальной MongoDB ReplicaSet.
  - `module-boundaries.test.ts` — соблюдение границ модулей.
- **Frontend Tests (`apps/marketplace-web`):**
  - `marketplace-api.test.ts` — проверка вызовов API клиента.
  - `listingDetailLeadForm.test.tsx` — рендеринг формы, валидация, отправка, состояния загрузки, успеха, ошибок 404, 429 и повторной попытки при сбое сети.
