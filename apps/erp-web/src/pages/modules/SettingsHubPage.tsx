import ModuleHub from '@/components/ModuleHub'
import {  Settings, Zap, Bell, Server, Paintbrush, MessageCircle, UserCog  } from 'lucide-react'
import { useI18n } from '@/i18n'
import { useAuth } from '@/context/AuthContext'
import { roleCanAccessSettingsHub } from '@/config/dashboard-rail'

/** П. 13.10 */
export default function SettingsHubPage() {
  const { t } = useI18n()
  const { currentUser } = useAuth()
  const role = currentUser?.role ?? 'manager'
  const isFullAccess = roleCanAccessSettingsHub(role)

  const allSections = [
    {
      icon: <UserCog size={20} color="#c9a84c" />,
      title: t('hubs.SettingsHubPage_title_1'),
      description: '',
      route: '/dashboard/settings/profile',
    },
    {
      icon: <MessageCircle size={20} color="#c9a84c" />,
      title: t('hubs.SettingsHubPage_title_2'),
      description: '',
      route: '/dashboard/settings/chats',
    },
    {
      icon: <Zap size={20} color="#c9a84c" />,
      title: t('hubs.SettingsHubPage_title_3'),

      description: '',
      route: '/dashboard/settings/automation',
    },
    {
      icon: <Bell size={20} color="#c9a84c" />,
      title: t('hubs.SettingsHubPage_title_4'),
      description: '',
      route: '/dashboard/settings/notifications',
    },
    {
      icon: <Server size={20} color="#c9a84c" />,
      title: t('hubs.SettingsHubPage_title_5'),
      description: '',
      route: '/dashboard/settings/system',
    },
    {
      icon: <Paintbrush size={20} color="#c9a84c" />,
      title: t('hubs.SettingsHubPage_title_6'),
      description: '',
      route: '/dashboard/settings/theme',
    },
  ]

  // Если у пользователя нет полных прав на настройки, показываем только чаты и профиль
  const sections = isFullAccess 
    ? allSections 
    : allSections.filter(s => s.route === '/dashboard/settings/chats' || s.route === '/dashboard/settings/profile')

  return (
    <ModuleHub
      moduleIcon={<Settings size={32} color="#c9a84c" />}
      moduleName={t('hubs.SettingsHubPage_moduleName')}
      sections={sections}
    />
  )
}
