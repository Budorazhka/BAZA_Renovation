# Спецификация: CRM-авторизация — фронт → бэк мессенджера

> Дата: 2026-06-17
> Статус: фронт реализован, ждём бэкенд

---

## ИСТОРИЯ ИЗМЕНЕНИЙ

### Версия 1 (было — НЕ ИСПОЛЬЗУЕТСЯ)

Бэкенд мессенджера просил фронт передавать CRM JWT-токен:

```
POST /api/auth/crm-token
Authorization: Bearer {msgr_jwt_token}
{
  "crmToken": "eyJhbGciOiJIUzI1NiIs...",
  "crmUserId": "665f0a1b2c3d4e5f6a7b8c9d",
  "crmUserRole": "agent"
}
```

Проверка статуса:
```
GET /api/auth/crm-status
→ { "success": true, "hasCrmToken": true, "crmUserId": "...", "crmUserRole": "..." }
```

**Почему не работает:**
- CRM JWT протухает через 1 час (TTL)
- Фронт не знает когда протухает — бэкенд молча получает 401
- Пришлось бы делать модалку «Введите пароль заново» — плохой UX
- Фронт хранит пароль в памяти только во время логина — после рефреша страницы пароля нет

### Версия 2 (стало — РЕАЛИЗОВАНО НА ФРОНТЕ)

Фронт передаёт **email и пароль** при каждом логине. Бэкенд мессенджера **сам** логинится в CRM API:

```
POST /api/auth/crm-credentials
Authorization: Bearer {msgr_jwt_token}
{
  "email": "manager@example.com",
  "password": "secret123"
}
```

Проверка статуса:
```
GET /api/auth/crm-status
→ { "success": true, "hasCrmCredentials": true, "crmConnected": true, "crmUserId": "...", "crmUserRole": "...", "crmTokenExpiry": "..." }
```

**Почему работает:**
- Бэкенд хранит email/password и сам управляет CRM-токеном
- При протухании — автоматический refresh через `/auth/refresh`
- Если refresh не помог — повторный логин с сохранёнными данными
- Фронт ничего не делает — никаких модалок, никаких кнопок

---

## ТАБЛИЦА ИЗМЕНЕНИЙ

| Аспект | Версия 1 (старая) | Версия 2 (текущая) |
|--------|-------------------|-------------------|
| Эндпоинт | `POST /api/auth/crm-token` | `POST /api/auth/crm-credentials` |
| Тело запроса | `{ crmToken, crmUserId, crmUserRole }` | `{ email, password }` |
| Что передаёт фронт | JWT-токен (протухает) | Логин/пароль (постоянны) |
| Кто логинится в CRM | Фронт | Бэкенд мессенджера |
| Кто обновляет токен | Фронт (не может — не знает когда) | Бэкенд (автоматически) |
| Модалка ввода пароля | Нужна (при протухании) | Не нужна |
| Хранение пароля | Не хранится | Бэкенд хранит зашифрованным |
| `crmStatus` ответ | `hasCrmToken` | `hasCrmCredentials` + `crmConnected` |

---

## ИЗМЕНЕНИЯ ВО ФРОНТЕ

### AuthContext.tsx

```diff
- // Старое: отправляли JWT-токен
- const crmUserRole = user.role === 'developer' ? 'admin' : ...;
- await messengerApi.saveCrmToken(token, user.id, crmUserRole);

+ // Новое: отправляем email + пароль
+ await messengerApi.saveCrmCredentials(login.trim(), password);
```

### messengerApi.ts

```diff
- saveCrmToken: async (crmToken: string, crmUserId: string, crmUserRole: string) => {
-   const response = await api.post('/auth/crm-token', { crmToken, crmUserId, crmUserRole });
-   return response.data;
- },
+ saveCrmCredentials: async (email: string, password: string) => {
+   const response = await api.post('/auth/crm-credentials', { email, password });
+   return response.data;
+ },
+ deleteCrmCredentials: async () => {
+   const response = await api.delete('/auth/crm-credentials');
+   return response.data;
+ },
```

### ChatsPage.tsx

