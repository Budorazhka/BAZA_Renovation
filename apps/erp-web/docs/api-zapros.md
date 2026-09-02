## Общие правила (для всех эндпоинтов ниже)

- **Base URL**: `{{BASE}}` (используется префикс `/api/development`)
- **Auth**: `Authorization: Bearer <jwt>`
- **Response envelope**:

```ts
// success
{ success: true, data: T }

// error
{ success: false, message: string, errors?: Array<{ field: string; message: string }> }
```

- **Pagination (для списков)**:

```ts
{ success: true, data: { items: T[]; total: number; page: number; totalPages: number } }
```

---

## 1) Enums

### GET `/development/enums`
**Description**: справочники для фронта (чтобы не хардкодить статусы/типы)

- **Headers**: `Authorization: Bearer <jwt>`
- **200**:

```ts
{
  success: true,
  data: {
    projectStatus: Array<'draft' | 'active' | 'archived'>;
    complexStatus: Array<'draft' | 'active' | 'archived'>;
    complexClass: Array<'econom' | 'comfort' | 'business' | 'premium' | 'elite'>;
    unitStatus: Array<'available' | 'reserved' | 'sold' | 'hidden'>;
    unitFinishing: Array<'none' | 'basic' | 'whitebox' | 'designer' | 'unknown'>;
    unitWindowsSide: Array<'yard' | 'street' | 'mixed' | 'unknown'>;
    documentType: Array<'presentation' | 'kp'>;
    documentScope: Array<'project' | 'complex' | 'layout' | 'unit'>;
  }
}
```

---

## 2) Buildings / Sections

### GET `/development/complexes/{complexId}/buildings`
**Description**: список корпусов для ЖК

- **Path params**: `complexId: string`
- **Headers**: `Authorization: Bearer <jwt>`
- **200**:

```ts
{ success: true, data: Building[] }
```

### POST `/development/complexes/{complexId}/buildings`
**Description**: создать корпус в ЖК

- **Path params**: `complexId: string`
- **Headers**: `Authorization: Bearer <jwt>`, `Content-Type: application/json`
- **Body**:

```ts
{ name: string; number?: string }
```

- **200**:

```ts
{ success: true, data: Building }
```

---

### GET `/development/buildings/{buildingId}/sections`
**Description**: список секций для корпуса

- **Path params**: `buildingId: string`
- **Headers**: `Authorization: Bearer <jwt>`
- **200**:

```ts
{ success: true, data: Section[] }
```

### POST `/development/buildings/{buildingId}/sections`
**Description**: создать секцию в корпусе

- **Path params**: `buildingId: string`
- **Headers**: `Authorization: Bearer <jwt>`, `Content-Type: application/json`
- **Body**:

```ts
{ name: string; number?: string }
```

- **200**:

```ts
{ success: true, data: Section }
```

---

## 3) Units (лоты) + атомарный статус

### GET `/development/units`
**Description**: список лотов (пагинация + фильтры)

- **Query params**:

```ts
{
  page?: number;      // default 1
  limit?: number;     // default 20, max 1000 (по договоренности)
  complexId?: string;
  buildingId?: string;
  sectionId?: string;
  floor?: number;
  status?: 'available' | 'reserved' | 'sold' | 'hidden';
  rooms?: number;
  priceFrom?: number;
  priceTo?: number;
  areaFrom?: number;
  areaTo?: number;
  sort?: 'createdAt' | 'updatedAt' | 'price' | 'area' | 'number' | 'floor';
  order?: 'asc' | 'desc';
}
```

- **Headers**: `Authorization: Bearer <jwt>`
- **200 (paged)**:

```ts
{ success: true, data: { items: Unit[]; total: number; page: number; totalPages: number } }
```

---

### GET `/development/units/{unitId}`
**Description**: получить лот по id

- **Path params**: `unitId: string`
- **Query params**: `include?: 'layout'`
- **Headers**: `Authorization: Bearer <jwt>`
- **200**:

```ts
{ success: true, data: Unit & { layout?: Layout } }
```

---

### POST `/development/units`
**Description**: создать лот

- **Headers**: `Authorization: Bearer <jwt>`, `Content-Type: application/json`
- **Body**:

