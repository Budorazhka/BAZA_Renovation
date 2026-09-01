# Спецификация бэкенда: Модуль LMS (Обучение и база знаний)

**Версия**: 2.0  
**Дата**: 2026-06-23  
**Статус**: Готов к реализации  
**Основа**: Строго по коду фронтенда

---

## 1. Конфигурация окружения

### Frontend (.env / .env.local)

```bash
# Основной CRM API (все LMS эндпоинты идут сюда)
VITE_CRM_API_BASE_URL=http://localhost:3000          # Development
VITE_CRM_API_BASE_URL=https://api-crm.baza.sale      # Production

# Или общая переменная
VITE_API_BASE_URL=http://localhost:3000
```


---

## 2. Базовый URL и аутентификация

### URLs

| Окружение | Base URL |
|-----------|----------|
| **Production** | `https://api-crm.baza.sale` |
| **Development** | `http://localhost:3000` |
| **Env Variable** | `VITE_CRM_API_BASE_URL` |

### Аутентификация

```
Authorization: Bearer <jwt_token>
Content-Type: application/json
```

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

---

## 3. Формат ответов

### Стандартный формат (из `developmentApi.ts`)

```typescript
interface ApiResponse<T> {
  success: boolean;
  data: T;
  message?: string;
}
```

### Примеры

#### Успех (массив)
```json
{
  "success": true,
  "data": [...]
}
```

#### Успех (объект)
```json
{
  "success": true,
  "data": { "id": "uuid", ... }
}
```

#### Удаление
```json
{
  "success": true,
  "data": {
    "deleted": true
  }
}
```

#### Ошибка
```json
{
  "success": false,
  "message": "Описание ошибки"
}
```

---

## 4. Модели данных (строго по коду фронта)

### 4.1 ContentType

```typescript
type ContentType = 'article' | 'video' | 'script' | 'quiz' | 'presentation' | 'pdf'
```

> **ВАЖНО**: Фронт поддерживает ТОЛЬКО эти 6 типов. Больше никаких.

### 4.2 TargetRole

```typescript
type TargetRole = 'all' | 'manager' | 'rop' | 'director'
```

### 4.3 Типы контента (из `lms-mock.ts`)

```typescript
// Статья
interface ArticleContent {
  type: 'article'
  body: string                  // Markdown текст
}

// Видео (ТОЛЬКО URL, файл НЕ загружается)
interface VideoContent {
  type: 'video'
  url: string                   // YouTube/Vimeo URL
  description?: string
}

// Скрипт (диалог менеджер-клиент)
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
    correct: number             // Индекс правильного ответа (0-based)
  }>
}

// Презентация (слайды, хранятся как JSON)
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
```

### 4.4 LMSItem (Материал)

```typescript
// Точные поля из lms-mock.ts:26-35
interface LMSItem {
  id: string                    // string (не число!)
  type: ContentType
  title: string
  description: string
  targetRole: TargetRole
  readTime?: string             // Например "5 мин"
  tags?: string[]               // Массив строк
  content: ArticleContent | VideoContent | ScriptContent | QuizContent | PresentationContent | PdfContent
}
```

> **ВАЖНО**: Полей `coverUrl`, `createdAt`, `updatedAt` в `LMSItem` НЕТ. Это чисто серверные поля.

### 4.5 LMSCourse (Курс)

```typescript
// Точные поля из lms-mock.ts:45-53
interface LMSCourse {
  id: string                    // string (не число!)
  title: string
  description: string
  targetRoles: TargetRole[]     // Массив ролей
  emoji: string                 // Эмодзи "🎯"
  itemIds: string[]             // ID материалов (порядок = программа)
  finalQuiz?: LMSCourseFinalQuiz
}
```

### 4.6 LMSCourseFinalQuiz

```typescript
interface LMSCourseFinalQuiz {
  passingScore: number          // 0-100 (%)
  questions: QuizContent['questions']  // Тот же формат что и в QuizContent
}
```

### 4.7 Прогресс (из `lmsApi.ts:53-59`)

```typescript
interface LMSProgressEntry {
  completedItems: string[]      // ID пройденных материалов
  finalQuizPassed?: boolean
  finalQuizScore?: number       // 0-100
}

type LMSProgressMap = Record<string, LMSProgressEntry>  // courseId → запись
```

### 4.8 FileEntity (из `developmentApi.ts:41-48`)

