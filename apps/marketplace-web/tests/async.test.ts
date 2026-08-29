import { describe, expect, it } from 'vitest'
import { isAbortError } from '../src/lib/async'

describe('isAbortError', () => {
  it('recognizes DOMException aborts', () => {
    expect(isAbortError(new DOMException('The operation was aborted', 'AbortError'))).toBe(true)
  })

  it('recognizes fetch-style errors with AbortError name', () => {
    const error = new Error('request cancelled')
    error.name = 'AbortError'
    expect(isAbortError(error)).toBe(true)
  })

  it('does not classify ordinary failures as aborts', () => {
    expect(isAbortError(new Error('network down'))).toBe(false)
    expect(isAbortError('AbortError')).toBe(false)
  })
})
