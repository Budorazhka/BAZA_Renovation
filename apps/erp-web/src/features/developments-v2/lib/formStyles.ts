import type { CSSProperties } from 'react'

/**
 * D-02 COMPLETE: те же стилевые константы, что ProjectWizardV2Page.tsx —
 * вынесены сюда один раз, чтобы 5 форм иерархии (Building/Section/Floor/
 * FloorPlan/Unit) не дублировали идентичный inline-style объект каждая.
 */

export const labelStyle: CSSProperties = {
  display: 'block',
  fontSize: 16,
  fontWeight: 500,
  color: 'var(--app-text-muted)',
  marginBottom: 6,
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
}

export const inputStyle: CSSProperties = {
  height: 44,
  width: '100%',
  borderRadius: 4,
  border: 'none',
  borderBottom: '1px solid var(--green-border)',
  background: 'rgba(3,29,22,0.5)',
  color: 'var(--app-text)',
  fontSize: 16,
  padding: '0 12px',
  outline: 'none',
}

export function fieldStyle(hasError: boolean): CSSProperties {
  return hasError ? { ...inputStyle, borderBottom: '1px solid #ffb4ab' } : inputStyle
}
