import ModuleHub from '@/components/ModuleHub'
import {  KeyRound, UserRoundPlus  } from 'lucide-react'
import { useI18n } from '@/i18n'

export default function BookingsHubPage() {
  const { t } = useI18n()
  return (
    <ModuleHub
      moduleIcon={<KeyRound size={32} color="#c9a84c" />}
      moduleName={t('hubs.BookingsHubPage_moduleName')}
      sections={[
        {
          icon: <UserRoundPlus size={20} color="#c9a84c" />,
          title: t('hubs.BookingsHubPage_title_1'),
          description: '',
          route: '/dashboard/bookings/register-client',
        },
        {
          icon: <KeyRound size={20} color="#c9a84c" />,
          title: t('hubs.BookingsHubPage_title_2'),
          description: '',
          route: '/dashboard/bookings/register-buyer',
        },
      ]}
    />
  )
}