```ts
{
  complexId: string;
  buildingId: string;
  sectionId?: string | null;
  floor: number;
  number: string;

  rooms: number;
  area: number;

  price: number;
  currency: 'RUB';

  status: 'available' | 'reserved' | 'sold' | 'hidden';
  finishing: 'none' | 'basic' | 'whitebox' | 'designer' | 'unknown';
  windowsSide: 'yard' | 'street' | 'mixed' | 'unknown';

  layoutId?: string | null;
}
```

- **200**: `{ success: true, data: Unit }`

---

### PATCH `/development/units/{unitId}`
**Description**: обновить лот (частично)

- **Path params**: `unitId: string`
- **Headers**: `Authorization: Bearer <jwt>`, `Content-Type: application/json`
- **Body**: partial `Unit` (любой поднабор полей из create)
- **200**: `{ success: true, data: Unit }`

---

### PATCH `/development/units/{unitId}/status`
**Description**: атомарное изменение статуса (для брони/продажи)

- **Path params**: `unitId: string`
- **Headers**: `Authorization: Bearer <jwt>`, `Content-Type: application/json`
- **Body**:

```ts
{
  status: 'reserved' | 'available' | 'sold' | 'hidden';
  reason?: string;
  until?: string; // ISO datetime, например "2026-12-31T23:59:59.000Z" (для reserved)
}
```

- **200**: `{ success: true, data: Unit }`

---

### DELETE `/development/units/{unitId}`
**Description**: удалить лот

- **Path params**: `unitId: string`
- **Headers**: `Authorization: Bearer <jwt>`
- **200**:

```ts
{ success: true, data: { deleted: boolean } }
```

---

## 4) Chessboard

### GET `/development/complexes/{complexId}/chessboard`
**Description**: агрегированная шахматка по ЖК (корпуса/секции/этажи/лоты)

- **Path params**: `complexId: string`
- **Headers**: `Authorization: Bearer <jwt>`
- **200**:

```ts
{
  success: true,
  data: {
    complex: { id: string; name: string };
    buildings: Array<{
      id: string;
      name: string;
      number?: string;
      sections: Array<{
        id: string;
        name: string;
        number?: string;
        floors: Array<{
          floor: number;
          units: Unit[];
        }>;
      }>;
    }>;
  }
}
```

---

## 5) Layouts (планировки)

### GET `/development/layouts`
- **Query params**:

```ts
{
  page?: number;
  limit?: number;
  complexId?: string;
  search?: string;
  sort?: 'createdAt' | 'updatedAt' | 'name';
  order?: 'asc' | 'desc';
}
```

- **Headers**: `Authorization: Bearer <jwt>`
- **200 (paged)**: `{ success: true, data: { items: Layout[]; total; page; totalPages } }`

### GET `/development/layouts/{layoutId}`
- **Path params**: `layoutId: string`
- **Headers**: `Authorization: Bearer <jwt>`
- **200**: `{ success: true, data: Layout }`

### POST `/development/layouts`
- **Headers**: `Authorization: Bearer <jwt>`, `Content-Type: application/json`
- **Body**:

```ts
{
  complexId: string;
  buildingId: string;   // layouts are scoped to a building
  name: string;
  rooms: number;        // Студия → 0
  area: number;
  isEuro: boolean;
  planFileId?: string;  // CdnFile _id from the apartment-plans upload
  tags: string[];
}
```

- **200**: `{ success: true, data: Layout }`

### PATCH `/development/layouts/{layoutId}`
- **Headers**: `Authorization: Bearer <jwt>`, `Content-Type: application/json`
- **Body**: partial `Layout`
- **200**: `{ success: true, data: Layout }`

### DELETE `/development/layouts/{layoutId}`
- **Headers**: `Authorization: Bearer <jwt>`
- **200**: `{ success: true, data: { deleted: boolean } }`

### GET `/development/layouts/{layoutId}/units`
- **Headers**: `Authorization: Bearer <jwt>`
- **200**: `{ success: true, data: Unit[] }`

---

## 6) Documents (презентации / КП)

### GET `/development/documents`
- **Query params**:

