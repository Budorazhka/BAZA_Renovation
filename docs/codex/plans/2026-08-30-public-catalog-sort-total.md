# Public Catalog Sort and Total

## Goal

Expose production-safe sorting and an honest total count for public development/listing catalogs without doing client-side fake sorting or breaking cursor pagination.

## Non-Goals

- No in-memory sorting in controllers or React.
- No changes to private/admin authorization, publication lifecycle, or Figma visual system.
- Developments keep `newest` only until a real unit-price aggregate exists; the API must reject unsupported development sorts rather than fabricate prices.

## Current System Notes

- Public publication reads live in `@baza/publication` and currently sort by `_id` with a raw ObjectId cursor.
- Listing worker projections already carry `priceAmountMinorUnits`; area must be added to the sortable projection. Development projections have no price source today.
- Public list responses currently contain only `items` and `nextCursor`; DTOs reject unknown query parameters.

## Contract decisions

- `sort=newest` is the default for both endpoints and remains backward-compatible with existing ObjectId cursors.
- Listings support `newest`, `price_asc`, `price_desc`, `area_asc`, and `area_desc`.
- Developments support `newest` only; unsupported sort values return validation 400.
- Sorted cursors are opaque base64url JSON tokens carrying `{ sort, value, id }`; the server rejects malformed tokens and sort mismatches.
- Every list response adds `total`, computed by `countDocuments` over the exact same visibility/filter predicate (including source type and bbox). No identity or internal fields are returned.

## Tasks

- [x] Step 1: Add failing repository/controller/worker/frontend tests for sort, cursor, and total semantics.
- [x] Step 2: Add indexed numeric projection fields and repository page methods with stable compound ordering and count metadata.
- [x] Step 3: Add DTO validation, opaque cursor codec, controller responses, OpenAPI, and generated client types.
- [x] Step 4: Thread `sort` and `total` through React hooks, URL state, toolbar control, and honest count text.
- [x] Step 5: Run API unit/integration, worker, marketplace tests, typechecks, builds, contract gates, and commit locally without pushing.

## Risks

- Existing publications created before the area projection change may not have a sortable area; they must remain visible under `newest`, while sorted listing queries should use a deterministic missing-value policy documented and tested.
- Count and geo filtering need matching indexes; verify explainable indexed predicates rather than silently accepting an unbounded scan.