```typescript
interface FileEntity {
  id: string
  name: string                  // Имя файла
  mimeType: string              // MIME-тип
  size: number                  // Размер в байтах
  url: string                   // Постоянная ссылка для скачивания/отображения
  createdAt: string             // ISO datetime
}
```

> **ВАЖНО**: Полей `originalName`, `purpose`, `entityType` в ответе НЕТ. Они передаются только в запросе.

---

## 5. API Эндпоинты

### 5.1 Материалы (Items)

#### GET /api/lms/items
Получить все материалы.

**Response**: `200 OK`
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
      }
    }
  ]
}
```

---

#### POST /api/lms/items
Создать новый материал.

**Request**:
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
  }
}
```

**Response**: `201 Created`
```json
{
  "success": true,
  "data": {
    "id": "generated-uuid",
    "type": "article",
    "title": "Новый материал",
    "description": "Описание",
    "targetRole": "manager",
    "readTime": "5 мин",
    "tags": ["тег1", "тег2"],
    "content": {
      "type": "article",
      "body": "## Заголовок\n\nТекст статьи..."
    }
  }
}
```

---

#### PATCH /api/lms/items/:id
Обновить материал (частичное обновление).

**Request**:
```json
{
  "title": "Обновленное название",
  "tags": ["новый тег"]
}
```

**Response**: `200 OK`
```json
{
  "success": true,
  "data": { /* обновленный материал */ }
}
```

---

#### DELETE /api/lms/items/:id
Удалить материал.

**Response**:
```json
{
  "success": true,
  "data": {
    "deleted": true
  }
}
```

---

### 5.2 Курсы (Courses)

#### GET /api/lms/courses
Получить все курсы.

