import ModuleHub from '@/components/ModuleHub'
import {  CalendarCheck, FileCheck2, LayoutList  } from 'lucide-react'
import { useI18n } from '@/i18n'

export default function NewBuildingsBookingsRegistrationsPage() {
  const { t } = useI18n()
  return (
    <ModuleHub
      moduleIcon={<LayoutList size={32} color="#c9a84c" />}
      moduleName={t('hubs.NewBuildingsBookingsRegistrationsPage_moduleName')}
      sections={[
        {
          icon: <CalendarCheck size={20} color="#c9a84c" />,
          title: t('hubs.NewBuildingsBookingsRegistrationsPage_title_1'),
          description: t('hubs.NewBuildingsBookingsRegistrationsPage_desc_1'),
          route: '/dashboard/bookings',
        },
        {
          icon: <FileCheck2 size={20} color="#c9a84c" />,
          title: t('hubs.NewBuildingsBookingsRegistrationsPage_title_2'),
          description: t('hubs.NewBuildingsBookingsRegistrationsPage_desc_2'),
          route: '/dashboard/new-buildings/registration',
        },
      ]}
    />
  )
}