```diff
- // Старое: модалка с вводом пароля
- const [crmModalOpen, setCrmModalOpen] = useState(false);
- const [crmPassword, setCrmPassword] = useState('');
- const handleConnectCrm = () => { setCrmModalOpen(true) };
- // + целая модалка с input password, кнопками Отмена/Подключить

+ // Новое: просто сообщение
+ {!isChatsListLoading && crmStatus && !crmStatus.crmConnected && (
+   <div>CRM не подключён. Перезайдите для подключения.</div>
+ )}
```

---

## ЭНДПОИНТЫ ДЛЯ БЭКЕНДА

### 1. POST /api/auth/crm-credentials

Сохранение учётных данных + логин в CRM API.

**Запрос:**
```
Authorization: Bearer {msgr_jwt_token}
Content-Type: application/json

{ "email": "manager@example.com", "password": "secret123" }
```

**Ответ 200:**
```json
{
  "success": true,
  "crmUserId": "665f0a1b2c3d4e5f6a7b8c9d",
  "crmUserRole": "agent",
  "crmTokenExpiry": "2025-01-15T11:00:00.000Z"
}
```

**Ответ 400:** `{ "success": false, "error": "email and password are required" }`
**Ответ 401:** `{ "success": false, "error": "Неверный логин или пароль в CRM" }`

### 2. GET /api/auth/crm-status

Проверка статуса CRM-подключения.

**Запрос:**
```
Authorization: Bearer {msgr_jwt_token}
```

**Ответ 200 (токен активен):**
```json
{
  "success": true,
  "hasCrmCredentials": true,
  "crmConnected": true,
  "crmUserId": "665f0a1b2c3d4e5f6a7b8c9d",
  "crmUserRole": "agent",
  "crmTokenExpiry": "2025-01-15T11:00:00.000Z"
}
```

**Ответ 200 (нет данных):**
```json
{ "success": true, "hasCrmCredentials": false, "crmConnected": false }
```

### 3. DELETE /api/auth/crm-credentials

Удаление учётных данных.

**Запрос:**
```
Authorization: Bearer {msgr_jwt_token}
```

**Ответ 200:** `{ "success": true }`

---

## КАК БЭКЕНД РАБОТАЕТ С CRM API

### Логин в CRM

```
POST https://api-crm.baza.sale/auth/login-direct
{ "email": "manager@example.com", "password": "secret123" }

→ { "user": { "id": "...", "role": "agent", ... }, "token": "eyJ...", "refreshToken": "eyJ..." }
```

### Обновление токена

```
POST https://api-crm.baza.sale/auth/refresh
{ "refreshToken": "eyJ..." }

→ { "token": "eyJ..." }
```

### Автоматическое обновление (алгоритм)

1. При обращении к CRM API — проверять TTL токена
2. Токен протухает → `POST /auth/refresh` с сохранённым `refreshToken`
3. Refresh не помог → `POST /auth/login-direct` с сохранёнными `email`/`password`
4. Повторный логин не проходит → `crmConnected: false`

---

## ХРАНЕНИЕ НА БЭКЕНДЕ

| Поле | Описание |
|------|----------|
| crmEmail | Email в CRM |
| crmPassword | Пароль в CRM (зашифровано) |
| crmToken | Текущий JWT для CRM API |
| crmRefreshToken | Refresh token для CRM API |
| crmUserId | ID пользователя в CRM |
| crmUserRole | Роль в CRM |
| crmTokenExpiry | Время жизни токена |

---

## ОШИБКИ

| Ситуация | Ответ бэкенда | Действие фронта |
|----------|---------------|-----------------|
| Неверный пароль CRM | 401 + error | Toast «Неверный логин или пароль» |
| CRM API недоступен | 502/503 | Toast «CRM временно недоступна» |
| Токен протух, refresh не помог | crmConnected: false | Сообщение «Перезайдите для подключения» |
| Пользователь сменил пароль | crmConnected: false | Сообщение «Перезайдите для подключения» |

---

## ЧТО НУЖНО РЕАЛИЗОВАТЬ БЭКЕНДУ

1. **POST /api/auth/crm-credentials** — сохранение email/password, логин в CRM API
2. **GET /api/auth/crm-status** — проверка статуса CRM-подключения
3. **DELETE /api/auth/crm-credentials** — удаление учётных данных
4. **Автоматический refresh** — обновление CRM-токена при протухании
5. **Повторный логин** — если refresh не помог, повторный вход с сохранёнными данными
6. **Шифрование пароля** — хранить пароль зашифрованным в БД
