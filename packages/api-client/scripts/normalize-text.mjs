/**
 * Generated TypeScript is content-addressed for the stale-output gate, but
 * Git may materialize the same file with CRLF on Windows. Compare semantic
 * text rather than checkout-specific line endings.
 */
export function normalizeLineEndings(value) {
  return value.replace(/\r\n?/g, '\n');
}
