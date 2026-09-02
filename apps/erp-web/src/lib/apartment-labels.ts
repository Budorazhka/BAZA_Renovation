/** Подписи renovation из EstateNewconstructionsApartment (property-options). */
const RENOVATION_LABELS: Record<string, string> = {
  shell_condition: 'Черновая',
  white_box: 'White box',
  green_box: 'Green box',
  standard: 'Стандарт',
  turnkey: 'Под ключ',
  cosmetic: 'Косметический',
  designer: 'Дизайнерский',
  needs_repair: 'Требует ремонта',
  needs_capital_repair: 'Требует кап. ремонта',
}

export function renovationLabel(value?: string | null): string | undefined {
  if (!value) return undefined
  return RENOVATION_LABELS[value] ?? value.replace(/_/g, ' ')
}

const FINISHING_LABELS: Record<string, string> = {
  none: 'Черновая',
  basic: 'Стандарт',
  whitebox: 'White box',
  designer: 'Дизайнерский',
}

export function finishingLabel(value?: string | null): string | undefined {
  if (!value || value === 'unknown') return undefined
  return FINISHING_LABELS[value] ?? value.replace(/_/g, ' ')
}

export function resolveUnitConditionLabel(input: {
  renovation?: string | null
  finishing?: string | null
  customFinish?: string | number | boolean | null
}): string | undefined {
  return (
    renovationLabel(input.renovation) ??
    (input.customFinish != null && String(input.customFinish).trim()
      ? String(input.customFinish).trim()
      : undefined) ??
    finishingLabel(input.finishing)
  )
}

export function resolveUnitCeilingHeight(input: {
  customCeiling?: string | number | boolean | null
  projectCeiling?: string | null
}): string | undefined {
  const custom = input.customCeiling != null ? String(input.customCeiling).trim() : ''
  if (custom) return custom
  const project = input.projectCeiling?.trim()
  return project || undefined
}
