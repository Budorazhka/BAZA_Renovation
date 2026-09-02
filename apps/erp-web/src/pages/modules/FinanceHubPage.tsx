import ModuleHub from '@/components/ModuleHub'
import {  Wallet  } from 'lucide-react'
import { useI18n } from '@/i18n'

export default function FinanceHubPage() {
  const { t } = useI18n()
  return (
    <ModuleHub
      moduleIcon={<Wallet size={32} color="#c9a84c" />}
      moduleName={t('hubs.FinanceHubPage_moduleName')}
      sections={[
        {
          icon: <Wallet size={20} color="#c9a84c" />,
          title: t('hubs.FinanceHubPage_title_1'),
          description: t('hubs.FinanceHubPage_desc_1'),
          route: '/dashboard/finance/panel',
        },
      ]}
    />
  )
}
