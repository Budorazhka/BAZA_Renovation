import type { LeadStageV2 } from '@/types/leadsV2'

export const STAGE_CONFIG: Record<
  LeadStageV2,
  {
    bgClass: string
    textClass: string
    borderClass: string
    dotClass: string
  }
> = {
  new: {
    bgClass: 'bg-[color-mix(in_srgb,var(--gold)_14%,transparent)]',
    textClass: 'text-[color:var(--gold)]',
    borderClass: 'border-[color:color-mix(in_srgb,var(--gold)_36%,transparent)]',
    dotClass: 'bg-[var(--gold)]',
  },
  contacted: {
    bgClass: 'bg-[color-mix(in_srgb,var(--mint)_14%,transparent)]',
    textClass: 'text-[color:var(--mint)]',
    borderClass: 'border-[color:color-mix(in_srgb,var(--mint)_36%,transparent)]',
    dotClass: 'bg-[var(--mint)]',
  },
  qualified: {
    bgClass: 'bg-emerald-500/10',
    textClass: 'text-emerald-300',
    borderClass: 'border-emerald-500/25',
    dotClass: 'bg-emerald-400',
  },
  converted: {
    bgClass: 'bg-[color-mix(in_srgb,var(--gold)_22%,transparent)]',
    textClass: 'text-[color:var(--gold-light)]',
    borderClass: 'border-[color:color-mix(in_srgb,var(--gold)_45%,transparent)]',
    dotClass: 'bg-[var(--gold-light)]',
  },
  lost: {
    bgClass: 'bg-rose-500/10',
    textClass: 'text-rose-300',
    borderClass: 'border-rose-500/25',
    dotClass: 'bg-rose-400',
  },
}
