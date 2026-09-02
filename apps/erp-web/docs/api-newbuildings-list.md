# API: New Buildings List (Новостройки для агентов)

**Page:** `/dashboard/new-buildings`  
**Component:** `NewBuildingsListPage.tsx`  
**Current state:** Fully mocked data, needs real API integration

---

## Overview

This page shows a catalog of new-build residential complexes available to agents for booking units and viewing commissions. It displays:
- Photo carousel with promo badges
- Complex name, developer, city/country
- Delivery date, price range
- Unit stats (floors, apartments count, area range)
- Sales progress bar (total / free / sold)
- Commissions table view

---

## Required API Endpoint

```
GET /api/development/newbuildings
```

**Auth:** JWT Bearer token  
**Purpose:** Returns list of active new-build complexes visible to agents (status = active)

### Query Parameters

| Param    | Type   | Default | Description                          |
|----------|--------|---------|--------------------------------------|
| page     | number | 1       | Page number                          |
| limit    | number | 50      | Items per page                       |
| search   | string | —       | Search by name, developer, city      |
| city     | string | —       | Filter by city                       |
| status   | string | active  | Filter by status (agents see active) |

### Response Structure

```json
{
  "success": true,
  "data": {
    "items": [NewBuildingItem, ...],
    "total": 10,
    "page": 1,
    "totalPages": 1
  }
}
```

---

## NewBuildingItem — Expected Fields

### Core Identity

| Field     | Type   | Required | Example                | Description              |
|-----------|--------|----------|------------------------|--------------------------|
| id        | string | ✅       | "6a1ae50e99ce6ae2eb81e368" | Unique complex ID    |
| name      | string | ✅       | "Residence Park"       | Complex display name     |
| slug      | string | ✅       | "residence-park"       | URL-friendly slug        |
| status    | string | ✅       | "active"               | active / archived        |
| developer | string | ✅       | "Batumi Prime Dev"     | Developer company name   |

### Location

| Field   | Type   | Required | Example  | Description                  |
|---------|--------|----------|----------|------------------------------|
| city    | string | ✅       | "Батуми" | City name (Russian)          |
| country | string | —        | "Грузия" | Country name (Russian)       |
| address | string | —        | "ул. Парнаваза, 102" | Street address     |

### Dates & Delivery

| Field    | Type   | Required | Example    | Description                       |
|----------|--------|----------|------------|-----------------------------------|
| delivery | string | ✅       | "Q3 2026"  | Delivery quarter (display format) |

### Pricing

| Field     | Type   | Required | Example      | Description                    |
|-----------|--------|----------|--------------|--------------------------------|
| priceFrom | string | ✅       | "$72 000"    | Minimum price (formatted)      |
| priceTo   | string | —        | "$210 000"   | Maximum price (formatted)      |

> Alternatively, the API can return numeric values and the frontend formats them:
>
> | Field         | Type   | Example | Description           |
> |---------------|--------|---------|-----------------------|
> | priceFromUsd  | number | 72000   | Min price in USD      |
> | priceToUsd    | number | 210000  | Max price in USD      |

### Unit Statistics

| Field      | Type   | Required | Example | Description                       |
|------------|--------|----------|---------|-----------------------------------|
| totalUnits | number | ✅       | 240     | Total apartments in the complex   |
| freeUnits  | number | ✅       | 88      | Available for sale/booking        |
| soldUnits  | number | ✅       | 140     | Already sold                      |

### Building Characteristics (for info chips on card)

| Field      | Type   | Required | Example | Description                      |
|------------|--------|----------|---------|----------------------------------|
| floorsFrom | number | —        | 10      | Min floor count across buildings |
| floorsTo   | number | —        | 18      | Max floor count across buildings |
| areaFrom   | number | —        | 36      | Min unit area in m²              |
| areaTo     | number | —        | 88      | Max unit area in m²              |

### Media

| Field  | Type     | Required | Example                            | Description        |
|--------|----------|----------|------------------------------------|--------------------|
| images | string[] | ✅       | ["https://cdn.../img1.jpg", ...]   | Photo URLs (1-10)  |

### Promotions (optional badges on card)

| Field  | Type    | Required | Description                              |
|--------|---------|----------|------------------------------------------|
| promos | array[] | —        | Promotional badges shown on the card     |

Each promo object:

| Field | Type   | Required | Values                        | Description              |
|-------|--------|----------|-------------------------------|--------------------------|
| kind  | string | ✅       | "top" / "premium" / "banner" / "hot" | Badge type        |
| text  | string | —        | "BMW в подарок"               | Badge text (for banner/hot) |
| color | string | —        | "rgba(94,224,208,0.95)"       | Custom text color         |

**Badge types:**
- `top` — Pinned to TOP of listing (gold crown badge)
- `premium` — Premium card highlight (sparkles badge)
- `hot` — Hot deal / last units (flame badge)
- `banner` — Custom promotion text (tag badge)

### Commissions (for commissions table view)

| Field               | Type   | Required | Example | Description                     |
|---------------------|--------|----------|---------|---------------------------------|
| commissionBeforeTax | number | —        | 4.2     | Commission % before taxes       |
| commissionAfterTax  | number | —        | 3.65    | Commission % after taxes        |
| commissionBonus     | string | —        | "+ BMW при 5 продажах" | Bonus description  |

---

## Full Example Response

```json
{
  "success": true,
  "data": {
    "items": [
      {
        "id": "c1",
        "name": "Residence Park",
        "slug": "residence-park",
        "status": "active",
        "developer": "Batumi Prime Dev",
        "city": "Батуми",
        "country": "Грузия",
        "address": "ул. Парнаваза, 102",
        "delivery": "Q3 2026",
        "priceFrom": "$72 000",
        "priceTo": "$210 000",
        "totalUnits": 240,
        "freeUnits": 88,
        "soldUnits": 140,
        "floorsFrom": 10,
        "floorsTo": 18,
        "areaFrom": 36,
        "areaTo": 88,
        "images": [
          "https://coasts-cdn.fra1.digitaloceanspaces.com/newconstructions/img1.jpg",
          "https://coasts-cdn.fra1.digitaloceanspaces.com/newconstructions/img2.jpg",
          "https://coasts-cdn.fra1.digitaloceanspaces.com/newconstructions/img3.jpg"
        ],
        "promos": [
          { "kind": "top" },
          { "kind": "banner", "text": "BMW в подарок", "color": "rgba(94,224,208,0.95)" }
        ],
        "commissionBeforeTax": 4.2,
        "commissionAfterTax": 3.65,
        "commissionBonus": "+ BMW при 5 продажах"
      },
      {
        "id": "c2",
        "name": "Sky Garden",
        "slug": "sky-garden",
        "status": "active",
        "developer": "Global Realty",
        "city": "Батуми",
        "country": "Грузия",
        "delivery": "Q1 2027",
        "priceFrom": "$95 000",
        "priceTo": "$340 000",
        "totalUnits": 180,
        "freeUnits": 110,
        "soldUnits": 62,
        "floorsFrom": 12,
        "floorsTo": 22,
        "areaFrom": 32,
        "areaTo": 95,
        "images": [
          "https://coasts-cdn.fra1.digitaloceanspaces.com/newconstructions/img5.jpg",
          "https://coasts-cdn.fra1.digitaloceanspaces.com/newconstructions/img6.jpg"
        ],
        "promos": [],
        "commissionBeforeTax": 3.8,
        "commissionAfterTax": 3.31
      }
    ],
    "total": 10,
    "page": 1,
    "totalPages": 1
  }
}
```

---

## Data Flow: API → Card Display

```
GET /api/development/newbuildings
        │
        ▼
  NewBuildingItem[] (API response)
        │
        ▼
  Maps to ComplexCardData for <ComplexCard>:
    - id           ← id
    - name         ← name
    - developer    ← developer
    - city         ← city
    - country      ← country
    - address      ← address
    - images       ← images[]
    - delivery     ← delivery
    - priceFrom    ← priceFrom (or formatted from priceFromUsd)
    - priceTo      ← priceTo (or formatted from priceToUsd)
    - totalUnits   ← totalUnits
    - freeUnits    ← freeUnits
    - soldUnits    ← soldUnits
    - floorsFrom   ← floorsFrom
    - floorsTo     ← floorsTo
    - areaFrom     ← areaFrom
    - areaTo       ← areaTo
    - promos       ← promos[]
```

---

## Notes

- First 2 items in the list currently use mock data (Residence Park, Sky Garden) as demo placeholders
- All other items should come from real API
- The `ComplexCard` component derives some values (floors, area, address) from a hash of the ID if not provided — real API data should supply these explicitly
- Commissions view is a separate table using same data + commission fields
- The chessboard (unit grid) is opened per-complex and will need a separate API endpoint
