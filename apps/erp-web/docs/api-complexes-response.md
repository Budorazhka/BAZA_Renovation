# API: GET /api/development/complexes

**Auth:** JWT Bearer token (from `localStorage.jwt_token`)  
**Method:** GET  
**Base URL:** configured via `CRM_API_BASE_URL`

## Request

| Param     | Type   | Default | Description              |
|-----------|--------|---------|--------------------------|
| page      | number | 1       | Page number              |
| limit     | number | 100     | Items per page           |
| projectId | string | —       | Filter by project ID     |
| status    | string | —       | Filter by status         |
| class     | string | —       | Filter by complex class  |

## Response Structure

```json
{
  "success": true,
  "data": {
    "items": [Complex, ...],
    "total": 42,
    "page": 1,
    "totalPages": 1
  }
}
```

## Complex Object — Expected Fields

### Core / Identity

| Field            | Type     | Required | Description                                    |
|------------------|----------|----------|------------------------------------------------|
| id               | string   | ✅       | Complex unique ID                              |
| projectId        | string   | ✅       | Parent project ID                              |
| name             | string   | ✅       | Complex name (e.g. "ЖК Морской")              |
| slug             | string   | ✅       | URL-friendly slug                              |
| status           | string   | ✅       | `"draft"` / `"active"` / `"archived"`          |
| class            | string   | —        | `"econom"` / `"comfort"` / `"business"` / `"premium"` / `"elite"` |
| createdAt        | string   | ✅       | ISO date                                       |
| updatedAt        | string   | ✅       | ISO date                                       |

### Location

| Field            | Type              | Required | Description                          |
|------------------|-------------------|----------|--------------------------------------|
| country          | string            | —        | Country name (e.g. "Грузия")         |
| city             | string            | —        | City name (e.g. "Батуми")            |
| coastline        | string            | —        | "Первая линия" / "Вторая линия" etc. |
| areaPolygon      | [number,number][] | —        | Polygon coordinates [lat,lng][]      |
| locationCenter   | [number,number]   | —        | Center point [lat,lng]               |

### Developer & Dates

| Field            | Type   | Required | Description                              |
|------------------|--------|----------|------------------------------------------|
| developer        | string | —        | Developer company name                   |
| startDate        | string | —        | Construction start (e.g. "III квартал 2024") |
| completionDate   | string | —        | Planned delivery (e.g. "II квартал 2026")   |
| construction     | object | —        | Legacy: `{ startDate?, endDate? }`       |

### Descriptions

| Field                | Type   | Required | Description                                              |
|----------------------|--------|----------|----------------------------------------------------------|
| description          | string | —        | Main description (concept, architecture, advantages)     |
| descriptionSuccess   | string | —        | Why the project will succeed (location, developer, market) |
| descriptionAudience  | string | —        | Target audience (investors, families, digital nomads)     |

### Property Characteristics

| Field            | Type     | Required | Description                                  |
|------------------|----------|----------|----------------------------------------------|
| propertyType     | string   | —        | "Квартиры" / "Апартаменты" / "Таунхаусы" / "Виллы" |
| wallMaterial     | string   | —        | "Монолит-каркас" / "Монолит-кирпич" etc.    |
| finishTypes      | string[] | —        | ["Черный каркас", "Белый каркас", "С ремонтом", ...] |
| ceilingHeight    | string   | —        | e.g. "3.5 м"                                 |
| elevatorTypes    | string[] | —        | ["Пассажирский", "Грузовой"]                 |
| parkingTypes     | string[] | —        | ["Подземный паркинг", "Наземный паркинг"]    |
| parkingSpots     | number   | —        | Total parking spots count                    |
| viewTypes        | string[] | —        | View types from units                        |

### Infrastructure

| Field                    | Type     | Required | Description                            |
|--------------------------|----------|----------|----------------------------------------|
| hasGas                   | boolean  | —        | Gas availability                       |
| waterSupply              | string   | —        | "Центральное" / "Скважина" / "Нет"     |
| sewerage                 | string   | —        | "Центральная" / "Септик" / "Нет"       |
| buildingPermit           | boolean  | —        | Has building permit                    |
| infrastructureExternal   | string[] | —        | Nearby: ["Школа", "Парк", "Пляж", ...] |
| infrastructureInternal   | string[] | —        | On-site: ["Бассейн", "Охрана 24/7", ...] |
| infrastructureLocation   | string[] | —        | Location traits: ["Первая линия моря", ...] |

