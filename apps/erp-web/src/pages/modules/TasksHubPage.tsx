import ModuleHub from '@/components/ModuleHub'
import {  ListTodo, Plus, ClipboardList  } from 'lucide-react'
import { useI18n } from '@/i18n'

/** Точка входа «Задачи»: два сценария, как у броней. */
export default function TasksHubPage() {
  const { t } = useI18n()
  return (
    <ModuleHub
      moduleIcon={<ListTodo size={32} color="#c9a84c" />}
      moduleName={t('hubs.TasksHubPage_moduleName')}
      moduleDescription="Дашборд задач и управление задачами."
      sections={[
        {
          icon: <ClipboardList size={20} color="#c9a84c" />,
          title: t('hubs.TasksHubPage_title_1'),
          description: t('hubs.TasksHubPage_desc_1'),
          route: '/dashboard/tasks/my',
        },
        {
          icon: <Plus size={20} color="#c9a84c" />,
          title: t('hubs.TasksHubPage_title_2'),
          description: t('hubs.TasksHubPage_desc_2'),
          route: '/dashboard/tasks/new',
        },
      ]}
    />
  )
}
