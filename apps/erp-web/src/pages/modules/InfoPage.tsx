import ModuleHub from '@/components/ModuleHub'
import {  AlarmClock, Newspaper, PenLine, Info  } from 'lucide-react'
import { useI18n } from '@/i18n'

export default function InfoPage() {
  const { t } = useI18n()
  return (
    <ModuleHub
      moduleIcon={<Info size={32} color="#c9a84c" />}
      moduleName={t('hubs.InfoPage_moduleName')}
      moduleDescription="Корпоративные новости, напоминания — единый информационный центр платформы."
      sections={[
        {
          icon: <Newspaper size={20} color="#c9a84c" />,
          title: t('hubs.InfoPage_title_1'),
          description: t('hubs.InfoPage_desc_1'),
          route: '/dashboard/settings/info/news',
        },
        {
          icon: <AlarmClock size={20} color="#c9a84c" />,
          title: t('hubs.InfoPage_title_2'),
          description: t('hubs.InfoPage_desc_2'),
          route: '/dashboard/settings/info/reminders',
        },
        {
          icon: <PenLine size={20} color="#c9a84c" />,
          title: t('hubs.InfoPage_title_3'),
          description: t('hubs.InfoPage_desc_3'),
          route: '/dashboard/settings/info/news',
          badge: 'soon',
        },
      ]}
    />
  )
}