### Payment & Terms

| Field            | Type     | Required | Description                                  |
|------------------|----------|----------|----------------------------------------------|
| paymentTypes     | string[] | —        | ["Наличными", "Ипотека"]                     |
| installmentTerms | array    | —        | `[{ type, downPaymentPercent, durationMonths }]` |
| mortgageTerm     | object   | —        | `{ interestRateMin, downPaymentPercent, maxTermYears }` |
| realtorScripts   | array    | —        | `[{ question: string, answer: string }]`     |

### Media

| Field                      | Type                    | Required | Description                          |
|----------------------------|-------------------------|----------|--------------------------------------|
| youtubeLink                | string                  | —        | YouTube video URL                    |
| renders                    | FileEntity[] or string[]| —        | Render images (URLs or file objects)  |
| constructionProgress       | FileEntity[] or string[]| —        | Construction progress photos          |
| coverFileId                | string                  | —        | Cover image file ID                   |
| cover                      | FileEntity              | —        | Cover file entity                     |
| renderFileIds              | string[]                | —        | Render file IDs                       |
| constructionProgressFileIds| string[]                | —        | Progress file IDs                     |

#### FileEntity

```json
{
  "id": "string",
  "name": "string",
  "mimeType": "string",
  "size": 0,
  "url": "string",
  "createdAt": "string"
}
```

---

## Data Flow: API → Card in Project List

```
GET /api/development/complexes
        │
        ▼
  Complex[] (raw API response)
        │
        ▼
  fetchProjects() mapping → IProject[]
        │
        ▼
  ProjectsPage builds ComplexCardData:
    - id           ← _id
    - name         ← name
    - developer    ← developer
    - city         ← city ?? location
    - country      ← country
    - delivery     ← completionDate
    - images       ← renders[]
    - priceFrom    ← computed from allUnits (min pricePerSqm)
    - totalUnits   ← computed from allUnits count
    - freeUnits    ← computed from allUnits (status=free)
    - soldUnits    ← totalUnits - freeUnits
```

## Fields Sent on Create (POST) but NOT Displayed in List Card

These fields are saved to backend but only used on the detail/edit page:

- `descriptionSuccess` — "Почему проект будет успешен"
- `descriptionAudience` — "Целевая аудитория"
- `realtorScripts` — Realtor Q&A scripts
- `wallMaterial`, `finishTypes`, `ceilingHeight`
- `elevatorTypes`, `parkingTypes`, `parkingSpots`
- `hasGas`, `waterSupply`, `sewerage`, `buildingPermit`
- `infrastructureExternal`, `infrastructureInternal`, `infrastructureLocation`
- `paymentTypes`, `installmentTerms`, `mortgageTerm`
- `youtubeLink`, `areaPolygon`
- `constructionProgress`

