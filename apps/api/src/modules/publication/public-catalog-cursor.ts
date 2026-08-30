import { Types } from 'mongoose';
import { AppException } from '../../shared/errors/app-exception';
import { ErrorCode } from '../../shared/errors/error-codes';
import type { PublicCatalogCursor, PublicCatalogSort } from '@baza/publication';

export type { PublicCatalogCursor, PublicCatalogSort } from '@baza/publication';

export function encodePublicCatalogCursor(cursor: PublicCatalogCursor & { sort: PublicCatalogSort }): string {
  return Buffer.from(
    JSON.stringify({ sort: cursor.sort, value: cursor.value ?? null, id: cursor.id.toString() }),
    'utf8',
  ).toString('base64url');
}

export function decodePublicCatalogCursor(
  raw: string,
  expectedSort: PublicCatalogSort,
): PublicCatalogCursor & { sort: PublicCatalogSort } {
  if (expectedSort === 'newest' && Types.ObjectId.isValid(raw) && raw.length === 24) {
    return { sort: 'newest', id: new Types.ObjectId(raw) };
  }

  try {
    const payload = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8')) as {
      sort?: unknown;
      value?: unknown;
      id?: unknown;
    };
    const validValue = payload.value === null || (typeof payload.value === 'number' && Number.isFinite(payload.value));
    if (
      payload.sort !== expectedSort ||
      !validValue ||
      typeof payload.id !== 'string' ||
      !Types.ObjectId.isValid(payload.id) ||
      payload.id.length !== 24 ||
      (expectedSort !== 'newest' && payload.value === undefined)
    ) {
      throw new Error('invalid cursor payload');
    }
    return {
      sort: expectedSort,
      id: new Types.ObjectId(payload.id),
      ...(expectedSort === 'newest' ? {} : { value: payload.value as number | null }),
    };
  } catch {
    throw new AppException(ErrorCode.VALIDATION_FAILED, 'Invalid catalog cursor');
  }
}

export function getPublicCatalogCursorValue(
  publication: { searchProjection?: Record<string, unknown> },
  sort: PublicCatalogSort,
): number | null | undefined {
  if (sort === 'newest') return undefined;
  const field = sort.startsWith('price_') ? 'priceAmountMinorUnits' : 'area';
  const value = publication.searchProjection?.[field];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}
