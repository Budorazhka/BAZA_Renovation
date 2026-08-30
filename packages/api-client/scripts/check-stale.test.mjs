import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeLineEndings } from './normalize-text.mjs';

test('normalizes CRLF and legacy CR line endings before generated-file comparison', () => {
  assert.equal(normalizeLineEndings('one\r\ntwo\rthree\nfour'), 'one\ntwo\nthree\nfour');
});