```
{
  "success": true,
  "data": {
    "complex": {
      "id": "697b6967f6aa509f8f4d3387",
      "name": "Green Cape Botanico"
    },
    "buildings": [
      {
        "id": "697b6cdff6aa509f8f4d36ad",
        "name": "Green Cape Botanico (блок A)",
        "sections": [
          {
            "id": "697b6cdff6aa509f8f4d36ad",
            "name": "Green Cape Botanico (блок A)",
            "floors": [
              {
                "floor": 4,
                "units": [
                  {
                    "id": "69906e0e336fbbb95258322f",
                    "complexId": "697b6967f6aa509f8f4d3387",
                    "buildingId": "697b6cdff6aa509f8f4d36ad",
                    "sectionId": "697b6cdff6aa509f8f4d36ad",
                    "floor": 4,
                    "number": "22",
                    "rooms": 2,
                    "area": 125.59,
                    "price": 389329,
                    "currency": "USD",
                    "status": "available",
                    "finishing": "designer",
                    "windowsSide": "unknown",
                    "layoutId": null,
                    "image": {
                      "id": "69906d46336fbbb9525831e2",
                      "name": "1ap 143.01",
                      "mimeType": "image/png",
                      "size": 0,
                      "url": "https://coasts-cdn.fra1.digitaloceanspaces.com/newconstructions-apartments-plans/686b08b6-92b0-48e2-bb4b-e1fd04413f69.jpg",
                      "createdAt": "2026-02-14T12:40:38.632Z"
                    },
                    "createdAt": "2026-02-14T12:43:58.802Z",
                    "updatedAt": "2026-02-14T12:44:20.611Z"
                  }
                ]
              },
              {
                "floor": 2,
                "units": [
                  {
                    "id": "69906e0e336fbbb95258322e",
                    "complexId": "697b6967f6aa509f8f4d3387",
                    "buildingId": "697b6cdff6aa509f8f4d36ad",
                    "sectionId": "697b6cdff6aa509f8f4d36ad",
                    "floor": 2,
                    "number": "8",
                    "rooms": 2,
                    "area": 134.99,
                    "price": 418469,
                    "currency": "USD",
                    "status": "available",
                    "finishing": "designer",
                    "windowsSide": "unknown",
                    "layoutId": null,
                    "image": {
                      "id": "69906d46336fbbb9525831e0",
                      "name": "8ap 134.99",
                      "mimeType": "image/png",
                      "size": 0,
                      "url": "https://coasts-cdn.fra1.digitaloceanspaces.com/newconstructions-apartments-plans/876a80fb-5720-4f7a-891f-f91742cb43d5.jpg",
                      "createdAt": "2026-02-14T12:40:38.629Z"
                    },
                    "createdAt": "2026-02-14T12:43:58.802Z",
                    "updatedAt": "2026-02-14T12:44:14.894Z"
                  }
                ]
              },
              {
                "floor": 1,
                "units": [
                  {
                    "id": "69906e0e336fbbb95258322d",
                    "complexId": "697b6967f6aa509f8f4d3387",
                    "buildingId": "697b6cdff6aa509f8f4d36ad",
                    "sectionId": "697b6cdff6aa509f8f4d36ad",
                    "floor": 1,
                    "number": "1",
                    "rooms": 2,
                    "area": 143.01,
                    "price": 443331,
                    "currency": "USD",
                    "status": "available",
                    "finishing": "designer",
                    "windowsSide": "unknown",
                    "layoutId": null,
                    "image": {
                      "id": "69906d46336fbbb9525831e2",
                      "name": "1ap 143.01",
                      "mimeType": "image/png",
                      "size": 0,
                      "url": "https://coasts-cdn.fra1.digitaloceanspaces.com/newconstructions-apartments-plans/686b08b6-92b0-48e2-bb4b-e1fd04413f69.jpg",
                      "createdAt": "2026-02-14T12:40:38.632Z"
                    },
                    "createdAt": "2026-02-14T12:43:58.801Z",
                    "updatedAt": "2026-02-14T12:44:08.407Z"
                  }
                ]
              }
            ]
          }
        ]
      },
      {
        "id": "697b6cf9f6aa509f8f4d36af",
        "name": "Green Cape Botanico (блок B)",
        "sections": [
          {
            "id": "697b6cf9f6aa509f8f4d36af",
            "name": "Green Cape Botanico (блок B)",
            "floors": [
              {
                "floor": 5,
                "units": [
                  {
                    "id": "69906e5c336fbbb952583253",
                    "complexId": "697b6967f6aa509f8f4d3387",
                    "buildingId": "697b6cf9f6aa509f8f4d36af",
                    "sectionId": "697b6cf9f6aa509f8f4d36af",
                    "floor": 5,
                    "number": "31",
                    "rooms": 2,
                    "area": 133.92,
                    "price": 415152,
                    "currency": "USD",
                    "status": "available",
                    "finishing": "designer",
                    "windowsSide": "unknown",
                    "layoutId": null,
                    "image": {
                      "id": "699070c1336fbbb95258334b",
                      "name": "31ap 133.92",
                      "mimeType": "image/png",
                      "size": 0,
                      "url": "https://coasts-cdn.fra1.digitaloceanspaces.com/newconstructions-apartments-plans/5c68986e-1370-4131-9f16-e27122c73290.jpg",
                      "createdAt": "2026-02-14T12:55:29.261Z"
                    },
                    "createdAt": "2026-02-14T12:45:16.356Z",
                    "updatedAt": "2026-02-14T12:56:05.476Z"
                  }
                ]
              },
              {
                "floor": 3,
                "units": [
                  {
                    "id": "69906e5c336fbbb952583252",
                    "complexId": "697b6967f6aa509f8f4d3387",
                    "buildingId": "697b6cf9f6aa509f8f4d36af",
                    "sectionId": "697b6cf9f6aa509f8f4d36af",
                    "floor": 3,
                    "number": "15",
                    "rooms": 2,
                    "area": 144,
                    "price": 446400,
                    "currency": "USD",
                    "status": "available",
                    "finishing": "designer",
                    "windowsSide": "unknown",
                    "layoutId": null,
                    "image": {
                      "id": "69907139336fbbb952583381",
                      "name": "144",
                      "mimeType": "image/png",
                      "size": 0,
                      "url": "https://coasts-cdn.fra1.digitaloceanspaces.com/newconstructions-apartments-plans/817e6cf7-ae35-4333-94d6-8ba3a1048535.jpg",
                      "createdAt": "2026-02-14T12:57:29.337Z"
                    },
                    "createdAt": "2026-02-14T12:45:16.356Z",
                    "updatedAt": "2026-02-14T12:57:47.359Z"
                  }
                ]
              },
              {
                "floor": 2,
                "units": [
                  {
                    "id": "69906e5c336fbbb952583251",
                    "complexId": "697b6967f6aa509f8f4d3387",
                    "buildingId": "697b6cf9f6aa509f8f4d36af",
                    "sectionId": "697b6cf9f6aa509f8f4d36af",
                    "floor": 2,
                    "number": "14",
                    "rooms": 2,
                    "area": 138.68,
                    "price": 429908,
                    "currency": "USD",
                    "status": "available",
                    "finishing": "designer",
                    "windowsSide": "unknown",
                    "layoutId": null,
                    "image": {
                      "id": "699070c1336fbbb952583347",
                      "name": "14ap 138.68",
                      "mimeType": "image/png",
                      "size": 0,
                      "url": "https://coasts-cdn.fra1.digitaloceanspaces.com/newconstructions-apartments-plans/e9096247-17d9-44b8-99d3-c868ff92d254.jpg",
                      "createdAt": "2026-02-14T12:55:29.255Z"
                    },
                    "createdAt": "2026-02-14T12:45:16.356Z",
                    "updatedAt": "2026-02-14T12:55:52.572Z"
                  }
                ]
              },
              {
                "floor": 1,
                "units": [
                  {
                    "id": "69906e5c336fbbb952583250",
                    "complexId": "697b6967f6aa509f8f4d3387",
                    "buildingId": "697b6cf9f6aa509f8f4d36af",
                    "sectionId": "697b6cf9f6aa509f8f4d36af",
                    "floor": 1,
                    "number": "1",
                    "rooms": 1,
                    "area": 51.83,
                    "price": 134758,
                    "currency": "USD",
                    "status": "available",
                    "finishing": "designer",
                    "windowsSide": "unknown",
                    "layoutId": null,
                    "image": {
                      "id": "699070c1336fbbb952583345",
                      "name": "1ap 51.83",
                      "mimeType": "image/png",
                      "size": 0,
                      "url": "https://coasts-cdn.fra1.digitaloceanspaces.com/newconstructions-apartments-plans/63ae6fd4-e930-4cbe-a027-e27abf8aeeb0.jpg",
                      "createdAt": "2026-02-14T12:55:29.214Z"
                    },
                    "createdAt": "2026-02-14T12:45:16.356Z",
                    "updatedAt": "2026-02-14T12:55:46.423Z"
                  }
                ]
              }
            ]
          }
        ]
      },
      {
        "id": "697b6d0af6aa509f8f4d36b1",
        "name": "Green Cape Botanico (блок C)",
        "sections": [
          {
            "id": "697b6d0af6aa509f8f4d36b1",
            "name": "Green Cape Botanico (блок C)",
            "floors": []
          }
        ]
      }
    ]
  }
}
```
