# Спецификация бэкенда: Модуль LMS (Обучение и база знаний)

**Версия**: 1.0  
**Дата**: 2026-06-23  
**Статус**: Готов к реализации

---

## 1. Обзор

Модуль LMS (Learning Management System) предоставляет функционал для создания и управления обучением сотрудников:

- **Библиотека материалов** — статьи, скрипты, презентации, видео, PDF
- **Курсы** — упорядоченные сборники материалов с опциональным финальным тестом
- **Прогресс** — отслеживание прохождения курсов пользователями

Фронтенд полностью реализован и работает в fallback-режиме на моках до поднятия бэкенда.

---

## 1.5 Конфигурация окружения

### Frontend (.env / .env.local)

```bash
# CRM API (основной бэкенд для LMS)
VITE_CRM_API_BASE_URL=http://localhost:3000          # Development
VITE_CRM_API_BASE_URL=https://api-crm.baza.sale      # Production

# Или использовать общую переменную
VITE_API_BASE_URL=http://localhost:3000
```
---

## 2. Базовый URL и аутентификация

### URLs

| Окружение | CRM API Base URL | LMS Endpoints |
|-----------|------------------|---------------|
| **Production** | `https://api-crm.baza.sale` | `https://api-crm.baza.sale/api/lms/*` |
| **Development** | `http://localhost:3000` | `http://localhost:3000/api/lms/*` |
| **Env Variable** | `VITE_CRM_API_BASE_URL` | `${VITE_CRM_API_BASE_URL}/api/lms/*` |

### Полные URL эндпоинтов

#### Production
```
GET    https://api-crm.baza.sale/api/lms/items
POST   https://api-crm.baza.sale/api/lms/items
PATCH  https://api-crm.baza.sale/api/lms/items/:id
DELETE https://api-crm.baza.sale/api/lms/items/:id

GET    https://api-crm.baza.sale/api/lms/courses
POST   https://api-crm.baza.sale/api/lms/courses
PATCH  https://api-crm.baza.sale/api/lms/courses/:id
DELETE https://api-crm.baza.sale/api/lms/courses/:id

GET    https://api-crm.baza.sale/api/lms/progress
PUT    https://api-crm.baza.sale/api/lms/progress/:courseId
DELETE https://api-crm.baza.sale/api/lms/progress/:courseId

POST   https://api-crm.baza.sale/api/files
```

#### Development (localhost)
```
GET    http://localhost:3000/api/lms/items
POST   http://localhost:3000/api/lms/items
PATCH  http://localhost:3000/api/lms/items/:id
DELETE http://localhost:3000/api/lms/items/:id

GET    http://localhost:3000/api/lms/courses
POST   http://localhost:3000/api/lms/courses
PATCH  http://localhost:3000/api/lms/courses/:id
DELETE http://localhost:3000/api/lms/courses/:id

GET    http://localhost:3000/api/lms/progress
PUT    http://localhost:3000/api/lms/progress/:courseId
DELETE http://localhost:3000/api/lms/progress/:courseId

POST   http://localhost:3000/api/files
```

### Аутентификация

```
Authorization: Bearer <jwt_token>
Content-Type: application/json
```

Все эндпоинты требуют аутентификации. Текущий пользователь определяется по JWT.

---

## 2.5 Формат ответов

### Стандартный формат успеха

```json
{
  "success": true,
  "data": { ... }
}
```

### Стандартный формат ошибки

```json
{
  "success": false,
  "message": "Человеко-читаемое описание ошибки",
  "error": {
    "code": "VALIDATION_ERROR",
    "details": {
      "field": "title",
      "message": "Название обязательно для заполнения"
    }
  }
}
```

### Примеры ответов

#### Успешный ответ (массив)
```json
{
  "success": true,
  "data": [
    { "id": "1", "title": "Материал 1", ... },
    { "id": "2", "title": "Материал 2", ... }
  ]
}
```

#### Успешный ответ (объект)
```json
{
  "success": true,
  "data": {
    "id": "generated-uuid",
    "title": "Новый материал",
    "createdAt": "2026-06-23T10:00:00Z"
  }
}
```

#### Ошибка валидации
```json
{
  "success": false,
  "message": "Ошибка валидации",
  "error": {
    "code": "VALIDATION_ERROR",
    "details": {
      "field": "title",
      "message": "Название обязательно для заполнения"
    }
  }
}
```

#### Ресурс не найден
```json
{
  "success": false,
  "message": "Материал не найден",
  "error": {
    "code": "NOT_FOUND",
    "details": {
      "resource": "lms_item",
      "id": "nonexistent-id"
    }
  }
}
```

---

## 3. Модели данных

### 3.1 LMSItem (Материал)

