import type { SelectionLanguage } from '@/lib/selection-display'
import { t } from '@/lib/selection-display'
import { normalizeOptionValues } from '@/lib/project-options'

export type VisitPaymentMode = 'installment' | 'full'

export function resolveVisitPaymentModes(types: string[] = []): VisitPaymentMode[] {
  const normalized = normalizeOptionValues('paymentTypes', types)
  const modes: VisitPaymentMode[] = []

  if (normalized.includes('installment')) modes.push('installment')
  if (normalized.includes('full_payment')) modes.push('full')

  if (modes.length === 0) return ['installment', 'full']
  return modes
}

export function visitPaymentModeLabel(language: SelectionLanguage, mode: VisitPaymentMode): string {
  return mode === 'installment' ? t(language, 'installment') : t(language, 'fullPayment')
}

export function defaultVisitPaymentMode(
  modes: VisitPaymentMode[],
  hasInstallmentSchedule: boolean,
): VisitPaymentMode {
  if (modes.length === 1) return modes[0]
  if (modes.includes('installment') && hasInstallmentSchedule) return 'installment'
  if (modes.includes('full')) return 'full'
  return modes[0]
}
