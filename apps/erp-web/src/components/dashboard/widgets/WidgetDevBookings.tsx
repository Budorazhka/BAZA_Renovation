import { type WidgetSlot, WIDGET_META } from '@/config/widgets-config'
import { DeskShell, DeskHeader } from '../desk-shared'
import { Clock, Eye } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useI18n } from '@/i18n'

interface Props {
  slot: WidgetSlot
}

export function WidgetDevBookings({ slot: _slot }: Props) {
  const { t } = useI18n()
  const meta = WIDGET_META['dev_bookings']

  const bookings = [
    { lot: 'ЖК Residence Park, кв. 42', timer: '02:15', urgency: 'warn' },
    { lot: 'ЖК Sky Garden, кв. 118', timer: '00:45', urgency: 'expired' },
    { lot: 'ЖК Олимп, кв. 5', timer: '14:20', urgency: 'ok' },
  ]

  return (
    <DeskShell accent={meta.accent} className="flex flex-col">
      <DeskHeader
        title={t('widgets.devBookings.title', meta.label)}
        accentColor={meta.accent}
        icon={<Clock className="size-5" />}
        right={
          <Link
            to="/dashboard/development/management/bookings"
            aria-label={t('widgets.devBookings.viewAllBookings', 'Смотреть все брони')}
            title={t('widgets.devBookings.viewAllBookings', 'Смотреть все брони')}
            className="group flex size-8 shrink-0 items-center justify-center rounded-md text-[color:var(--theme-accent-link-dim)] transition-colors hover:text-[color:var(--theme-accent-link)]"
          >
            <Eye
              className="size-5 transition-transform duration-300 ease-out group-hover:scale-125 motion-safe:animate-pulse"
              strokeWidth={2}
            />
          </Link>
        }
      />
      <div className="flex flex-col flex-1 p-4 gap-3 overflow-y-auto">
        {bookings.map((b, idx) => (
          <div key={idx} className="flex justify-between items-center gap-2 bg-[color:var(--workspace-surface-low)] p-3 rounded-[6px]">
            <span className="min-w-0 flex-1 truncate text-[17px] text-[color:var(--workspace-text)]">{b.lot}</span>
            <div className={`flex shrink-0 items-center gap-1.5 font-normal text-[18px] ${b.urgency === 'expired' ? 'text-[color:var(--timer-expired)]' : b.urgency === 'warn' ? 'text-[color:var(--timer-warn)]' : 'text-[color:var(--timer-ok)]'}`}>
              <Clock className="size-4" />
              <span>{b.timer}</span>
            </div>
          </div>
        ))}
      </div>
    </DeskShell>
  )
}