```typescript
interface LMSItem {
  id: string                    // UUID или nanoid
  type: ContentType             // Тип контента
  title: string                 // Название материала
  description: string           // Краткое описание
  targetRole: TargetRole        // 'all' | 'manager' | 'rop' | 'director'
  readTime?: string             // Время чтения, например "5 мин"
  tags?: string[]               // Теги для поиска
  content: Content              // Содержимое (полиморфное)
  coverUrl?: string             // URL обложки
  createdAt: string             // ISO datetime
  updatedAt: string             // ISO datetime
}

type ContentType = 'article' | 'video' | 'script' | 'quiz' | 'presentation' | 'pdf' | 'document'
type TargetRole = 'all' | 'manager' | 'rop' | 'director'
```

#### Полиморфные типы контента:

```typescript
// Статья
interface ArticleContent {
  type: 'article'
  body: string                  // Markdown
}

// Видео (ТОЛЬКО URL, файл НЕ загружается)
interface VideoContent {
  type: 'video'
  url: string                   // YouTube/Vimeo URL (не embed!)
  description?: string
  // Примеры:
  // "https://www.youtube.com/watch?v=dQw4w9WgXcQ"
  // "https://youtu.be/dQw4w9WgXcQ"
  // "https://vimeo.com/123456789"
  // "https://www.youtube.com/embed/dQw4w9WgXcQ" (готовый embed)
}

// Скрипт (диалог)
interface ScriptContent {
  type: 'script'
  lines: Array<{
    speaker: 'manager' | 'client'
    text: string
  }>
}

// Тест
interface QuizContent {
  type: 'quiz'
  questions: Array<{
    question: string
    options: string[]           // 2-6 вариантов
    correct: number             // Индекс правильного ответа
  }>
}

// Презентация
interface PresentationContent {
  type: 'presentation'
  slides: Array<{
    title: string
    body: string
  }>
}

// PDF
interface PdfContent {
  type: 'pdf'
  url: string                   // URL PDF файла
  description?: string
}

// Документ (Word, Excel, PowerPoint, TXT и др.)
interface DocumentContent {
  type: 'document'
  url: string                   // URL файла
  fileName: string              // Оригинальное имя файла (contract.docx)
  fileSize: number              // Размер в байтах
  mimeType: string              // MIME-тип файла
  description?: string
}
```

### 3.2 LMSCourse (Курс)

```typescript
interface LMSCourse {
  id: string                    // UUID или nanoid
  title: string                 // Название курса
  description: string           // Описание
  targetRoles: TargetRole[]     // Целевые роли (массив)
  emoji: string                 // Эмодзи-иконка курса
  itemIds: string[]             // ID материалов в порядке прохождения
  finalQuiz?: LMSCourseFinalQuiz // Опциональный финальный тест
  createdAt: string
  updatedAt: string
}

interface LMSCourseFinalQuiz {
  passingScore: number          // Проходной балл (0-100)
  questions: Array<{
    question: string
    options: string[]           // 2-6 вариантов
    correct: number             // Индекс правильного ответа
  }>
}
```

### 3.3 LMSProgress (Прогресс пользователя)

```typescript
interface LMSProgressEntry {
  completedItems: string[]      // ID пройденных материалов
  finalQuizPassed?: boolean     // Сдан ли финальный тест
  finalQuizScore?: number       // Балл теста (0-100)
}

// Карта прогресса: courseId → запись
type LMSProgressMap = Record<string, LMSProgressEntry>
```

### 3.4 FileEntity (Файл)

```typescript
interface FileEntity {
  id: string
  name: string                  // Имя файла на сервере (uuid.ext)
  originalName: string          // Оригинальное имя файла (Договор.docx)
  mimeType: string              // MIME-тип
  size: number                  // Размер в байтах
  url: string                   // Постоянная ссылка для доступа
  entityType: string            // 'lms'
  purpose: string               // 'cover' | 'pdf' | 'document' | 'lms'
  createdAt: string
}
```

---

## 4. API Эндпоинты

### 4.1 Материалы (Items)

