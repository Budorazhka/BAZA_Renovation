import * as DialogPrimitive from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { DATA_COLORS } from './palette'
import type { DrilldownColumn, DrilldownResult } from '@/lib/developer-analytics-drilldown'

const TONE_COLOR: Record<NonNullable<DrilldownColumn['tone']>, string | undefined> = {
  gold: DATA_COLORS.money,
  mint: DATA_COLORS.volume,
  danger: DATA_COLORS.danger,
  default: undefined,
}

interface Props {
  result: DrilldownResult | null
  onClose: () => void
  closeLabel: string
  emptyLabel: string
  rowsLabel: string
}

export function DrilldownSheet({ result, onClose, closeLabel, emptyLabel, rowsLabel }: Props) {
  return (
    <DialogPrimitive.Root open={result !== null} onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay
          className={cn(
            'fixed inset-0 z-50 bg-[#00110d]/70',
            'data-[state=open]:animate-in data-[state=open]:fade-in-0',
            'data-[state=closed]:animate-out data-[state=closed]:fade-out-0',
          )}
        />
        <DialogPrimitive.Content
          className={cn(
            'fixed inset-y-0 right-0 z-50 flex w-full max-w-[720px] flex-col',
            'bg-[#031d16] shadow-[inset_1px_0_0_rgba(201,168,76,0.18)]',
            'duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out',
            'data-[state=open]:slide-in-from-right data-[state=closed]:slide-out-to-right',
            'motion-reduce:transition-none motion-reduce:animate-none',
          )}
        >
          {result ? (
            <>
              <header className="shrink-0 bg-[#112d1c] px-5 py-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <DialogPrimitive.Title className="truncate text-[24px] font-medium tracking-[-0.02em] text-[color:var(--workspace-text)]">
                      {result.title}
                    </DialogPrimitive.Title>
                    <DialogPrimitive.Description className="mt-1 text-[16px] text-[color:var(--workspace-text-muted)]">
                      {result.subtitle}
                    </DialogPrimitive.Description>
                  </div>
                  <DialogPrimitive.Close
                    className={cn(
                      'shrink-0 rounded-sm p-2 text-[color:var(--workspace-text-muted)] transition-colors',
                      'hover:bg-[#163824] hover:text-[color:var(--workspace-text)]',
                      'focus-visible:outline-none focus-visible:shadow-[inset_0_0_0_2px_#e6c364]',
                    )}
                    aria-label={closeLabel}
                  >
                    <X className="size-5" />
                  </DialogPrimitive.Close>
                </div>

                {result.stats.length ? (
                  <dl className="mt-4 flex flex-wrap gap-x-8 gap-y-3">
                    {result.stats.map((stat) => (
                      <div key={stat.label} className="min-w-0">
                        <dt className="text-[16px] font-medium uppercase tracking-[0.08em] text-[color:var(--workspace-text-muted)]">
                          {stat.label}
                        </dt>
                        <dd className="mt-1 text-[20px] text-[#e6c364]">{stat.value}</dd>
                      </div>
                    ))}
                  </dl>
                ) : null}
              </header>

              <div className="min-h-0 flex-1 overflow-auto">
                {result.note || !result.rows.length ? (
                  <p className="p-5 text-[16px] text-[color:var(--workspace-text-muted)]">
                    {result.note ?? emptyLabel}
                  </p>
                ) : (
                  <table className="w-full border-collapse text-[16px]">
                    <thead className="sticky top-0 bg-[#163824] text-left uppercase tracking-[0.08em] text-[#e6c364]">
                      <tr>
                        {result.columns.map((column) => (
                          <th
                            key={column.key}
                            className={cn('px-4 py-3 font-medium', column.align === 'right' && 'text-right')}
                          >
                            {column.label}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {result.rows.map((row, index) => (
                        <tr key={row.id} className={index % 2 ? 'bg-[#112d1c]' : 'bg-[#072821]'}>
                          {result.columns.map((column) => (
                            <td
                              key={column.key}
                              className={cn(
                                'px-4 py-3 text-[color:var(--workspace-text)]',
                                column.align === 'right' && 'text-right',
                              )}
                              style={{
                                color: row.danger && column.key === 'status'
                                  ? TONE_COLOR.danger
                                  : TONE_COLOR[column.tone ?? 'default'],
                              }}
                            >
                              {row.cells[column.key] ?? '—'}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>

              {result.rows.length ? (
                <footer className="shrink-0 bg-[#112d1c] px-5 py-3 text-[16px] text-[color:var(--workspace-text-muted)]">
                  {rowsLabel}: {result.rows.length}
                </footer>
              ) : null}
            </>
          ) : null}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}

export default DrilldownSheet