**Response**: `200 OK`
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
      "itemIds": ["art-crm-intro", "script-first-call"],
      "finalQuiz": {
        "passingScore": 70,
        "questions": [
          {
            "question": "Вопрос?",
            "options": ["Ответ 1", "Ответ 2", "Ответ 3"],
            "correct": 1
          }
        ]
      }
    }
  ]
}
```

---

#### POST /api/lms/courses
Создать новый курс.

**Request**:
```json
{
  "title": "Новый курс",
  "description": "Описание курса",
  "targetRoles": ["manager"],
  "emoji": "🎯",
  "itemIds": ["art-1", "script-1", "pres-1"],
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

**Response**: `201 Created`

---

#### PATCH /api/lms/courses/:id
Обновить курс (частичное обновление).

**Request**:
```json
{
  "title": "Обновленный курс",
  "itemIds": ["art-1", "script-1", "art-2"]
}
```

**Response**: `200 OK`

---

#### DELETE /api/lms/courses/:id
Удалить курс.

**Response**:
```json
{
  "success": true,
  "data": {
    "deleted": true
  }
}
```

---

### 5.3 Прогресс (Progress)

#### GET /api/lms/progress
Получить прогресс текущего пользователя по всем курсам.

**Response**: `200 OK`
```json
{
  "success": true,
  "data": {
    "course-manager-base": {
      "completedItems": ["art-crm-intro", "script-first-call"],
      "finalQuizPassed": false,
      "finalQuizScore": null
    }
  }
}
```

---

#### PUT /api/lms/progress/:courseId
Создать или обновить прогресс по курсу (upsert).

**Request**:
```json
{
  "completedItems": ["art-crm-intro", "script-first-call"],
  "finalQuizPassed": true,
  "finalQuizScore": 75
}
```

**Response**: `200 OK`
```json
{
  "success": true,
  "data": {
    "completedItems": ["art-crm-intro", "script-first-call"],
    "finalQuizPassed": true,
    "finalQuizScore": 75
  }
}
```

---

#### DELETE /api/lms/progress/:courseId
Сбросить прогресс пользователя по курсу.

**Response**:
```json
{
  "success": true,
  "data": {
    "deleted": true
  }
}
```

---

### 5.4 Файлы (Files)

#### POST /api/files
Загрузить файл (multipart/form-data).

**Request** (FormData):
```
file: <binary>
purpose: "lms"          # Опционально, по умолчанию "lms"
entityType: "lms"       # Опционально
```

**Response**: `200 OK`
```json
{
  "success": true,
  "data": {
    "id": "file-uuid",
    "name": "presentation.pdf",
    "mimeType": "application/pdf",
    "size": 1024000,
    "url": "https://cdn.baza.sale/lms/files/file-uuid.pdf",
    "createdAt": "2026-01-15T10:00:00Z"
  }
}
```

> **ВАЖНО**: Фронт использует только поле `url` из ответа.

---

## 6. Файлы: что загружается и как отображается

### 6.1 Что загружается на сервер

| Тип | Куда загружается | Accept в HTML | Purpose |
|-----|------------------|---------------|---------|
| **Обложка** | `/api/files` | `image/*` | `cover` |
| **PDF** | `/api/files` | `application/pdf` | `lms` |

> **Видео НЕ загружается** — только URL YouTube/Vimeo.

### 6.2 Что НЕ загружается (только URL)

| Тип | Формат URL | Пример |
|-----|------------|--------|
| **Видео** | YouTube/Vimeo | `https://www.youtube.com/watch?v=xxx` |

### 6.3 Поддерживаемые форматы обложек

```html
<!-- Из LMSAdminDialog.tsx:484 -->
<input type="file" accept="image/*" />
```

Отображается подсказка: `PNG, JPG, WEBP`

### 6.4 Поддерживаемые форматы PDF

```html
<!-- Из LMSAdminDialog.tsx:579 -->
<input type="file" accept="application/pdf" />
```

Отображается подсказка: `PDF до 50 МБ`

### 6.5 Как отображается на фронте

| Тип | Элемент | Код |
|-----|---------|-----|
| **Обложка** | `<img src={url}>` | `LMSAdminDialog.tsx:498` |
| **PDF** | `<iframe src={url}#toolbar=1>` | `viewers.tsx:167` |
| **Видео** | `<iframe src={toEmbedUrl(url)}>` | `viewers.tsx:148-153` |

### 6.6 Конвертация URL видео

Функция `toEmbedUrl` в `viewers.tsx:135-142`:

```typescript
function toEmbedUrl(raw: string): string {
  if (!raw) return raw
  // YouTube watch URL → embed
  const yt = raw.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([\w-]+)/)
  if (yt) return `https://www.youtube.com/embed/${yt[1]}`
  // Vimeo URL → embed
  const vimeo = raw.match(/vimeo\.com\/(\d+)/)
  if (vimeo) return `https://player.vimeo.com/video/${vimeo[1]}`
  // Уже embed или другой формат — как есть
  return raw
}
```

### 6.7 Требования к URL файлов для отображения

#### Для обложек (`<img>`)
```
Content-Type: image/jpeg | image/png | image/webp
CORS: Access-Control-Allow-Origin: *
```

#### Для PDF (`<iframe>`)
```
Content-Type: application/pdf
Content-Disposition: inline; filename="doc.pdf"
CORS: Access-Control-Allow-Origin: *
```

> **КРИТИЧНО**: Если `Content-Disposition: attachment`, браузер скачает PDF вместо отображения в iframe.

---

## 7. Логика фронт-фоллбэка

### 7.1 Переключение между сервером и моками

Из `useLms.ts:26-48`:

```typescript
// При запуске:
try {
  const [serverItems, serverCourses] = await Promise.all([
    lmsApi.getItems(),      // GET /api/lms/items
    lmsApi.getCourses(),    // GET /api/lms/courses
  ])
  backendUp.current = true  // Сервер доступен
  setItems(serverItems)
  setCourses(serverCourses)
} catch {
  backendUp.current = false // Сервер недоступен — остаёмся на моках
}
```

### 7.2 Запись при фоллбэке

```typescript
// Если backendUp.current === true — пишем на сервер
// Если backendUp.current === false — пишем только в стейт (локально)
const createItem = useCallback(async (item: LMSItem) => {
  if (backendUp.current) {
    const created = await lmsApi.createItem(withoutId(item))
    setItems(prev => [...prev, created])
  } else {
    setItems(prev => [...prev, item])
  }
}, [])
```

### 7.3 Прогресс: localStorage + сервер

Из `progress.ts`:

1. Прогресс **всегда** пишется в `localStorage` (мгновенный кэш)
2. **Параллельно** отправляется на сервер (fire-and-forget)
3. При загрузке страницы — прогресс **тянется с сервера** и сливается с localStorage

```typescript
// Запись прогресса
function setItemCompleted(courseId: string, itemId: string, done: boolean) {
  const map = readMap()                    // Читаем localStorage
  const entry = { ...cur, completedItems }
  map[courseId] = entry
  writeMap(map)                            // Пишем в localStorage
  pushCourse(courseId, entry)              // Отправляем на сервер (fire-and-forget)
}
```

---

## 8. База данных

### 8.1 Таблица `lms_items`

```sql
CREATE TABLE lms_items (
  id VARCHAR(36) PRIMARY KEY,
  type VARCHAR(20) NOT NULL,
  title VARCHAR(200) NOT NULL,
  description TEXT NOT NULL,
  target_role VARCHAR(20) NOT NULL DEFAULT 'all',
  read_time VARCHAR(20),
  tags JSON,
  content JSON NOT NULL,
  cover_url TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  INDEX idx_type (type),
  INDEX idx_target_role (target_role),
  FULLTEXT INDEX idx_search (title, description)
);
```

### 8.2 Таблица `lms_courses`

```sql
CREATE TABLE lms_courses (
  id VARCHAR(36) PRIMARY KEY,
  title VARCHAR(200) NOT NULL,
  description TEXT NOT NULL,
  target_roles JSON NOT NULL,
  emoji VARCHAR(10) DEFAULT '🎯',
  item_ids JSON NOT NULL,
  final_quiz JSON,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  INDEX idx_target_roles (target_roles(50))
);
```

### 8.3 Таблица `lms_progress`

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

### 8.4 Таблица `files`

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

## 9. Бизнес-логика

### 9.1 Фильтрация материалов по ролям

Фронт фильтрует на клиенте (`LMSPage.tsx:407-421`):

```typescript
// Менеджер видит: manager + all
if (userRole === 'manager' && item.targetRole !== 'all' && item.targetRole !== 'manager') return false