#### GET /api/lms/items
Получить все материалы.

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "art-crm-intro",
      "type": "article",
      "title": "Как работать с лидом в системе",
      "description": "Пошаговый разбор...",
      "targetRole": "manager",
      "readTime": "5 мин",
      "tags": ["CRM", "Лиды"],
      "content": {
        "type": "article",
        "body": "## Что такое лид..."
      },
      "createdAt": "2026-01-15T10:00:00Z",
      "updatedAt": "2026-01-15T10:00:00Z"
    }
  ]
}
```

**Фильтрация (опционально):**
- `?type=article` — по типу контента
- `?targetRole=manager` — по роли
- `?search=CRM` — поиск по названию/описанию/тегам

---

#### POST /api/lms/items
Создать новый материал.

**Request:**
```json
{
  "type": "article",
  "title": "Новый материал",
  "description": "Описание",
  "targetRole": "manager",
  "readTime": "5 мин",
  "tags": ["тег1", "тег2"],
  "content": {
    "type": "article",
    "body": "## Заголовок\n\nТекст статьи..."
  },
  "coverUrl": "https://..."
}
```

**Response:** `201 Created`
```json
{
  "success": true,
  "data": {
    "id": "generated-uuid",
    "type": "article",
    "title": "Новый материал",
    ...
  }
}
```

**Валидация:**
- `title` — обязателен, max 200 символов
- `type` — из перечисления
- `targetRole` — из перечисления
- `content` — соответствует типу

---

#### PATCH /api/lms/items/:id
Обновить материал.

**Request:** (частичное обновление)
```json
{
  "title": "Обновленное название",
  "tags": ["новый тег"]
}
```

**Response:** `200 OK`
```json
{
  "success": true,
  "data": { /* обновленный материал */ }
}
```

**Ошибки:**
- `404` — материал не найден

---

#### DELETE /api/lms/items/:id
Удалить материал.

**Response:**
```json
{
  "success": true,
  "data": {
    "deleted": true
  }
}
```

**Побочные эффекты:**
- Удалить все связанные файлы (обложка)
- Убрать ID из всех курсов, где он используется

---

### 4.2 Курсы (Courses)

#### GET /api/lms/courses
Получить все курсы.

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "course-manager-base",
      "title": "Базовый курс менеджера",
      "description": "Полный онбординг...",
      "targetRoles": ["manager", "all"],
      "emoji": "🎯",
      "itemIds": ["art-crm-intro", "script-first-call", ...],
      "finalQuiz": {
        "passingScore": 70,
        "questions": [...]
      },
      "createdAt": "2026-01-15T10:00:00Z",
      "updatedAt": "2026-01-15T10:00:00Z"
    }
  ]
}
```

**Фильтрация (опционально):**
- `?targetRole=manager` — курсы для роли

---

#### POST /api/lms/courses
Создать новый курс.

**Request:**
```json
{
  "title": "Новый курс",
  "description": "Описание курса",
  "targetRoles": ["manager"],
  "emoji": "🎯",
  "itemIds": ["item-1", "item-2", "item-3"],
  "finalQuiz": {
    "passingScore": 70,
    "questions": [
      {
        "question": "Вопрос?",
        "options": ["Ответ 1", "Ответ 2", "Ответ 3"],
        "correct": 0
      }
    ]
  }
}
```

**Response:** `201 Created`

**Валидация:**
- `title` — обязателен
- `itemIds` — минимум 1 существующий ID
- `targetRoles` — минимум 1 роль
- `finalQuiz.questions` — если есть, минимум 1 вопрос с 2+ вариантами

---

#### PATCH /api/lms/courses/:id
Обновить курс.

**Request:** (частичное обновление)
```json
{
  "itemIds": ["item-1", "item-3", "item-5"],
  "finalQuiz": {
    "passingScore": 80,
    "questions": [...]
  }
}
```

**Response:** `200 OK`

**Ошибки:**
- `404` — курс не найден

---

#### DELETE /api/lms/courses/:id
Удалить курс.

**Response:**
```json
{
  "success": true,
  "data": {
    "deleted": true
  }
}
```

**Побочные эффекты:**
- Удалить прогресс всех пользователей по этому курсу

---

### 4.3 Прогресс (Progress)

#### GET /api/lms/progress
Получить прогресс текущего пользователя по всем курсам.

**Response:**
```json
{
  "success": true,
  "data": {
    "course-manager-base": {
      "completedItems": ["art-crm-intro", "script-first-call"],
      "finalQuizPassed": false,
      "finalQuizScore": undefined
    },
    "course-rop-team": {
      "completedItems": ["art-funnel-reading", "art-kpi-setting", "script-rop-briefing"],
      "finalQuizPassed": true,
      "finalQuizScore": 85
    }
  }
}
```

---

#### PUT /api/lms/progress/:courseId
Создать или обновить прогресс по курсу (upsert).

**Request:**
```json
{
  "completedItems": ["art-crm-intro", "script-first-call", "pres-product-knowledge"],
  "finalQuizPassed": true,
  "finalQuizScore": 75
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "completedItems": ["art-crm-intro", "script-first-call", "pres-product-knowledge"],
    "finalQuizPassed": true,
    "finalQuizScore": 75
  }
}
```

**Логика:**
- Если запись для courseId не существует — создать
- Если существует — заменить полностью
- Привязка к пользователю через JWT

---

#### DELETE /api/lms/progress/:courseId
Сбросить прогресс пользователя по курсу.

**Response:**
```json
{
  "success": true,
  "data": {
    "deleted": true
  }
}
```

---

### 4.4 Файлы (Files)

#### POST /api/files
Загрузить файл (multipart/form-data).

**Request:**
```
Content-Type: multipart/form-data

file: <binary>
purpose: "lms" | "cover" | "pdf" | "video"
entityType: "lms"
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "file-uuid",
    "name": "presentation.pdf",
    "mimeType": "application/pdf",
    "size": 1024000,
    "url": "https://cdn.baza.sale/lms/files/file-uuid.pdf",
    "purpose": "lms",
    "entityType": "lms",
    "createdAt": "2026-01-15T10:00:00Z"
  }
}
```

