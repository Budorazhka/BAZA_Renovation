import { useState, useEffect, useMemo, useRef } from 'react'
import { useNavigate, useLocation, useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'
import {
  BookOpen,
  MessageSquare,
  Search,
  ArrowLeft,
  Clock,
  ChevronRight,
  Presentation,
  GraduationCap,
  FileText,
  Pencil,
  Trash2,
  Plus,
} from 'lucide-react'
import { useAuth } from '@/context/AuthContext'
import { useBackendStatus } from '@/hooks/useBackendStatus'
import type { LMSItem, LMSCourse, TargetRole } from '@/data/lms-mock'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { LMSAdminDialog } from './LMSAdminDialog'
import { CourseAdminDialog } from './CourseAdminDialog'
import { useLmsLibrary } from './useLms'
import { useLmsProgress } from './useLmsProgress'
import { ItemContentViewer } from './viewers'
import { getCourseProgress, getCourseProgressPct } from './progress'
import '@/components/leads/leads-secret-table.css'
import { useI18n } from "@/i18n";

// ─── Типы вкладок ─────────────────────────────────────────────────────────────

type Tab = 'articles' | 'scripts' | 'presentations' | 'pdfs' | 'courses'

const VALID_TABS: readonly Tab[] = ['articles', 'scripts', 'presentations', 'pdfs', 'courses']

function parseLmsTab(params: URLSearchParams): Tab {
  const t = params.get('tab')
  return (VALID_TABS as readonly string[]).includes(t ?? '') ? (t as Tab) : 'scripts'
}

const TABS: Array<{ id: Tab; label: string; icon: React.ReactNode }> = [
  { id: 'articles', label: 'Статьи', icon: <BookOpen className="size-3.5" /> },
  { id: 'scripts', label: 'Скрипты', icon: <MessageSquare className="size-3.5" /> },
  { id: 'presentations', label: 'Презентации', icon: <Presentation className="size-3.5" /> },
  { id: 'pdfs', label: 'PDF', icon: <FileText className="size-3.5" /> },
  { id: 'courses', label: 'Курсы', icon: <GraduationCap className="size-3.5" /> },
]

const TAB_TO_ITEM_TYPE: Record<Tab, LMSItem['type'] | null> = {
  articles: 'article',
  scripts: 'script',
  presentations: 'presentation',
  pdfs: 'pdf',
  courses: null,
}

const ROLE_LABELS: Record<TargetRole, string> = {
  all: 'Все',
  manager: 'Менеджер',
  rop: 'РОП',
  director: 'Директор',
}

/** Для сортировки: нет времени — в конец при «короткие», в начало при «длинные» обрабатываем как 0/∞ отдельно */
function readMinutesForSort(rt?: string): number {
  if (!rt) return 9999
  const m = rt.match(/(\d+)/)
  return m ? parseInt(m[1], 10) : 9999
}

type SortKey = 'title' | 'time-asc' | 'time-desc'

// ─── Карточка материала ────────────────────────────────────────────────────────

function ItemCard({
  item,
  onClick,
  onEdit,
  onDelete,
}: {
  item: LMSItem
  onClick: () => void
  onEdit?: () => void
  onDelete?: () => void
}) {
    const { t } = useI18n();
  return (
    <div className="relative group">
      <button
        onClick={onClick}
        className="group/card flex flex-col gap-3 rounded-2xl border border-[color:var(--hub-card-border)] bg-[var(--hub-card-bg)] p-5 text-left transition-all hover:border-[color:var(--hub-card-border-hover)] hover:bg-[var(--hub-action-hover)] w-full"
      >
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <p className="font-normal text-[color:var(--app-text)] leading-snug">{item.title}</p>
            <p className="mt-1 text-sm text-[color:var(--hub-desc)] line-clamp-2">{item.description}</p>
          </div>
          <ChevronRight className="size-4 shrink-0 text-[color:var(--theme-accent-icon-dim)] transition-transform group-hover/card:translate-x-0.5 group-hover/card:text-[color:var(--theme-accent-link-dim)] mt-1" />
        </div>
        <div className="flex flex-wrap items-center gap-2 mt-auto">
          {item.targetRole !== 'all' && (
            <span className="rounded-full border border-[color:var(--hub-card-border)] bg-[var(--hub-action-hover)] px-2.5 py-0.5 text-xs text-[color:var(--hub-badge-soon-fg)]">
              {ROLE_LABELS[item.targetRole]}
            </span>
          )}
          {item.tags?.map(t => (
            <span key={t} className="rounded-full bg-[var(--nav-item-bg-active)] px-2.5 py-0.5 text-xs text-[color:var(--hub-desc)]">{t}</span>
          ))}
          {item.readTime && (
            <span className="ml-auto flex items-center gap-1 text-xs text-[color:var(--theme-accent-icon-dim)] shrink-0">
              <Clock className="size-3" />
              {item.readTime}
            </span>
          )}
        </div>
      </button>

      {/* Кнопки админа — только если переданы onEdit / onDelete */}
      {(onEdit || onDelete) && (
        <div className="absolute top-3 right-9 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          {onEdit && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onEdit() }}
              className="flex size-7 items-center justify-center rounded-full bg-[var(--hub-card-bg)] border border-[color:var(--hub-card-border)] text-[color:var(--hub-badge-soon-fg)] hover:text-emerald-300 hover:border-emerald-500/40 transition-colors"
              title={t('lms.lMSPage.редактировать')}
            >
              <Pencil className="size-3.5" />
            </button>
          )}
          {onDelete && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onDelete() }}
              className="flex size-7 items-center justify-center rounded-full bg-[var(--hub-card-bg)] border border-[color:var(--hub-card-border)] text-[color:var(--hub-badge-soon-fg)] hover:text-red-400 hover:border-red-500/40 transition-colors"
              title={t('lms.lMSPage.удалить')}
            >
              <Trash2 className="size-3.5" />
            </button>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Детальный просмотр ──────────────────────────────────────────────────────

function ItemDetail({ item, onBack }: { item: LMSItem; onBack: () => void }) {
    const { t } = useI18n();
  return (
    <div className="leads-page-root min-h-screen">
      <div className="leads-page-bg" aria-hidden />
      <div className="leads-page-ornament" aria-hidden />
      <div className={cn(
        'leads-page relative z-10 p-6 lg:p-8 space-y-5 mx-auto',
        item.type === 'presentation' || item.type === 'video' || item.type === 'pdf'
          ? 'max-w-7xl'
          : 'max-w-4xl',
      )}>
        {/* Навигация «назад» */}
        <div className="flex items-center gap-2 text-sm">
          <Button variant="ghost" size="sm" onClick={onBack}
            className="gap-2 text-[color:var(--theme-accent-link-dim)] hover:text-[color:var(--app-text)] hover:bg-transparent px-0">
            <ArrowLeft className="size-4" />
            {t('lms.lMSPage.обучение')}</Button>
          <span className="text-[color:var(--theme-accent-icon-dim)]">/</span>
          <span className="text-[color:var(--app-text-muted)] font-medium truncate max-w-[200px]">{item.title}</span>
        </div>

        {/* Метаданные материала */}
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            {item.targetRole !== 'all' && (
              <span className="rounded-full border border-[color:var(--hub-card-border)] bg-[var(--nav-item-bg-active)] px-2.5 py-0.5 text-xs text-[color:var(--hub-body)]">
                {ROLE_LABELS[item.targetRole]}
              </span>
            )}
            {item.readTime && (
              <span className="flex items-center gap-1 text-xs text-[color:var(--workspace-text-muted)]">
                <Clock className="size-3" />{item.readTime}
              </span>
            )}
          </div>
          <h1 className="text-2xl font-normal text-[color:var(--app-text)]">{item.title}</h1>
          <p className="text-sm text-[color:var(--hub-desc)]">{item.description}</p>
        </div>

        {/* Карточка с содержимым */}
        <div className="rounded-2xl border border-[color:var(--hub-card-border)] bg-[var(--hub-card-bg)] shadow-xl overflow-hidden p-5 sm:p-6">
          <ItemContentViewer item={item} />
        </div>
      </div>
    </div>
  )
}

// ─── Вкладка «Курсы» ──────────────────────────────────────────────────────────

function CoursesTab({
  courses,
  canAdmin,
  onCreate,
  onEdit,
  onDelete,
}: {
  courses: LMSCourse[]
  canAdmin: boolean
  onCreate: () => void
  onEdit: (course: LMSCourse) => void
  onDelete: (id: string) => void
}) {
    const { t } = useI18n();
  const navigate = useNavigate()
  const { currentUser } = useAuth()
  const userRole = (currentUser?.role ?? 'manager') as TargetRole
  const progressVersion = useLmsProgress()

  const visibleCourses = useMemo(
    () => courses.filter((c) => c.targetRoles.includes('all') || c.targetRoles.includes(userRole)),
    [courses, userRole],
  )

  const progressByCourse = useMemo(() => {
    const map: Record<string, number> = {}
    for (const c of visibleCourses) map[c.id] = getCourseProgressPct(c, getCourseProgress(c.id))
    return map
  }, [visibleCourses, progressVersion])

  return (
    <div className="space-y-5">
      {visibleCourses.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-[color:var(--hub-card-border)] bg-[var(--hub-card-bg)] py-16 text-center">
          <GraduationCap className="size-10 text-[color:var(--theme-accent-icon-dim)] opacity-60" />
          <p className="mt-3 font-normal text-[color:var(--app-text)]">{t('lms.lMSPage.курсов_пока_нет')}</p>
          <p className="mt-1 text-sm text-[color:var(--hub-desc)]">
            {canAdmin ? 'Создайте первый курс — соберите его из материалов библиотеки.' : 'Загляните позже — администратор готовит программу.'}
          </p>
          {canAdmin && (
            <button type="button" onClick={onCreate} className="alphabase-section-primary !normal-case mt-5">
              <Plus className="size-4 stroke-[2.5]" />
              {t('lms.lMSPage.создать_курс')}</button>
          )}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {visibleCourses.map((course) => {
            const pct = progressByCourse[course.id] ?? 0
            const totalUnits = course.itemIds.length + (course.finalQuiz ? 1 : 0)
            return (
              <div
                key={course.id}
                className="group relative rounded-2xl border border-[color:var(--hub-card-border)] bg-[var(--hub-card-bg)] p-5 cursor-pointer hover:border-[color:var(--hub-card-border-hover)] hover:bg-[var(--hub-action-hover)] transition-all"
                onClick={() => navigate(`/dashboard/lms/course/${course.id}`)}
              >
                {canAdmin && (
                  <div className="absolute top-3 right-3 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); onEdit(course) }}
                      className="flex size-7 items-center justify-center rounded-full bg-[var(--hub-card-bg)] border border-[color:var(--hub-card-border)] text-[color:var(--hub-badge-soon-fg)] hover:text-emerald-300 hover:border-emerald-500/40 transition-colors"
                      title={t('lms.lMSPage.редактировать')}
                    >
                      <Pencil className="size-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); if (window.confirm(`Удалить курс «${course.title}»?`)) onDelete(course.id) }}
                      className="flex size-7 items-center justify-center rounded-full bg-[var(--hub-card-bg)] border border-[color:var(--hub-card-border)] text-[color:var(--hub-badge-soon-fg)] hover:text-red-400 hover:border-red-500/40 transition-colors"
                      title={t('lms.lMSPage.удалить')}
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>
                )}

                <div className="text-3xl mb-3">{course.emoji}</div>
                <div className="space-y-2">
                  <p className="font-normal text-[color:var(--theme-accent-heading)] leading-snug">{course.title}</p>
                  <p className="text-sm text-[color:var(--workspace-text-muted)] line-clamp-2">{course.description}</p>
                </div>

                {/* Прогресс */}
                <div className="mt-4 space-y-1.5">
                  <div className="h-1.5 w-full rounded-full bg-[color:var(--hub-card-border)] overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{
                        width: `${pct}%`,
                        background: pct === 100 ? '#6fcf97' : 'var(--gold)',
                      }}
                    />
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-[color:var(--theme-accent-icon-dim)]">
                      {totalUnits} {totalUnits === 1 ? 'блок' : totalUnits < 5 ? 'блока' : 'блоков'}
                      {course.finalQuiz && ' + тест'}
                    </span>
                    <span className={cn('font-normal', pct === 100 ? 'text-emerald-300' : pct > 0 ? 'text-[color:var(--gold)]' : 'text-[color:var(--hub-badge-soon-fg)]')}>
                      {pct === 0 ? 'Начать' : pct === 100 ? 'Пройден' : `${pct}%`}
                      {pct < 100 && <ChevronRight className="inline size-3 ml-0.5" />}
                    </span>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ─── Главная страница ─────────────────────────────────────────────────────────

export function LMSPage() {
    const { t } = useI18n();
  const navigate = useNavigate()
  const location = useLocation()
  const [searchParams, setSearchParams] = useSearchParams()
  const activeTab = useMemo(() => parseLmsTab(searchParams), [searchParams])
  const { currentUser } = useAuth()
  const userRole = currentUser?.role ?? 'manager'
  const canAdmin = true

  const {
    items,
    courses,
    loading,
    createItem,
    updateItem,
    deleteItem,
    createCourse,
    updateCourse,
    deleteCourse,
  } = useLmsLibrary()

  const backendStatus = useBackendStatus()
  const toastShown = useRef(false)

  useEffect(() => {
    if (loading || toastShown.current || backendStatus === null) return
    toastShown.current = true
    toast(backendStatus ? '🟢 Режим онлайн — связь с сервером установлена' : '⚪ Оффлайн-режим — данные загружены из кэша', {
      duration: 3000,
    })
  }, [backendStatus, loading])
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState<SortKey>('title')
  const [openItem, setOpenItem] = useState<LMSItem | null>(null)

  // Диалог редактирования материала
  const [adminOpen, setAdminOpen] = useState(false)
  const [editingItem, setEditingItem] = useState<LMSItem | null>(null)

  // Диалог редактирования курса
  const [courseDialogOpen, setCourseDialogOpen] = useState(false)
  const [editingCourse, setEditingCourse] = useState<LMSCourse | null>(null)

  useEffect(() => {
    if (!location.pathname.includes('/lms/add')) return
    if (!canAdmin) {
      navigate('/dashboard/lms/browse', { replace: true })
      return
    }
    setEditingItem(null)
    setAdminOpen(true)
  }, [location.pathname, canAdmin, navigate])

  const handleAdminClose = () => {
    setAdminOpen(false)
    setEditingItem(null)
    if (location.pathname.includes('/lms/add')) {
      navigate('/dashboard/lms/browse')
    }
  }

  const handleOpenCreate = () => {
    setEditingItem(null)
    setAdminOpen(true)
  }

  const handleOpenEdit = (item: LMSItem) => {
    setEditingItem(item)
    setAdminOpen(true)
  }

  const handleSaveItem = async (saved: LMSItem) => {
    if (editingItem) await updateItem(saved)
    else await createItem(saved)
    setAdminOpen(false)
    setEditingItem(null)
  }

  const handleDeleteItem = (id: string) => {
    void deleteItem(id)
  }

  // Курсы
  const handleOpenCreateCourse = () => {
    setEditingCourse(null)
    setCourseDialogOpen(true)
  }
  const handleOpenEditCourse = (course: LMSCourse) => {
    setEditingCourse(course)
    setCourseDialogOpen(true)
  }
  const handleSaveCourse = async (saved: LMSCourse) => {
    if (editingCourse) await updateCourse(saved)
    else await createCourse(saved)
    setCourseDialogOpen(false)
    setEditingCourse(null)
  }
  const handleDeleteCourse = (id: string) => {
    void deleteCourse(id)
  }

  const filtered = useMemo(() => {
    if (activeTab === 'courses') return []
    const q = search.trim().toLowerCase()
    return items.filter((item) => {
      if (item.type !== TAB_TO_ITEM_TYPE[activeTab]) return false
      if (userRole === 'manager' && item.targetRole !== 'all' && item.targetRole !== 'manager') return false
      if (userRole === 'rop' && item.targetRole !== 'all' && item.targetRole !== 'rop' && item.targetRole !== 'manager') return false
      if (!q) return true
      return (
        item.title.toLowerCase().includes(q) ||
        item.description.toLowerCase().includes(q) ||
        (item.tags?.some((t) => t.toLowerCase().includes(q)) ?? false)
      )
    })
  }, [items, activeTab, userRole, search])

  const displayItems = useMemo(() => {
    const list = [...filtered]
    if (sort === 'title') list.sort((a, b) => a.title.localeCompare(b.title, 'ru'))
    else if (sort === 'time-asc') list.sort((a, b) => readMinutesForSort(a.readTime) - readMinutesForSort(b.readTime))
    else list.sort((a, b) => readMinutesForSort(b.readTime) - readMinutesForSort(a.readTime))
    return list
  }, [filtered, sort])

  if (openItem) {
    return <ItemDetail item={openItem} onBack={() => setOpenItem(null)} />
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[var(--app-bg)] flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="relative size-6">
            <div
              className="absolute inset-0 rounded-full border-2 border-transparent animate-spin"
              style={{ borderTopColor: 'var(--gold)', borderRightColor: 'var(--gold)' }}
            />
          </div>
          <span className="text-sm" style={{ color: 'var(--workspace-text-muted)' }}>{t('lms.lMSPage.загрузка')}</span>
        </div>
      </div>
    )
  }

  return (
    <>
      <div className="min-h-screen bg-[var(--app-bg)] text-[var(--app-text)]">
        <div className="space-y-8 p-6 lg:p-8">
          {/* Header */}
          <div>
            <p className="text-xs uppercase tracking-widest text-[color:var(--hub-stat-label)] mb-1">{t('lms.lMSPage.база_знаний')}</p>
            <h1 className="text-3xl font-normal text-[color:var(--app-text)]">{t('lms.lMSPage.обучение')}</h1>
          </div>

          {/* Tabs + Add button */}
          <div className="space-y-6">
            <div className="flex flex-wrap items-end justify-between gap-3 border-b border-[color:var(--hub-card-border)]">
              <div className="-mb-px flex flex-wrap items-stretch gap-1">
                {TABS.map((tab) => {
                  const active = activeTab === tab.id
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => {
                        setSearch('')
                        setSort('title')
                        if (tab.id === 'scripts') {
                          setSearchParams({}, { replace: true })
                        } else {
                          setSearchParams({ tab: tab.id }, { replace: true })
                        }
                      }}
                      className={cn(
                        'group flex items-center gap-1.5 border-b-2 px-3 py-2.5 text-sm font-medium transition-colors',
                        active
                          ? 'border-[color:var(--gold)] text-[color:var(--gold-light)]'
                          : 'border-transparent text-[color:var(--hub-badge-soon-fg)] hover:text-[color:var(--app-text)] hover:border-[color:var(--hub-card-border-hover)]',
                      )}
                    >
                      {tab.icon}
                      {tab.label}
                    </button>
                  )
                })}
              </div>

              {canAdmin && activeTab === 'courses' && (
                <button type="button" onClick={handleOpenCreateCourse} className="alphabase-section-primary !normal-case">
                  <Plus className="size-4 stroke-[2.5]" />
                  {t('lms.lMSPage.создать_курс')}</button>
              )}
              {canAdmin && activeTab !== 'courses' && (
                <button type="button" onClick={handleOpenCreate} className="alphabase-section-primary !normal-case">
                  <Plus className="size-4 stroke-[2.5]" />
                  {t('lms.lMSPage.добавить_материал')}</button>
              )}
            </div>

            {activeTab === 'courses' ? (
              <CoursesTab
                courses={courses}
                canAdmin={canAdmin}
                onCreate={handleOpenCreateCourse}
                onEdit={handleOpenEditCourse}
                onDelete={handleDeleteCourse}
              />
            ) : (
              <>
                {displayItems.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-20 text-[color:var(--theme-accent-icon-dim)]">
                    <Search className="size-10 mb-4 opacity-40" />
                    <p className="font-medium">{t('lms.lMSPage.ничего_не_найдено')}</p>
                    <p className="text-sm opacity-70">{t('lms.lMSPage.попробуйте_изменить')}</p>
                  </div>
                ) : (
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {displayItems.map((item) => (
                      <ItemCard
                        key={item.id}
                        item={item}
                        onClick={() => setOpenItem(item)}
                        onEdit={canAdmin ? () => handleOpenEdit(item) : undefined}
                        onDelete={canAdmin ? () => handleDeleteItem(item.id) : undefined}
                      />
                    ))}
                  </div>
                )}

                <p className="text-center text-xs text-[color:var(--theme-accent-icon-dim)]">
                  {displayItems.length}{' '}
                  {displayItems.length === 1 ? 'материал' : displayItems.length < 5 ? 'материала' : 'материалов'}
                </p>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Admin dialog: материал */}
      <LMSAdminDialog
        open={adminOpen}
        mode={editingItem ? 'edit' : 'create'}
        item={editingItem}
        onClose={handleAdminClose}
        onSave={handleSaveItem}
      />

      {/* Admin dialog: курс */}
      <CourseAdminDialog
        open={courseDialogOpen}
        mode={editingCourse ? 'edit' : 'create'}
        course={editingCourse}
        allItems={items}
        onClose={() => { setCourseDialogOpen(false); setEditingCourse(null) }}
        onSave={handleSaveCourse}
      />
    </>
  )
}