// РОП видит: rop + manager + all
if (userRole === 'rop' && item.targetRole !== 'all' && item.targetRole !== 'rop' && item.targetRole !== 'manager') return false
```

> Бэкенд может вернуть все материалы — фронт сам отфильтрует.

### 9.2 Каскадное удаление

**При удалении курса:**
1. Удалить все записи `lms_progress` для этого курса
2. НЕ удалять материалы (они могут быть в других курсах)

**При удалении материала:**
1. Убрать ID из `itemIds` во всех курсах
2. Убрать из `completedItems` в прогрессе всех пользователей
3. Удалить связанные файлы (обложка, PDF)

---

## 10. Примеры запросов (cURL)

### Получить все материалы
```bash
# Production
curl -X GET https://api-crm.baza.sale/api/lms/items \
  -H "Authorization: Bearer $JWT_TOKEN"

# Development
curl -X GET http://localhost:3000/api/lms/items \
  -H "Authorization: Bearer $JWT_TOKEN"
```

### Создать материал
```bash
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
```

### Создать курс
```bash
curl -X POST https://api-crm.baza.sale/api/lms/courses \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Онбординг менеджера",
    "description": "Базовый курс",
    "targetRoles": ["manager"],
    "emoji": "🎯",
    "itemIds": ["art-1", "script-1"],
    "finalQuiz": {
      "passingScore": 70,
      "questions": [
        {
          "question": "Через сколько минут звонить?",
          "options": ["30 минут", "15 минут", "1 час"],
          "correct": 1
        }
      ]
    }
  }'
```

### Обновить прогресс
```bash
curl -X PUT https://api-crm.baza.sale/api/lms/progress/course-manager-base \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "completedItems": ["art-1", "script-1"],
    "finalQuizPassed": true,
    "finalQuizScore": 75
  }'
```

### Загрузить обложку
```bash
curl -X POST https://api-crm.baza.sale/api/files \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -F "file=@cover.jpg" \
  -F "purpose=cover" \
  -F "entityType=lms"
```

### Загрузить PDF
```bash
curl -X POST https://api-crm.baza.sale/api/files \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -F "file=@presentation.pdf" \
  -F "purpose=lms" \
  -F "entityType=lms"
```

---

## 12. ГLOSSARY

| Термин | Описание |
|--------|----------|
| **LMSItem** | Материал (статья, скрипт, видео, тест, презентация, PDF) |
| **LMSCourse** | Упорядоченный сборник материалов + опциональный тест |
| **Progress** | Прогресс пользователя по конкретному курсу |
| **ContentType** | Тип контента: article, video, script, quiz, presentation, pdf |
| **TargetRole** | Целевая роль: all, manager, rop, director |
| **finalQuiz** | Финальный тест курса (не путать с quiz-материалом) |
| **itemIds** | Массив ID материалов в порядке прохождения |
