import { Link } from 'react-router-dom'
import {
  BarChart3,
  Building2,
  CircleDollarSign,
  Landmark,
  UserRound,
  Users,
} from 'lucide-react'
import { DashboardShell } from '@/components/layout/DashboardShell'
import { useI18n } from "@/i18n";

type ReportCard = {
  title: string
  description: string
  route: string
}

type ReportGroup = {
  title: string
  icon: React.ReactNode
  cards: ReportCard[]
}

const REPORT_GROUPS: ReportGroup[] = [
  {
    title: 'Лиды',
    icon: <Users className="size-4 text-[color:var(--gold)]" />,
    cards: [
      {
        title: 'Общий отчет по лидам',
        description: 'Состояние входящего потока, SLA и конверсия.',
        route: '/dashboard/leads/report/general',
      },
      {
        title: 'Маркетинговый отчет по лидам',
        description: 'Каналы, CPL, качество и результативность трафика.',
        route: '/dashboard/leads/report/marketing',
      },
    ],
  },
  {
    title: 'CRM',
    icon: <BarChart3 className="size-4 text-[color:var(--gold)]" />,
    cards: [
      {
        title: 'Отчет по сделкам',
        description: 'Этапы, риски, закрытые и сорванные сделки.',
        route: '/dashboard/deals/report',
      },
      {
        title: 'Отчет по менеджеру',
        description: 'Личная результативность сотрудника и его активность.',
        route: '/dashboard/reports/manager',
      },
      {
        title: 'Отчет по команде',
        description: 'Сводная командная результативность и выполнение планов.',
        route: '/dashboard/reports/team',
      },
    ],
  },
  {
    title: 'Новостройки',
    icon: <Landmark className="size-4 text-[color:var(--gold)]" />,
    cards: [
      {
        title: 'Отчёт по работе партнёров по первичному рынку',
        description: 'Регистрации, брони и сделки партнёрской сети первички.',
        route: '/dashboard/new-buildings/report-partners',
      },
    ],
  },
  {
    title: 'Объекты вторичного рынка',
    icon: <Building2 className="size-4 text-[color:var(--gold)]" />,
    cards: [
      {
        title: 'Отчёт по объектам',
        description: 'Качество базы, активность и проблемные объекты.',
        route: '/dashboard/objects/report',
      },
    ],
  },
  {
    title: 'Финансы',
    icon: <CircleDollarSign className="size-4 text-[color:var(--gold)]" />,
    cards: [
      {
        title: 'Отчёт по сделкам и комиссиям',
        description: 'Сделки, этапы, менеджеры и комиссия агентства.',
        route: '/dashboard/finance/report',
      },
    ],
  },
  {
    title: 'Сообщество',
    icon: <UserRound className="size-4 text-[color:var(--gold)]" />,
    cards: [
      {
        title: 'Отчёт о формировании сообщества партнёров',
        description: 'Рост, вовлечённость и активность экосистемы.',
        route: '/dashboard/community/report',
      },
    ],
  },
]

export default function ReportsRegistryPage() {
    const { t } = useI18n();
  return (
    <DashboardShell>
      <div className="min-h-0 flex-1 overflow-y-auto p-6">
        <div className="w-full space-y-4">
          <div>
            <h1 className="text-xl font-normal text-[color:var(--theme-accent-heading)]">{t('reports.reportsRegistryPage.аналитика')}</h1>
            <p className="mt-1 text-sm text-[color:var(--app-text-muted)]">
              {t('reports.reportsRegistryPage.все_отч_ты_платформы')}</p>
          </div>

          {REPORT_GROUPS.map((group) => (
            <section key={group.title} className="rounded-lg border border-[var(--hub-card-border)] bg-[var(--hub-card-bg)] p-3">
              <div className="mb-3 flex items-center gap-2">
                {group.icon}
                <h2 className="text-sm font-normal text-[color:var(--theme-accent-heading)]">{group.title}</h2>
              </div>
              <div className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-3">
                {group.cards.map((card) => (
                  <Link
                    key={card.title}
                    to={card.route}
                    className="rounded-md border border-[color:var(--workspace-row-border)] bg-[var(--workspace-row-bg)] px-3 py-2 transition-colors hover:border-[color:var(--gold)]/35"
                  >
                    <p className="text-sm font-normal text-[color:var(--workspace-text)]">{card.title}</p>
                    <p className="mt-1 text-xs text-[color:var(--workspace-text-muted)]">{card.description}</p>
                  </Link>
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>
    </DashboardShell>
  )
}
