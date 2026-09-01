# Спецификация: CRM-авторизация — фронт → бэк мессенджера

## Изменение (обновлено)

**Ранее:** Фронт передавал CRM JWT-токен. Проблема — токен протухает (TTL 1 час), фронт не знает когда.

**Теперь:** Фронт передаёт **email и пароль** при каждом логине. Бэкенд мессенджера **сам** логинится в CRM API, получает JWT, хранит, обновляет при протухании. Фронт ничего не делает — никаких модалок, никаких кнопок.

---

## 1. Сохранение CRM-учётных данных

```
POST /api/auth/crm-credentials
Authorization: Bearer {msgr_jwt_token}
Content-Type: application/json

{
  "email": "manager@example.com",
  "password": "secret123"
}
```

| Поле | Тип | Обязательно | Описание |
|------|-----|-------------|----------|
| email | string | да | Email пользователя в CRM (= email от ERP) |
| password | string | да | Пароль пользователя в CRM (= пароль от ERP) |

### Response 200

```json
{
  "success": true,
  "crmUserId": "665f0a1b2c3d4e5f6a7b8c9d",
  "crmUserRole": "agent",
  "crmTokenExpiry": "2025-01-15T11:00:00.000Z"
}
```

### Response 400

```json
{ "success": false, "error": "email and password are required" }
```

### Response 401

```json
{ "success": false, "error": "Неверный логин или пароль в CRM" }
```

---

## 2. Проверка статуса CRM-подключения

```
GET /api/auth/crm-status
Authorization: Bearer {msgr_jwt_token}
```

### Response 200 (токен активен)

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

### Response 200 (нет учётных данных)

```json
{
  "success": true,
  "hasCrmCredentials": false,
  "crmConnected": false
}
```

---

## 3. Удаление CRM-учётных данных

```
DELETE /api/auth/crm-credentials
Authorization: Bearer {msgr_jwt_token}
```

### Response 200

```json
{ "success": true }
```

---

## 4. Порядок работы

### При логине пользователя

```
1. Пользователь вводит email + пароль в форме входа ERP
2. Фронт отправляет POST /api/auth/crm-credentials { email, password }
3. Бэкенд логинится в CRM API и сохраняет учётные данные
4. Готово — ИИ автоматически работает с лидами
```

**Важно:** Фронт отправляет `{ email, password }` **автоматически при каждом логине**. Пользователю не нужно ничего нажимать дополнительно. Нет модалок, нет кнопок «Подключить CRM».

### При протухании токена

```
Бэкенд сам обновляет токен через /auth/refresh.
Если refresh не помог → повторный логин через /auth/login-direct.
Если повторный логин не проходит (смена пароля) → crmConnected: false.
```

### При открытии чата

```
Фронт делает GET /api/auth/crm-status.
Если crmConnected: false → показать сообщение «CRM не подключён. Перезайдите для подключения.»
```

---

## 5. Как бэкенд работает с CRM API

### 5.1 Логин в CRM

```
POST https://api-crm.baza.sale/auth/login-direct
Content-Type: application/json

{
  "email": "manager@example.com",
  "password": "secret123"
}
```

Ответ:
```json
{
  "user": {
    "id": "665f0a1b2c3d4e5f6a7b8c9d",
    "name": "Иван Иванов",
    "email": "manager@example.com",
    "role": "agent",
    "teamId": "..."
  },
  "token": "eyJhbGciOiJIUzI1NiIs...",
  "refreshToken": "eyJhbGciOiJIUzI1NiIs..."
}
```

### 5.2 Обновление токена

```
POST https://api-crm.baza.sale/auth/refresh
Content-Type: application/json

{
  "refreshToken": "eyJhbGciOiJIUzI1NiIs..."
}
```

Ответ:
```json
{ "token": "eyJhbGciOiJIUzI1NiIs..." }
```

### 5.3 Автоматическое обновление

1. При каждом обращении к CRM API проверять TTL токена
2. Если токен протухает → вызвать `/auth/refresh` с сохранённым `refreshToken`
3. Если refresh не помог → повторить логин через `/auth/login-direct` с сохранёнными `email`/`password`
4. Если повторный логин не проходит → пометить `crmConnected: false`

---

## 6. Хранение на бэкенде

На пользователя мессенджера сохраняются:

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

## 7. Фронт — что реализовано

### AuthContext.tsx — при логине

```typescript
// После успешного логина в CRM + Messenger:
await messengerApi.saveCrmCredentials(login.trim(), password);
```

### messengerApi.ts — методы

```typescript
// Сохранение учётных данных
saveCrmCredentials: async (email: string, password: string) => {
  const response = await api.post('/auth/crm-credentials', { email, password });
  return response.data;
},

// Проверка статуса
getCrmStatus: async () => {
  const response = await api.get('/auth/crm-status');
  return response.data;
},

// Удаление учётных данных
deleteCrmCredentials: async () => {
  const response = await api.delete('/auth/crm-credentials');
  return response.data;
},
```

### ChatsPage.tsx — проверка при открытии чата

```typescript
// При загрузке страницы:
const crmRes = await messengerApi.getCrmStatus()
setCrmStatus(crmRes)

// Если crmConnected: false → показать сообщение
// Никаких модалок или кнопок — просто сообщение
```

---

## 8. Ошибки

| Ситуация | Ответ бэкенда | Действие фронта |
|----------|---------------|-----------------|
| Неверный пароль CRM | 401 + error | Toast «Неверный логин или пароль» |
| CRM API недоступен | 502/503 | Toast «CRM временно недоступна» |
| Токен протух, refresh не помог | crmConnected: false | Сообщение «Перезайдите для подключения» |
| Пользователь сменил пароль | crmConnected: false | Сообщение «Перезайдите для подключения» |

---

## 9. Что нужно бэкенду реализовать

1. **POST /api/auth/crm-credentials** — сохранение email/password, логин в CRM API
2. **GET /api/auth/crm-status** — проверка статуса CRM-подключения
3. **DELETE /api/auth/crm-credentials** — удаление учётных данных
4. **Автоматический refresh** — обновление CRM-токена при протухании
5. **Повторный логин** — если refresh не помог, повторный вход с сохранёнными данными
6. **Шифрование пароля** — хранить пароль зашифрованным в БД