**Валидация:**
- Максимальный размер: 50 МБ
- Разрешенные типы для `purpose`:
  - `cover`: image/*
  - `pdf`: application/pdf
  - `video`: video/*, YouTube/Vimeo URLs
  - `lms`: все выше +/*

**Хранение:**
- S3-совместимое хранилище (MinIO, AWS S3, DigitalOcean Spaces)
- CDN для раздачи (опционально)

---

## 4.5 Требования к хранению и раздаче файлов

### Поддерживаемые типы файлов

| Тип контента | Формат | MIME-тип | Макс. размер | Загрузка | Просмотр |
|--------------|--------|----------|--------------|----------|----------|
| **Обложка** | PNG, JPG, WEBP | `image/*` | 5 МБ | ✅ Да | `<img>` |
| **PDF** | PDF | `application/pdf` | 50 МБ | ✅ Да | `<iframe>` |
| **Документ** | DOC, DOCX | `application/msword`, `application/vnd.openxmlformats-officedocument.wordprocessingml.document` | 50 МБ | ✅ Да | Скачивание |
| **Документ** | XLS, XLSX | `application/vnd.ms-excel`, `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet` | 50 МБ | ✅ Да | Скачивание |
| **Документ** | PPT, PPTX | `application/vnd.ms-powerpoint`, `application/vnd.openxmlformats-officedocument.presentationml.presentation` | 50 МБ | ✅ Да | Скачивание |
| **Документ** | TXT | `text/plain` | 10 МБ | ✅ Да | `<pre>` (инлайн) |
| **Документ** | CSV | `text/csv` | 10 МБ | ✅ Да | Таблица / Скачивание |
| **Документ** | RTF | `application/rtf` | 50 МБ | ✅ Да | Скачивание |
| **Видео** | YouTube/Vimeo URL | — | — | ❌ Только URL | `<iframe>` |

### Типы документов для агентства недвижимости

| Документ | Назначение | MIME-тип |
|----------|------------|----------|
| Договор | Шаблоны договоров купли-продажи | `application/msword` |
| Договор | Подписанные договоры | `application/pdf` |
| Акт | Акт приема-передачи | `application/pdf` |
| Справка | Справки о доходах | `application/msword` |
| Выписка | Выписки из ЕГРН | `application/pdf` |
| Прайс | Прайс-листы застройщиков | `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet` |
| Презентация | Презентации объектов | `application/vnd.openxmlformats-officedocument.presentationml.presentation` |
| Инструкция | Регламенты и инструкции | `text/plain` |
| Отчёт | Отчёты по продажам | `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet` |

### Требования к URL файлов

Для корректного отображения/скачивания на фронте URL файла должен:

1. **Поддерживать CORS**
```
Access-Control-Allow-Origin: *
# Или конкретный домен:
Access-Control-Allow-Origin: https://erp.baza.sale
Access-Control-Allow-Methods: GET, HEAD
Access-Control-Expose-Headers: Content-Length, Content-Disposition
```

2. **Иметь правильный Content-Type**
```
Content-Type: application/pdf                                              # PDF
Content-Type: image/jpeg                                                   # JPG
Content-Type: application/vnd.openxmlformats-officedocument.wordprocessingml.document  # DOCX
Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet       # XLSX
Content-Type: application/vnd.openxmlformats-officedocument.presentationml.presentation # PPTX
Content-Type: text/plain                                                   # TXT
```

3. **Content-Disposition зависит от типа файла**

| Тип файла | Content-Disposition | Причина |
|-----------|---------------------|---------|
| PDF | `inline; filename="doc.pdf"` | Просмотр в `<iframe>` |
| Изображения | `inline` | Отображение в `<img>` |
| TXT | `inline` | Отображение в `<pre>` |
| DOCX, XLSX, PPTX | `attachment; filename="doc.docx"` | Скачивание (нет нативного просмотра в браузере) |
| CSV | `inline` или `attachment` | Зависит от использования |

4. **Поддерживать кэширование**
```
Cache-Control: public, max-age=31536000, immutable
ETag: "abc123"
```

### Хранилище файлов

#### Рекомендуемый вариант: S3 + CDN

```
┌─────────────┐     upload      ┌─────────────┐     public URL     ┌─────────────┐
│   Frontend   │ ─────────────► │   Backend    │ ──────────────►  │   S3/CDN    │
│  (React)     │                │  (API)       │                  │ (DigitalOcean│
└─────────────┘                └─────────────┘                  │  Spaces)    │
                                                                └─────────────┘
                                                                       │
                                                                       ▼
                                                                ┌─────────────┐
                                                                │   Browser   │
                                                                │ <iframe>    │
                                                                │ <img>       │
                                                                └─────────────┘
```

#### Настройка DigitalOcean Spaces

```bash
# Endpoint: https://ams3.digitalobjects.digital
# Bucket: baza-lms-files
# Region: ams3

# CORS Configuration (JSON):
[
  {
    "AllowedHeaders": ["*"],
    "AllowedMethods": ["GET", "HEAD"],
    "AllowedOrigins": ["https://erp.baza.sale", "http://localhost:5173"],
    "ExposeHeaders": ["ETag", "Content-Length"],
    "MaxAgeSeconds": 3600
  }
]
```

#### Формат URL файла

```
https://{bucket}.{region}.digitaloceanspaces.com/lms/{entityType}/{purpose}/{fileId}.{ext}

Примеры:
https://baza-lms-files.ams3.digitaloceanspaces.com/lms/lms/cover/abc123.jpg
https://baza-lms-files.ams3.digitaloceanspaces.com/lms/lms/pdf/def456.pdf
```

### Ответ API при загрузке файла

```json
{
  "success": true,
  "data": {
    "id": "file-uuid",
    "name": "a1b2c3d4-e5f6-7890-abcd-ef1234567890.docx",
    "originalName": "Договор купли-продажи.docx",
    "mimeType": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "size": 1024000,
    "url": "https://baza-lms-files.ams3.digitaloceanspaces.com/lms/lms/document/a1b2c3d4-e5f6-7890-abcd-ef1234567890.docx",
    "purpose": "document",
    "entityType": "lms",
    "createdAt": "2026-01-15T10:00:00Z"
  }
}
```

> Фронт использует поле `url` для отображения/скачивания файла.

### Валидация на бэкенде

```typescript
// Разрешенные MIME-типы
const ALLOWED_MIME_TYPES = {
  cover: [
    'image/png',
    'image/jpeg',
    'image/webp',
  ],
  pdf: [
    'application/pdf',
  ],
  document: [
    // Microsoft Word
    'application/msword',                                                      // .doc
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',  // .docx
    // Microsoft Excel
    'application/vnd.ms-excel',                                                // .xls
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',       // .xlsx
    // Microsoft PowerPoint
    'application/vnd.ms-powerpoint',                                           // .ppt
    'application/vnd.openxmlformats-officedocument.presentationml.presentation', // .pptx
    // Текстовые
    'text/plain',                                                              // .txt
    'text/csv',                                                                // .csv
    'text/rtf',                                                                // .rtf
    'application/rtf',                                                         // .rtf
    // PDF (для совместимости)
    'application/pdf',
  ],
  lms: [
    // Все вышеперечисленные
    'image/png',
    'image/jpeg',
    'image/webp',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'text/plain',
    'text/csv',
    'text/rtf',
    'application/rtf',
  ],
};

// Максимальные размеры (в байтах)
const MAX_FILE_SIZES = {
  cover: 5 * 1024 * 1024,         // 5 МБ
  pdf: 50 * 1024 * 1024,          // 50 МБ
  document: 50 * 1024 * 1024,     // 50 МБ
  lms: 50 * 1024 * 1024,          // 50 МБ
};

// Расширения файлов для определения MIME-типа
const EXTENSION_TO_MIME: Record<string, string> = {
  '.doc': 'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xls': 'application/vnd.ms-excel',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.ppt': 'application/vnd.ms-powerpoint',
  '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  '.txt': 'text/plain',
  '.csv': 'text/csv',
  '.rtf': 'application/rtf',
  '.pdf': 'application/pdf',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
};
```

### Ошибки загрузки файлов

| HTTP | Код | Описание |
|------|-----|----------|
| 400 | INVALID_FILE_TYPE | Неподдерживаемый MIME-тип |
| 413 | FILE_TOO_LARGE | Файл превышает максимальный размер |
| 415 | UNSUPPORTED_MEDIA_TYPE | Content-Type не поддерживается |

---

## 5. База данных

### 5.1 Таблица `lms_items`

```sql
CREATE TABLE lms_items (
  id VARCHAR(36) PRIMARY KEY,
  type VARCHAR(20) NOT NULL,
  title VARCHAR(200) NOT NULL,
  description TEXT NOT NULL,
  target_role VARCHAR(20) NOT NULL DEFAULT 'all',
  read_time VARCHAR(20),
  tags JSON,
  content JSON NOT NULL,          -- Полиморфный JSON
  cover_url TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  INDEX idx_type (type),
  INDEX idx_target_role (target_role),
  FULLTEXT INDEX idx_search (title, description)
);
```

### 5.2 Таблица `lms_courses`

```sql
CREATE TABLE lms_courses (
  id VARCHAR(36) PRIMARY KEY,
  title VARCHAR(200) NOT NULL,
  description TEXT NOT NULL,
  target_roles JSON NOT NULL,     -- Array of roles
  emoji VARCHAR(10) DEFAULT '🎯',
  item_ids JSON NOT NULL,         -- Array of item IDs (ordered)
  final_quiz JSON,                -- Optional quiz
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  INDEX idx_target_roles (target_roles(50))
);
```

### 5.3 Таблица `lms_progress`

```sql
CREATE TABLE lms_progress (
  id VARCHAR(36) PRIMARY KEY,
  user_id VARCHAR(36) NOT NULL,
  course_id VARCHAR(36) NOT NULL,
  completed_items JSON NOT NULL DEFAULT '[]',
  final_quiz_passed BOOLEAN DEFAULT FALSE,
  final_quiz_score INT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  UNIQUE INDEX idx_user_course (user_id, course_id),
  INDEX idx_user_id (user_id),
  FOREIGN KEY (course_id) REFERENCES lms_courses(id) ON DELETE CASCADE
);
```

### 5.4 Таблица `files` (если не существует)

```sql
CREATE TABLE files (
  id VARCHAR(36) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  mime_type VARCHAR(100) NOT NULL,
  size INT NOT NULL,
  url TEXT NOT NULL,
  entity_type VARCHAR(50),
  purpose VARCHAR(50),
  uploaded_by VARCHAR(36),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  INDEX idx_entity (entity_type, purpose)
);
```

---

## 6. Бизнес-логика

### 6.1 Фильтрация материалов по ролям

При запросе `/api/lms/items` для пользователя с ролью `manager`:
- Показывать материалы с `targetRole: 'manager'`
- Показывать материалы с `targetRole: 'all'`
- **Не показывать** материалы для `rop` и `director`

Для РОП:
- Показывать `rop`, `manager`, `all`

Для директора:
- Показывать `director`, `all`

### 6.2 Каскадное удаление

При удалении курса:
1. Удалить все записи прогресса для этого курса
2. НЕ удалять материалы (они могут использоваться в других курсах)

При удалении материала:
1. Убрать `itemIds` из всех курсов, где он есть
2. Убрать из `completedItems` в прогрессе всех пользователей
3. Удалить связанные файлы (обложка)

### 6.3 Валидация финального теста

При сохранении курса с `finalQuiz`:
- Минимум 1 вопрос
- Каждый вопрос: минимум 2 варианта ответа
- `passingScore` от 0 до 100
- `correct` — индекс в пределах `options.length`

---

## 7. Требования к реализации

### 7.1 Приоритет 1 (MVP)

- [ ] CRUD для материалов (`lms_items`)
- [ ] CRUD для курсов (`lms_courses`)
- [ ] Хранение и чтение прогресса (`lms_progress`)
- [ ] Загрузка файлов (обложки, PDF)
- [ ] Фильтрация по ролям

### 7.2 Приоритет 2

- [ ] Полнотекстовый поиск по материалам
- [ ] Сортировка и пагинация
- [ ] Валидация связей (itemIds → существующие items)
- [ ] Логирование изменений (audit trail)

### 7.3 Приоритет 3

- [ ] Аналитика: сколько людей прошло курс, средний балл
- [ ] Экспорт/импорт курсов
- [ ] Массовое создание материалов
- [ ] Интеграция с Slack/Telegram для уведомлений

---

## 8. Примеры запросов (cURL)

### Переменные окружения для тестирования

```bash
# Production
PROD_API="https://api-crm.baza.sale"

# Development (localhost)
DEV_API="http://localhost:3000"

# Токен (получить через POST /api/auth/login)
JWT_TOKEN="your_jwt_token_here"
```

### 8.1 Материалы (Items)

#### Получить все материалы
```bash
# Production
curl -X GET https://api-crm.baza.sale/api/lms/items \
  -H "Authorization: Bearer $JWT_TOKEN"

# Development
curl -X GET http://localhost:3000/api/lms/items \
  -H "Authorization: Bearer $JWT_TOKEN"
```

#### Создать материал
```bash
# Production
curl -X POST https://api-crm.baza.sale/api/lms/items \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "article",
    "title": "Как работать с возражениями",
    "description": "7 техник для менеджеров",
    "targetRole": "manager",
    "readTime": "8 мин",
    "tags": ["Возражения", "Продажи"],
    "content": {
      "type": "article",
      "body": "## Техника 1\n\n..."
    }
  }'

# Development
curl -X POST http://localhost:3000/api/lms/items \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "article",
    "title": "Как работать с возражениями",
    "description": "7 техник для менеджеров",
    "targetRole": "manager",
    "readTime": "8 мин",
    "tags": ["Возражения", "Продажи"],
    "content": {
      "type": "article",
      "body": "## Техника 1\n\n..."
    }
  }'
```

#### Обновить материал
```bash
# Production
curl -X PATCH https://api-crm.baza.sale/api/lms/items/art-crm-intro \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Обновленное название",
    "tags": ["CRM", "Лиды", "Новый тег"]
  }'

# Development
curl -X PATCH http://localhost:3000/api/lms/items/art-crm-intro \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Обновленное название",
    "tags": ["CRM", "Лиды", "Новый тег"]
  }'
```

#### Удалить материал
```bash
# Production
curl -X DELETE https://api-crm.baza.sale/api/lms/items/art-crm-intro \
  -H "Authorization: Bearer $JWT_TOKEN"

# Development
curl -X DELETE http://localhost:3000/api/lms/items/art-crm-intro \
  -H "Authorization: Bearer $JWT_TOKEN"
```

---

### 8.2 Курсы (Courses)

#### Получить все курсы
```bash
# Production
curl -X GET https://api-crm.baza.sale/api/lms/courses \
  -H "Authorization: Bearer $JWT_TOKEN"

# Development
curl -X GET http://localhost:3000/api/lms/courses \
  -H "Authorization: Bearer $JWT_TOKEN"
```

#### Создать курс
```bash
# Production
curl -X POST https://api-crm.baza.sale/api/lms/courses \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Онбординг менеджера",
    "description": "Базовый курс для новых сотрудников",
    "targetRoles": ["manager"],
    "emoji": "🎯",
    "itemIds": ["art-1", "script-1", "pres-1"],
    "finalQuiz": {
      "passingScore": 70,
      "questions": [
        {
          "question": "Через сколько минут звонить новому лиду?",
          "options": ["30 минут", "15 минут", "1 час"],
          "correct": 1
        }
      ]
    }
  }'

# Development
curl -X POST http://localhost:3000/api/lms/courses \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Онбординг менеджера",
    "description": "Базовый курс для новых сотрудников",
    "targetRoles": ["manager"],
    "emoji": "🎯",
    "itemIds": ["art-1", "script-1", "pres-1"],
    "finalQuiz": {
      "passingScore": 70,
      "questions": [
        {
          "question": "Через сколько минут звонить новому лиду?",
          "options": ["30 минут", "15 минут", "1 час"],
          "correct": 1
        }
      ]
    }
  }'
```

#### Обновить курс
```bash
# Production
curl -X PATCH https://api-crm.baza.sale/api/lms/courses/course-manager-base \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Обновленный курс менеджера",
    "itemIds": ["art-1", "script-1", "art-2"]
  }'

# Development
curl -X PATCH http://localhost:3000/api/lms/courses/course-manager-base \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Обновленный курс менеджера",
    "itemIds": ["art-1", "script-1", "art-2"]
  }'
```

#### Удалить курс
```bash
# Production
curl -X DELETE https://api-crm.baza.sale/api/lms/courses/course-manager-base \
  -H "Authorization: Bearer $JWT_TOKEN"

# Development
curl -X DELETE http://localhost:3000/api/lms/courses/course-manager-base \
  -H "Authorization: Bearer $JWT_TOKEN"
```

---

### 8.3 Прогресс (Progress)

#### Получить прогресс текущего пользователя
```bash
# Production
curl -X GET https://api-crm.baza.sale/api/lms/progress \
  -H "Authorization: Bearer $JWT_TOKEN"

# Development
curl -X GET http://localhost:3000/api/lms/progress \
  -H "Authorization: Bearer $JWT_TOKEN"
```

#### Обновить прогресс по курсу
```bash
# Production
curl -X PUT https://api-crm.baza.sale/api/lms/progress/course-manager-base \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "completedItems": ["art-crm-intro", "script-first-call", "pres-product-knowledge"],
    "finalQuizPassed": true,
    "finalQuizScore": 75
  }'

# Development
curl -X PUT http://localhost:3000/api/lms/progress/course-manager-base \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "completedItems": ["art-crm-intro", "script-first-call", "pres-product-knowledge"],
    "finalQuizPassed": true,
    "finalQuizScore": 75
  }'
```

#### Сбросить прогресс
```bash
# Production
curl -X DELETE https://api-crm.baza.sale/api/lms/progress/course-manager-base \
  -H "Authorization: Bearer $JWT_TOKEN"

# Development
curl -X DELETE http://localhost:3000/api/lms/progress/course-manager-base \
  -H "Authorization: Bearer $JWT_TOKEN"
```

---

### 8.4 Файлы (Files)

#### Загрузить PDF
```bash
# Production
curl -X POST https://api-crm.baza.sale/api/files \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -F "file=@presentation.pdf" \
  -F "purpose=lms" \
  -F "entityType=lms"

# Development
curl -X POST http://localhost:3000/api/files \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -F "file=@presentation.pdf" \
  -F "purpose=lms" \
  -F "entityType=lms"
```

#### Загрузить обложку (изображение)
```bash
# Production
curl -X POST https://api-crm.baza.sale/api/files \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -F "file=@cover.jpg" \
  -F "purpose=cover" \
  -F "entityType=lms"

# Development
curl -X POST http://localhost:3000/api/files \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -F "file=@cover.jpg" \
  -F "purpose=cover" \
  -F "entityType=lms"
```

#### Получить файл (для отображения)
```bash
# Прямая ссылка (из ответа upload)
GET https://cdn.baza.sale/lms/files/{fileId}.pdf

# Или через API (если файл приватный)
GET https://api-crm.baza.sale/api/files/{fileId}
Authorization: Bearer $JWT_TOKEN
```

---

### 8.5 Аутентификация

#### Получить JWT токен
```bash
# Production
curl -X POST https://api-crm.baza.sale/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@baza.sale",
    "password": "your_password"
  }'

# Development
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@baza.sale",
    "password": "your_password"
  }'
```

---

## 9. Ошибки и HTTP статусы

### HTTP статус-коды

| HTTP | Описание | Когда |
|------|----------|-------|
| 200 | OK | Успешное обновление/получение |
| 201 | Created | Успешное создание |
| 204 | No Content | Успешное удаление (опционально) |
| 400 | Bad Request | Ошибка валидации входных данных |
| 401 | Unauthorized | Не передан или невалидный JWT |
| 403 | Forbidden | Нет прав на операцию |
| 404 | Not Found | Ресурс не найден |
| 409 | Conflict | Конфликт (дубликат и т.д.) |
| 413 | Payload Too Large | Файл слишком большой (>50 МБ) |
| 415 | Unsupported Media Type | Неподдерживаемый тип файла |
| 422 | Unprocessable Entity | Семантическая ошибка в данных |
| 429 | Too Many Requests | Rate limit превышен |
| 500 | Internal Server Error | Внутренняя ошибка сервера |

### Коды ошибок (business logic)

| Код | Описание |
|-----|----------|
| VALIDATION_ERROR | Ошибка валидации входных данных |
| NOT_FOUND | Ресурс не найден |
| UNAUTHORIZED | Не аутентифицирован |
| FORBIDDEN | Нет прав |
| ALREADY_EXISTS | Ресурс уже существует |
| DEPENDENCY_ERROR | Ошибка связанного ресурса |
| FILE_TOO_LARGE | Файл превышает максимальный размер |
| INVALID_FILE_TYPE | Неподдерживаемый тип файла |
| INTERNAL_ERROR | Внутренняя ошибка сервера |

### Формат ошибки

```json
{
  "success": false,
  "message": "Человеко-читаемое описание",
  "error": {
    "code": "VALIDATION_ERROR",
    "details": {
      "field": "title",
      "message": "Название обязательно"
    }
  }
}
```

---

## 9.5 Rate Limiting

### Рекомендуемые лимиты

| Эндпоинт | Лимит | Период |
|----------|-------|--------|
| `GET /api/lms/*` | 100 запросов | 1 минута |
| `POST /api/lms/*` | 30 запросов | 1 минута |
| `PATCH /api/lms/*` | 30 запросов | 1 минута |
| `DELETE /api/lms/*` | 10 запросов | 1 минута |
| `POST /api/files` | 10 запросов | 1 минута |

### Headers ответа

```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1719139200
```

При превышении лимита — ответ `429 Too Many Requests`.

---

## 9.6 Пагинация (опционально)

### Запрос с пагинацией

```
GET /api/lms/items?page=1&limit=20
```

### Ответ с пагинацией

```json
{
  "success": true,
  "data": {
    "items": [...],
    "total": 150,
    "page": 1,
    "limit": 20,
    "totalPages": 8
  }
}
```

### Параметры запроса

| Параметр | По умолчанию | Описание |
|----------|--------------|----------|
| `page` | 1 | Номер страницы |
| `limit` | 20 | Количество элементов на странице |
| `sortBy` | `createdAt` | Поле для сортировки |
| `sortOrder` | `desc` | Порядок сортировки (`asc` / `desc`) |

---

## 10. Совместимость с фронтендом

Фронтенд (`src/services/lmsApi.ts`) уже реализован и ожидает:

1. **Ответы в формате** `{ success: boolean, data: T }` — стандарт проекта
2. **JWT аутентификацию** через заголовок `Authorization: Bearer <token>`
3. **ID материалов и курсов** — строки (string), не числа
4. **Полиморфный JSON** в поле `content` — фронт определяет тип по `content.type`

При поднятии бэкенда фронт автоматически переключится с моков на серверные данные без изменений в коде (см. `useLms.ts:26-48`).

---

## 11. Рекомендации

### Хранение контента

| Тип | Хранение | Примечание |
|-----|----------|------------|
| **Статьи** | Markdown как текст | В поле `content.body` |
| **Видео** | URL (YouTube/Vimeo) | Файл НЕ загружается, только URL |
| **PDF** | S3 + URL в БД | Требует CORS + inline disposition |
| **Обложки** | S3 + URL в БД | PNG/JPG/WEBP, public access |
| **Презентации** | JSON со слайдами | `{ title, body }[]` |
| **Скрипты** | JSON с репликами | `{ speaker, text }[]` |
| **Тесты** | JSON с вопросами | `{ question, options[], correct }[]` |

### Индексы

- `lms_items.type` — для фильтрации по типу
- `lms_items.target_role` — для фильтрации по роли
- `lms_items.title + description` — FULLTEXT для поиска
- `lms_courses.target_roles` — для фильтрации по ролям
- `lms_progress.user_id + course_id` — уникальный индекс

### Безопасность

- Все эндпоинты требуют JWT
- Загрузка файлов: валидация MIME-типа и размера
- SQL-инъекции: использовать параметризованные запросы
- XSS: экранировать Markdown при рендеринге (на стороне фронтенда)