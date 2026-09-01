import ModuleHub from '@/components/ModuleHub'
import {  Megaphone, Newspaper, Send  } from 'lucide-react'
import { useI18n } from '@/i18n'

export default function SettingsNewsMailingsHubPage() {
  const { t } = useI18n()
  return (
    <ModuleHub
      moduleIcon={<Megaphone size={32} color="#c9a84c" />}
      moduleName={t('hubs.SettingsNewsMailingsHubPage_moduleName')}
      moduleDescription="Публикация корпоративных новостей и массовых оповещений в CRM и личный кабинет."
      sections={[
        {
          icon: <Newspaper size={20} color="#c9a84c" />,
          title: t('hubs.SettingsNewsMailingsHubPage_title_1'),
          description: t('hubs.SettingsNewsMailingsHubPage_desc_1'),
          route: '/dashboard/settings/news-mailings/news',
        },
        {
          icon: <Send size={20} color="#c9a84c" />,
          title: t('hubs.SettingsNewsMailingsHubPage_title_2'),
          description: t('hubs.SettingsNewsMailingsHubPage_desc_2'),
          route: '/dashboard/settings/news-mailings/mailings',
        },
      ]}
    />
  )
}
