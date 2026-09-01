# Floor Plans & Installment Data — Collections & Data Flow

## 1. Floor Plans (Планировки этажей)

The floor plan data shown on the building page (like "Планировки этажей" with images per floor) comes from **two sources**, both stored on the `estatebuildings` collection and populated at query time.

### Collections Involved

| # | Collection | Schema | Role |
|---|---|---|---|
| 1 | `estatebuildings` | `EstateBuilding` | Holds references to floor plan files and structured data |
| 2 | `floor-plans-data` | `FloorPlansData` | Structured per-floor metadata (floor number, image, apartment polygons) |
| 3 | `cdn_files` | `CdnFile` | Stores actual image URLs for floor plan images |

### How It Works

#### A) `floorPlansFiles` — Simple floor plan images

The `EstateBuilding` schema has:

```typescript
@Prop({ type: [SchemaTypes.ObjectId], ref: CdnFile.name, required: false })
floorPlansFiles: Types.ObjectId[];
```

This is a simple array of CdnFile references — each one is a floor plan image uploaded to CDN. When populated, you get an array of `{ _id, name, type, url }` objects.

#### B) `floorPlansData` — Structured floor plan data (used for interactive maps)

The `EstateBuilding` schema has:

```typescript
@Prop({ type: [SchemaTypes.ObjectId], ref: FloorPlansData.name, required: false })
floorPlansData: Types.ObjectId[];
```

Each `FloorPlansData` document in the `floor-plans-data` collection contains:

| Field | Type | Description |
|---|---|---|
| `buildingId` | ObjectId → EstateBuilding | Which building this floor plan belongs to |
| `floorNum` | string | Floor number (e.g. "3", "8", "4") |
| `imageId` | ObjectId → CdnFile | Floor plan image file |
| `apartments` | string[] | Array of apartment data strings (aptNum, status, polygon coordinates) |
| `createdAt` | Date | Creation timestamp |

### Data Flow

```
GET /newconstructions/public/estates/:estateId/full
│
├─ Fetch buildings: estateBuildingModel.find({ estate: estateId })
│     ├─ .populate('floorPlansFiles')   → cdn_files (image URLs)
│     └─ .populate('floorPlansData')    → floor-plans-data (structured per-floor data)
│
└─ Response per building:
     {
       "floorPlansFiles": [
         { "_id": "...", "name": "floor3.png", "type": "image/png", "url": "https://cdn..." }
       ],
       "floorPlansData": [
         {
           "_id": "...",
           "buildingId": "...",
           "floorNum": "3",
           "imageId": "...",
           "apartments": ["301|active|x1,y1,x2,y2...", "302|sold|x1,y1..."]
         }
       ]
     }
```

### How Floor Plans Are Created/Updated

The `updateFloorMap` method in `EstateBuildingService` upserts a `FloorPlansData` entry:

1. Finds or creates a `FloorPlansData` doc for the given `buildingId` + `floorNum`
2. Sets the `imageId` (CDN image reference)
3. Optionally sets `apartments` array (polygon data for interactive floor maps)
4. Adds the entry ID to the building's `floorPlansData` array via `$addToSet`

---

## 2. Installment Data (Условия рассрочки)

The installment/payment plan data shown on the estate page (table with "Тип", "Первый взнос", "Срок") is stored directly on the `estates` collection.

### Collection Involved

| # | Collection | Schema | Role |
|---|---|---|---|
| 1 | `estates` | `Estate` | Holds all installment plan fields directly |

### Fields on the `estates` Collection

There are **two groups** of installment fields:

#### A) Legacy single installment plan fields

| Field | Type | Description | Example |
|---|---|---|---|
| `installmentProcent` | number | Interest rate percentage | `0` (0% interest) |
| `installmentFirstPayment` | number | Minimum first payment amount | `10` (10%) |
| `installmentPeriod` | string | Duration of installment plan | `"27 мес."` |

#### B) Structured installment data (multiple plans)

| Field | Type | Description | Example |
|---|---|---|---|
| `installmentsData` | string[] | Array of installment plan entries as JSON strings | See below |

The `installmentsData` field is a `string[]` where each string represents one installment plan row. This is what renders the table:

| Тип | Первый взнос | Срок |
|---|---|---|
| Ежемесячный | 10% | 27 мес. |

Each entry in the array encodes one row of the installment conditions table (type, first payment percentage, term duration).

### Data Flow

```
GET /newconstructions/public/estates/:estateId/full
│
├─ Fetch estate: estateModel.findById(estateId)
│
└─ Response:
     {
       "estate": {
         "installmentProcent": 0,
         "installmentFirstPayment": 10,
         "installmentPeriod": "27 мес.",
         "installmentsData": [
           "Ежемесячный|10|27 мес."
         ],
         ...
       }
     }
```

### How Installment Data Is Set

Installment data is set when creating or updating an estate via:
- `POST /newconstructions` (create estate) — `CreateNewconstructionDto`
- `PUT /newconstructions/:id` (update estate) — `UpdateNewconstructionDto`

Both DTOs accept:
```typescript
installmentProcent?: number;
installmentFirstPayment?: number;
installmentPeriod?: string;
installmentsData?: string[];   // array of plan entries
```

---

## Summary Table

| Feature | Collection(s) | Key Fields | Populated From |
|---|---|---|---|
| Floor plan images | `estatebuildings` + `cdn_files` | `floorPlansFiles` | CdnFile (url, name) |
| Floor plan structured data | `estatebuildings` + `floor-plans-data` + `cdn_files` | `floorPlansData` → `floorNum`, `imageId`, `apartments` | FloorPlansData → CdnFile |
| Installment plans | `estates` | `installmentsData`, `installmentProcent`, `installmentFirstPayment`, `installmentPeriod` | Direct fields (no population) |