```ts
{
  page?: number;
  limit?: number;
  type?: 'presentation' | 'kp';
  scope?: 'project' | 'complex' | 'layout' | 'unit';
  projectId?: string;
  complexId?: string;
  layoutId?: string;
  unitId?: string;
}
```

- **Headers**: `Authorization: Bearer <jwt>`
- **200 (paged)**: `{ success: true, data: { items: DevelopmentDocument[]; total; page; totalPages } }`

### GET `/development/documents/{documentId}`
- **Path params**: `documentId: string`
- **Headers**: `Authorization: Bearer <jwt>`
- **200**: `{ success: true, data: DevelopmentDocument }`

### POST `/development/documents`
- **Headers**: `Authorization: Bearer <jwt>`, `Content-Type: application/json`
- **Body**:

```ts
{
  type: 'presentation' | 'kp';
  scope: 'project' | 'complex' | 'layout' | 'unit';

  title: string;
  version?: string;
  language: 'ru' | 'en';

  projectId?: string;
  complexId?: string;
  layoutId?: string;
  unitId?: string;

  fileId: string;
}
```

- **200**: `{ success: true, data: DevelopmentDocument }`

### PATCH `/development/documents/{documentId}`
- **Headers**: `Authorization: Bearer <jwt>`, `Content-Type: application/json`
- **Body**: partial `DevelopmentDocument` (title/version/language/fileId и т.п.)
- **200**: `{ success: true, data: DevelopmentDocument }`

### DELETE `/development/documents/{documentId}`
- **Headers**: `Authorization: Bearer <jwt>`
- **200**: `{ success: true, data: { deleted: boolean } }`

### GET `/development/documents/{documentId}/download`
**Description**: получить файл документа

- **Headers**: `Authorization: Bearer <jwt>`
- **200**: binary stream **или**
- **302**: redirect на `file.url`

---

## 7) Files upload

### POST `/files`
**Description**: загрузка файлов (обложки/планировки/документы)

- **Headers**: `Authorization: Bearer <jwt>`
- **Content-Type**: `multipart/form-data`
- **Form fields**:
  - `file: File` (binary)
  - `purpose: 'project_cover' | 'layout_image' | 'development_document'`
  - `entityType?: 'project' | 'complex' | 'layout' | 'unit' | 'document'`
  - `entityId?: string`
- **200**:

```ts
{ success: true, data: FileEntity }
```

---

## Модели (кратко)

```ts
type ProjectStatus = 'draft'|'active'|'archived'
type ComplexStatus = 'draft'|'active'|'archived'
type ComplexClass = 'econom'|'comfort'|'business'|'premium'|'elite'
type UnitStatus = 'available'|'reserved'|'sold'|'hidden'

type FileEntity = { id: string; name: string; mimeType: string; size: number; url: string; createdAt: string }

type Project = { id: string; name: string; slug: string; status: ProjectStatus; description?: string; cover?: FileEntity; location?: { address?: string; lat?: number; lng?: number }; createdAt: string; updatedAt: string }
type Complex = { id: string; projectId: string; name: string; slug: string; status: ComplexStatus; class?: ComplexClass; construction?: { startDate?: string; endDate?: string }; createdAt: string; updatedAt: string }
type Building = { id: string; complexId: string; name: string; number?: string; createdAt: string; updatedAt: string }
type Section = { id: string; buildingId: string; name: string; number?: string; createdAt: string; updatedAt: string }
type Unit = { id: string; complexId: string; buildingId: string; sectionId?: string|null; floor: number; number: string; rooms: number; area: number; price: number; currency: 'RUB'; status: UnitStatus; finishing: string; windowsSide: string; layoutId?: string|null; createdAt: string; updatedAt: string }
type Layout = { id: string; complexId: string; name: string; rooms: number; area: number; isEuro: boolean; plan?: FileEntity; tags: string[]; createdAt: string; updatedAt: string }
type DevelopmentDocument = { id: string; type: 'presentation'|'kp'; scope: 'project'|'complex'|'layout'|'unit'; projectId?: string; complexId?: string; layoutId?: string; unitId?: string; title: string; version?: string; language: 'ru'|'en'; file: FileEntity; createdAt: string; updatedAt: string }
```
