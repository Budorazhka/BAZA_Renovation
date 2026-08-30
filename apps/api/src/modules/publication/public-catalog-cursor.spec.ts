import { Types } from 'mongoose';
import {
  decodePublicCatalogCursor,
  encodePublicCatalogCursor,
  type PublicCatalogSort,
} from './public-catalog-cursor';

describe('public catalog cursor codec', () => {
  it('round-trips a sorted cursor without exposing JSON in the URL', () => {
    const id = new Types.ObjectId();
    const encoded = encodePublicCatalogCursor({ sort: 'price_asc', value: 12500000, id });

    expect(encoded).not.toContain('{');
    expect(decodePublicCatalogCursor(encoded, 'price_asc')).toEqual({ sort: 'price_asc', value: 12500000, id });
  });

  it('accepts legacy ObjectId cursors for the default newest order', () => {
    const id = new Types.ObjectId();

    expect(decodePublicCatalogCursor(id.toString(), 'newest')).toEqual({ sort: 'newest', id });
  });

  it.each([
    ['not-a-cursor', 'newest'],
    [encodePublicCatalogCursor({ sort: 'price_asc', value: 100, id: new Types.ObjectId() }), 'price_desc'],
    [encodePublicCatalogCursor({ sort: 'price_asc', value: 100, id: new Types.ObjectId() }).slice(0, -2), 'price_asc'],
  ] as [string, PublicCatalogSort][])('rejects malformed or incompatible cursor %s', (cursor, sort) => {
    expect(() => decodePublicCatalogCursor(cursor, sort)).toThrow('Invalid catalog cursor');
  });
});
