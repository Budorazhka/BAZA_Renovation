import { PersonnelErrorBoundary } from '@/components/common/ModuleErrorBoundary'
import { PersonnelPage } from '@/components/personnel/PersonnelPage'

/**
 * Маршрут «Компания → Оргструктура»: дерево стабильных аккаунтов-позиций,
 * заполнение человеком, доступы позиции и управление входом.
 *
 * Раньше здесь был упрощённый дубль + лишний DashboardShell поверх App (двойной сайдбар).
 */
export function TeamOrgPage() {
  return (
    <PersonnelErrorBoundary>
      <PersonnelPage />
    </PersonnelErrorBoundary>
  )
}
