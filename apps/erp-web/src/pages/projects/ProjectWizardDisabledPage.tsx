import { ArrowLeft, Building2 } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

/**
 * ProjectsPage/useCoreStore.fetchProjects читают список ЖК из НОВОГО
 * developmentsApiV2 (apps/api D-01 Development-агрегат), но ProjectWizardPage
 * всё ещё пишет через addProjectWithFormData/updateProjectWithFormData в
 * legacy developmentApi — созданный/изменённый там ЖК не появится в списке
 * после следующего fetchProjects (два разных backend). Пока визард не
 * перенесён на новую Development-схему (contact.phone обязателен, нет
 * маркетинговых полей — см. комментарий у fetchProjects в useCoreStore.ts),
 * create/edit заблокированы на уровне роута, а не оставлены как рабочий,
 * но ломающийся сценарий.
 */
export function ProjectWizardDisabledPage({ mode }: { mode: 'create' | 'edit' }) {
  const navigate = useNavigate()

  return (
    <div className="felt-content flex flex-1 flex-col items-center justify-center gap-4 min-h-0 text-center">
      <Building2 className="size-10 text-[color:var(--installments-text-muted)]" />
      <h1 className="text-[22px] font-normal text-[color:var(--installments-text)]">
        {mode === 'edit' ? 'Редактирование ЖК временно недоступно' : 'Добавление ЖК временно недоступно'}
      </h1>
      <p className="max-w-[520px] text-[16px] font-normal text-[color:var(--installments-text-muted)]">
        Список объектов уже переведён на новый backend, а форма создания/редактирования — ещё нет.
        Раздел откроется снова после переноса формы на новую модель.
      </p>
      <button
        type="button"
        onClick={() => navigate('/dashboard/development/projects')}
        className="mt-2 flex items-center gap-2 rounded-md border border-[color:var(--installments-border-inactive)] bg-[var(--installments-btn-hover-bg)] px-5 py-3 text-[16px] font-normal text-[color:var(--installments-text)] hover:bg-[var(--installments-empty-bg)]"
      >
        <ArrowLeft className="size-4" />
        Назад к объектам
      </button>
    </div>
  )
}
