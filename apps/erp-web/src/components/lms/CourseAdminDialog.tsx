import { useEffect, useMemo, useState } from 'react'
import {
  X, Plus, Trash2, ArrowUp, ArrowDown, Search, GripVertical, Check,
  BookOpen, MessageSquare, Presentation, Video, FileText, GraduationCap,
} from 'lucide-react'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { cn } from '@/lib/utils'
import type { LMSCourse, LMSCourseFinalQuiz, LMSItem, TargetRole, ContentType } from '@/data/lms-mock'
import { useI18n } from "@/i18n";

// ─── Параметры компонента ────────────────────────────────────────────────────

interface CourseAdminDialogProps {
  open: boolean
  mode: 'create' | 'edit'
  course?: LMSCourse | null
  allItems: LMSItem[]
  onClose: () => void
  onSave: (course: LMSCourse) => void
}

const EMOJI_PRESETS = ['🎯', '👥', '📈', '🏢', '💼', '📊', '💰', '🚀', '🎓', '🧭', '📚', '🛠️']
const ROLE_OPTIONS: Array<{ id: TargetRole; label: string }> = [
  { id: 'manager',  label: 'Менеджер' },
  { id: 'rop',      label: 'РОП' },
  { id: 'director', label: 'Директор' },
  { id: 'all',      label: 'Все роли' },
]

const TYPE_META: Record<ContentType, { label: string; icon: React.ReactNode }> = {
  article:      { label: 'Статья',      icon: <BookOpen className="size-3.5" /> },
  script:       { label: 'Скрипт',      icon: <MessageSquare className="size-3.5" /> },
  presentation: { label: 'Презентация', icon: <Presentation className="size-3.5" /> },
  video:        { label: 'Видео',       icon: <Video className="size-3.5" /> },
  pdf:          { label: 'PDF',         icon: <FileText className="size-3.5" /> },
  quiz:         { label: 'Тест',        icon: <GraduationCap className="size-3.5" /> },
}

// ─── Состояние формы ─────────────────────────────────────────────────────────

interface FormState {
  title: string
  description: string
  emoji: string
  roles: TargetRole[]
  itemIds: string[]
  hasFinalQuiz: boolean
  passingScore: number
  questions: LMSCourseFinalQuiz['questions']
}

function emptyForm(): FormState {
  return {
    title: '',
    description: '',
    emoji: '🎯',
    roles: ['manager'],
    itemIds: [],
    hasFinalQuiz: false,
    passingScore: 70,
    questions: [{ question: '', options: ['', ''], correct: 0 }],
  }
}

function courseToForm(course: LMSCourse): FormState {
  return {
    title: course.title,
    description: course.description,
    emoji: course.emoji,
    roles: course.targetRoles.length ? [...course.targetRoles] : ['manager'],
    itemIds: [...course.itemIds],
    hasFinalQuiz: Boolean(course.finalQuiz),
    passingScore: course.finalQuiz?.passingScore ?? 70,
    questions: course.finalQuiz
      ? course.finalQuiz.questions.map(q => ({ ...q, options: [...q.options] }))
      : [{ question: '', options: ['', ''], correct: 0 }],
  }
}

function formToCourse(form: FormState, existingId?: string): LMSCourse {
  const id = existingId ?? `course-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
  const finalQuiz: LMSCourseFinalQuiz | undefined = form.hasFinalQuiz
    ? {
        passingScore: Math.min(100, Math.max(0, form.passingScore)),
        questions: form.questions
          .map(q => ({
            question: q.question.trim(),
            options: q.options.map(o => o.trim()).filter(Boolean),
            correct: q.correct,
          }))
          .filter(q => q.question && q.options.length >= 2),
      }
    : undefined
  return {
    id,
    title: form.title.trim(),
    description: form.description.trim(),
    emoji: form.emoji || '🎯',
    targetRoles: form.roles.length ? form.roles : ['all'],
    itemIds: form.itemIds,
    finalQuiz: finalQuiz && finalQuiz.questions.length ? finalQuiz : undefined,
  }
}

function validate(form: FormState): string | null {
  if (!form.title.trim()) return 'Укажите название курса'
  if (form.itemIds.length === 0) return 'Добавьте хотя бы один материал в курс'
  if (form.hasFinalQuiz) {
    const valid = form.questions.filter(q => q.question.trim() && q.options.filter(o => o.trim()).length >= 2)
    if (!valid.length) return 'В финальном тесте должен быть хотя бы один вопрос с двумя вариантами'
  }
  return null
}

// ─── Общие классы ────────────────────────────────────────────────────────────

const FIELD =
  'w-full rounded-2xl border border-[color:var(--hub-card-border)] bg-[color-mix(in_srgb,var(--rail-bg)_92%,transparent)] px-3 py-2.5 text-[13px] text-[color:var(--app-text)] placeholder:text-[color:var(--shell-search-ph)] outline-none focus:border-[rgba(52,211,153,0.55)] transition-colors'

function FieldShell({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-normal uppercase tracking-wider text-[color:var(--hub-stat-label)]">{label}</p>
        {hint && <p className="text-[11px] text-[color:var(--theme-accent-icon-dim)]">{hint}</p>}
      </div>
      {children}
    </div>
  )
}

function SectionDivider({ label, action }: { label: string; action?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 pt-1">
      <div className="h-px flex-1 bg-[var(--hub-tile-icon-bg)]" />
      <span className="text-[11px] font-normal uppercase tracking-wider text-[color:var(--theme-accent-icon-dim)]">{label}</span>
      <div className="h-px flex-1 bg-[var(--hub-tile-icon-bg)]" />
      {action}
    </div>
  )
}

// ─── Picker материалов: программа + библиотека ───────────────────────────────

function ProgramAndLibrary({
  itemIds,
  allItems,
  onChange,
}: {
  itemIds: string[]
  allItems: LMSItem[]
  onChange: (ids: string[]) => void
}) {
    const { t } = useI18n();
  const [query, setQuery] = useState('')
  const [typeFilter, setTypeFilter] = useState<ContentType | 'all'>('all')

  const byId = useMemo(() => new Map(allItems.map(it => [it.id, it])), [allItems])
  const selectedItems = useMemo(
    () => itemIds.map(id => byId.get(id)).filter((v): v is LMSItem => Boolean(v)),
    [itemIds, byId],
  )
  const selectedSet = useMemo(() => new Set(itemIds), [itemIds])

  const libraryItems = useMemo(() => {
    const q = query.trim().toLowerCase()
    return allItems.filter(it => {
      if (typeFilter !== 'all' && it.type !== typeFilter) return false
      if (!q) return true
      return (
        it.title.toLowerCase().includes(q) ||
        it.description.toLowerCase().includes(q) ||
        (it.tags?.some(t => t.toLowerCase().includes(q)) ?? false)
      )
    })
  }, [allItems, query, typeFilter])

  function move(idx: number, dir: -1 | 1) {
    const next = [...itemIds]
    const target = idx + dir
    if (target < 0 || target >= next.length) return
    ;[next[idx], next[target]] = [next[target], next[idx]]
    onChange(next)
  }

  function toggle(id: string) {
    onChange(selectedSet.has(id) ? itemIds.filter(i => i !== id) : [...itemIds, id])
  }

  // ── DnD ──
  const [dragIdx, setDragIdx] = useState<number | null>(null)
  const [dragOver, setDragOver] = useState<number | null>(null)

  function onDragStart(idx: number) { setDragIdx(idx) }
  function onDragOver(e: React.DragEvent, idx: number) {
    e.preventDefault()
    setDragOver(idx)
  }
  function onDrop(idx: number) {
    if (dragIdx === null || dragIdx === idx) { setDragIdx(null); setDragOver(null); return }
    const next = [...itemIds]
    const [moved] = next.splice(dragIdx, 1)
    next.splice(idx, 0, moved)
    onChange(next)
    setDragIdx(null)
    setDragOver(null)
  }
  function onDragEnd() { setDragIdx(null); setDragOver(null) }

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {/* Программа */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-[11px] font-normal uppercase tracking-wider text-[color:var(--hub-stat-label)]">
            {t('lms.courseAdminDialog.программа_курса')}</p>
          <span className="text-[11px] text-[color:var(--theme-accent-icon-dim)]">
            {selectedItems.length} {selectedItems.length === 1 ? 'материал' : selectedItems.length < 5 ? 'материала' : 'материалов'}
          </span>
        </div>
        {selectedItems.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-[color:var(--hub-card-border)] bg-[color-mix(in_srgb,var(--rail-bg)_82%,transparent)] px-4 py-10 text-center">
            <BookOpen className="mx-auto size-6 text-[color:var(--theme-accent-icon-dim)] opacity-60" />
            <p className="mt-2 text-[12px] text-[color:var(--hub-stat-label)]">{t('lms.courseAdminDialog.выберите_материалы_и')}</p>
          </div>
        ) : (
          <div className="space-y-1.5">
            {selectedItems.map((item, idx) => {
              const meta = TYPE_META[item.type]
              const isDragging = dragIdx === idx
              const isOver = dragOver === idx && dragIdx !== idx
              return (
                <div
                  key={item.id}
                  draggable
                  onDragStart={() => onDragStart(idx)}
                  onDragOver={e => onDragOver(e, idx)}
                  onDrop={() => onDrop(idx)}
                  onDragEnd={onDragEnd}
                  className={cn(
                    'group flex items-center gap-2 rounded-2xl border bg-[color-mix(in_srgb,var(--rail-bg)_82%,transparent)] px-2.5 py-2 transition-colors',
                    isDragging && 'opacity-40',
                    isOver
                      ? 'border-[rgba(52,211,153,0.55)] bg-[rgba(52,211,153,0.06)]'
                      : 'border-[color:var(--hub-card-border)]',
                  )}
                >
                  <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-[var(--hub-tile-icon-bg)] text-[11px] font-normal text-[color:var(--hub-badge-soon-fg)]">
                    {idx + 1}
                  </span>
                  <GripVertical className="size-3.5 shrink-0 text-[color:var(--theme-accent-icon-dim)] cursor-grab" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] text-[color:var(--app-text)]">{item.title}</p>
                    <div className="flex items-center gap-1.5 text-[11px] text-[color:var(--theme-accent-icon-dim)]">
                      {meta.icon}
                      <span>{meta.label}</span>
                      {item.readTime && <><span>·</span><span>{item.readTime}</span></>}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-0.5">
                    <button type="button" onClick={() => move(idx, -1)} disabled={idx === 0}
                      className="rounded p-1 text-[color:var(--theme-accent-icon-dim)] hover:text-[color:var(--theme-accent-link-dim)] disabled:opacity-20">
                      <ArrowUp className="size-3" />
                    </button>
                    <button type="button" onClick={() => move(idx, 1)} disabled={idx === selectedItems.length - 1}
                      className="rounded p-1 text-[color:var(--theme-accent-icon-dim)] hover:text-[color:var(--theme-accent-link-dim)] disabled:opacity-20">
                      <ArrowDown className="size-3" />
                    </button>
                    <button type="button" onClick={() => toggle(item.id)}
                      className="rounded-full p-1 text-[color:var(--theme-accent-icon-dim)] hover:text-red-400 hover:bg-red-900/20 transition-colors">
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Библиотека */}
      <div className="space-y-2">
        <p className="text-[11px] font-normal uppercase tracking-wider text-[color:var(--hub-stat-label)]">
          {t('lms.courseAdminDialog.библиотека_материало')}</p>
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-[color:var(--theme-accent-icon-dim)]" />
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder={t('lms.courseAdminDialog.поиск_по_названию_те')}
              className={cn(FIELD, 'pl-8')}
            />
          </div>
          <Select value={typeFilter} onValueChange={v => setTypeFilter(v as ContentType | 'all')}>
            <SelectTrigger className="h-10 w-[150px] rounded-2xl border-[color:var(--hub-card-border)] bg-[color-mix(in_srgb,var(--rail-bg)_92%,transparent)] text-[13px] text-[color:var(--app-text)] shadow-none focus:ring-0">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('lms.courseAdminDialog.все_типы')}</SelectItem>
              <SelectItem value="article">{t('lms.courseAdminDialog.статьи')}</SelectItem>
              <SelectItem value="script">{t('lms.courseAdminDialog.скрипты')}</SelectItem>
              <SelectItem value="presentation">{t('lms.courseAdminDialog.презентации')}</SelectItem>
              <SelectItem value="video">{t('lms.courseAdminDialog.видео')}</SelectItem>
              <SelectItem value="pdf">PDF</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="max-h-[420px] space-y-1.5 overflow-y-auto rounded-2xl border border-[color:var(--hub-card-border)] bg-[color-mix(in_srgb,var(--rail-bg)_78%,transparent)] p-2">
          {libraryItems.length === 0 ? (
            <div className="px-3 py-8 text-center text-[12px] text-[color:var(--theme-accent-icon-dim)]">
              {t('lms.courseAdminDialog.ничего_не_найдено')}</div>
          ) : libraryItems.map(item => {
            const isSelected = selectedSet.has(item.id)
            const meta = TYPE_META[item.type]
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => toggle(item.id)}
                className={cn(
                  'flex w-full items-start gap-2 rounded-xl border px-2.5 py-2 text-left transition-colors',
                  isSelected
                    ? 'border-[rgba(52,211,153,0.45)] bg-[rgba(52,211,153,0.08)]'
                    : 'border-[color:var(--hub-card-border)] bg-[color-mix(in_srgb,var(--rail-bg)_92%,transparent)] hover:border-[color:var(--hub-card-border-hover)] hover:bg-[var(--hub-action-hover)]',
                )}
              >
                <div className={cn(
                  'mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-md border transition-colors',
                  isSelected
                    ? 'border-emerald-400/70 bg-emerald-400/20 text-emerald-200'
                    : 'border-[color:var(--hub-card-border)] bg-transparent text-transparent',
                )}>
                  <Check className="size-3" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] text-[color:var(--app-text)]">{item.title}</p>
                  <p className="line-clamp-1 text-[11px] text-[color:var(--hub-desc)]">{item.description}</p>
                  <div className="mt-1 flex items-center gap-1.5 text-[11px] text-[color:var(--theme-accent-icon-dim)]">
                    {meta.icon}
                    <span>{meta.label}</span>
                    {item.readTime && <><span>·</span><span>{item.readTime}</span></>}
                  </div>
                </div>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// ─── Конструктор финального теста ────────────────────────────────────────────

function QuestionsEditor({
  questions,
  onChange,
}: {
  questions: LMSCourseFinalQuiz['questions']
  onChange: (qs: LMSCourseFinalQuiz['questions']) => void
}) {
    const { t } = useI18n();
  function updateQuestion(qi: number, patch: Partial<LMSCourseFinalQuiz['questions'][number]>) {
    onChange(questions.map((q, i) => i === qi ? { ...q, ...patch } : q))
  }
  function addQuestion() {
    onChange([...questions, { question: '', options: ['', ''], correct: 0 }])
  }
  function removeQuestion(qi: number) {
    onChange(questions.filter((_, i) => i !== qi))
  }
  function updateOption(qi: number, oi: number, value: string) {
    const q = questions[qi]
    const opts = q.options.map((o, j) => j === oi ? value : o)
    updateQuestion(qi, { options: opts })
  }
  function addOption(qi: number) {
    const q = questions[qi]
    if (q.options.length >= 6) return
    updateQuestion(qi, { options: [...q.options, ''] })
  }
  function removeOption(qi: number, oi: number) {
    const q = questions[qi]
    if (q.options.length <= 2) return
    const opts = q.options.filter((_, j) => j !== oi)
    const correct = q.correct === oi ? 0 : q.correct > oi ? q.correct - 1 : q.correct
    updateQuestion(qi, { options: opts, correct })
  }

  return (
    <div className="space-y-3">
      {questions.map((q, qi) => (
        <div key={qi} className="rounded-2xl border border-[color:var(--hub-card-border)] bg-[color-mix(in_srgb,var(--rail-bg)_78%,transparent)] p-3 space-y-3">
          <div className="flex items-start gap-2">
            <span className="mt-2 flex size-6 shrink-0 items-center justify-center rounded-full bg-[var(--hub-tile-icon-bg)] text-[11px] font-normal text-[color:var(--hub-badge-soon-fg)]">
              {qi + 1}
            </span>
            <textarea
              value={q.question}
              onChange={e => updateQuestion(qi, { question: e.target.value })}
              placeholder={t('lms.courseAdminDialog.текст_вопроса')}
              rows={2}
              className={cn(FIELD, 'resize-none flex-1')}
            />
            <button type="button" onClick={() => removeQuestion(qi)} disabled={questions.length === 1}
              className="mt-2 rounded-full p-1.5 text-[color:var(--theme-accent-icon-dim)] hover:text-red-400 hover:bg-red-900/20 disabled:opacity-20 transition-colors">
              <Trash2 className="size-3.5" />
            </button>
          </div>
          <div className="space-y-1.5">
            {q.options.map((opt, oi) => {
              const isCorrect = q.correct === oi
              return (
                <div key={oi} className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => updateQuestion(qi, { correct: oi })}
                    title={isCorrect ? 'Правильный ответ' : 'Отметить правильным'}
                    className={cn(
                      'flex size-6 shrink-0 items-center justify-center rounded-full border transition-colors',
                      isCorrect
                        ? 'border-emerald-400/70 bg-emerald-400/20 text-emerald-200'
                        : 'border-[color:var(--hub-card-border)] text-transparent hover:border-[color:var(--hub-card-border-hover)] hover:text-[color:var(--theme-accent-icon-dim)]',
                    )}
                  >
                    <Check className="size-3" />
                  </button>
                  <input
                    value={opt}
                    onChange={e => updateOption(qi, oi, e.target.value)}
                    placeholder={`Вариант ${oi + 1}`}
                    className={cn(FIELD, 'flex-1')}
                  />
                  <button type="button" onClick={() => removeOption(qi, oi)} disabled={q.options.length <= 2}
                    className="rounded p-1 text-[color:var(--theme-accent-icon-dim)] hover:text-red-400 hover:bg-red-900/20 disabled:opacity-20 transition-colors">
                    <Trash2 className="size-3" />
                  </button>
                </div>
              )
            })}
            {q.options.length < 6 && (
              <button
                type="button"
                onClick={() => addOption(qi)}
                className="ml-8 flex items-center gap-1.5 rounded-full border border-dashed border-[color:var(--hub-card-border)] px-3 py-1 text-[11px] text-[color:var(--hub-desc)] hover:border-[color:var(--hub-card-border-hover)] hover:text-[color:var(--app-text-muted)] transition-colors"
              >
                <Plus className="size-3" /> {t('lms.courseAdminDialog.вариант_ответа')}</button>
            )}
          </div>
        </div>
      ))}
      <button
        type="button"
        onClick={addQuestion}
        className="flex items-center gap-1.5 rounded-full border border-dashed border-[color:var(--hub-card-border)] px-3 py-1.5 text-xs text-[color:var(--hub-desc)] hover:border-[color:var(--hub-card-border-hover)] hover:text-[color:var(--app-text-muted)] transition-colors"
      >
        <Plus className="size-3" /> {t('lms.courseAdminDialog.добавить_вопрос')}</button>
    </div>
  )
}

// ─── Основное диалоговое окно ────────────────────────────────────────────────

export function CourseAdminDialog({ open, mode, course, allItems, onClose, onSave }: CourseAdminDialogProps) {
    const { t } = useI18n();
  const [form, setForm] = useState<FormState>(emptyForm)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      setForm(course ? courseToForm(course) : emptyForm())
      setError(null)
    }
  }, [open, course])

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm(prev => ({ ...prev, [key]: value }))

  function toggleRole(role: TargetRole) {
    if (role === 'all') {
      setForm(prev => ({ ...prev, roles: prev.roles.includes('all') ? [] : ['all'] }))
      return
    }
    setForm(prev => {
      const withoutAll = prev.roles.filter(r => r !== 'all')
      const has = withoutAll.includes(role)
      return { ...prev, roles: has ? withoutAll.filter(r => r !== role) : [...withoutAll, role] }
    })
  }

  function handleSave() {
    const err = validate(form)
    if (err) { setError(err); return }
    onSave(formToCourse(form, course?.id))
  }

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent
        showCloseButton={false}
        className="top-[50%] h-[calc(100vh-24px)] w-[calc(100vw-16px)] max-w-4xl translate-y-[-50%] overflow-hidden rounded-[24px] border-0 bg-transparent p-0 shadow-none"
      >
        <div className="flex h-full flex-col overflow-hidden rounded-[24px] border border-[color:var(--hub-card-border)] bg-[radial-gradient(circle_at_top,rgba(16,185,129,0.09),transparent_40%),linear-gradient(180deg,rgba(9,36,28,0.99),rgba(6,20,16,0.98))]">

          {/* Header */}
          <div className="flex shrink-0 items-center justify-between border-b border-[color:var(--hub-tile-icon-border)] px-5 py-4">
            <div className="space-y-0.5">
              <p className="text-[11px] font-normal uppercase tracking-widest text-[color:var(--hub-stat-label)]">
                {t('lms.courseAdminDialog.база_знаний_курс')}</p>
              <h2 className="text-lg font-normal text-[color:var(--app-text)]">
                {mode === 'create' ? 'Новый курс' : 'Редактировать курс'}
              </h2>
            </div>
            <button type="button" onClick={onClose}
              className="flex size-8 items-center justify-center rounded-full border border-[color:var(--hub-tile-icon-border)] text-[color:var(--hub-desc)] hover:border-[color:var(--hub-card-border-hover)] hover:text-[color:var(--app-text)] transition-colors">
              <X className="size-4" />
            </button>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto px-5 py-5 space-y-5">

            <SectionDivider label={t('lms.courseAdminDialog.основное')} />

            <div className="grid grid-cols-[auto_1fr] gap-3">
              <FieldShell label={t('lms.courseAdminDialog.эмодзи')}>
                <div className="flex flex-wrap items-center gap-1.5 rounded-2xl border border-[color:var(--hub-card-border)] bg-[color-mix(in_srgb,var(--rail-bg)_92%,transparent)] p-2 w-fit">
                  {EMOJI_PRESETS.map(e => (
                    <button
                      key={e}
                      type="button"
                      onClick={() => set('emoji', e)}
                      className={cn(
                        'flex size-8 items-center justify-center rounded-xl text-lg transition-all',
                        form.emoji === e ? 'bg-emerald-400/15 ring-1 ring-emerald-400/45' : 'hover:bg-[var(--hub-action-hover)]',
                      )}
                    >{e}</button>
                  ))}
                </div>
              </FieldShell>
              <FieldShell label={t('lms.courseAdminDialog.название')}>
                <input
                  value={form.title}
                  onChange={e => set('title', e.target.value)}
                  placeholder={t('lms.courseAdminDialog.например_базовый_кур')}
                  className={cn(FIELD, !form.title.trim() && error ? 'border-red-500/60' : '')}
                />
              </FieldShell>
            </div>

            <FieldShell label={t('lms.courseAdminDialog.описание')}>
              <textarea
                value={form.description}
                onChange={e => set('description', e.target.value)}
                placeholder={t('lms.courseAdminDialog.о_ч_м_этот_курс_и_ко')}
                rows={2}
                className={cn(FIELD, 'resize-none')}
              />
            </FieldShell>

            <FieldShell label={t('lms.courseAdminDialog.для_кого')} hint="Можно выбрать несколько ролей">
              <div className="flex flex-wrap gap-2">
                {ROLE_OPTIONS.map(r => {
                  const active = form.roles.includes(r.id)
                  return (
                    <button
                      key={r.id}
                      type="button"
                      onClick={() => toggleRole(r.id)}
                      className={cn(
                        'flex items-center gap-1.5 rounded-2xl border px-3 py-1.5 text-[12px] font-medium transition-all',
                        active
                          ? 'border-emerald-400/60 bg-emerald-400/12 text-emerald-300'
                          : 'border-[color:var(--hub-card-border)] bg-[color-mix(in_srgb,var(--rail-bg)_82%,transparent)] text-[color:var(--hub-badge-soon-fg)] hover:border-[color:var(--hub-card-border-hover)] hover:text-[color:var(--theme-accent-heading)]',
                      )}
                    >
                      {r.label}
                      {active && <Check className="size-3" />}
                    </button>
                  )
                })}
              </div>
            </FieldShell>

            <SectionDivider label={t('lms.courseAdminDialog.программа')} />

            <ProgramAndLibrary
              itemIds={form.itemIds}
              allItems={allItems}
              onChange={ids => set('itemIds', ids)}
            />

            <SectionDivider label={t('lms.courseAdminDialog.финальный_тест')} action={
              <button
                type="button"
                onClick={() => set('hasFinalQuiz', !form.hasFinalQuiz)}
                className={cn(
                  'ml-1 flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors',
                  form.hasFinalQuiz
                    ? 'border-emerald-400/55 bg-emerald-400/12 text-emerald-300'
                    : 'border-[color:var(--hub-card-border)] bg-[var(--hub-action-hover)] text-[color:var(--hub-badge-soon-fg)] hover:border-[color:var(--hub-card-border-hover)]',
                )}
              >
                {form.hasFinalQuiz ? <><Check className="size-3" /> {t('lms.courseAdminDialog.включ_н')}</> : 'Включить'}
              </button>
            } />

            {form.hasFinalQuiz && (
              <div className="space-y-4">
                <FieldShell label={t('lms.courseAdminDialog.проходной_балл')} hint="0–100">
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={form.passingScore}
                    onChange={e => set('passingScore', Number(e.target.value) || 0)}
                    className={cn(FIELD, 'max-w-[140px]')}
                  />
                </FieldShell>
                <FieldShell label={t('lms.courseAdminDialog.вопросы')} hint="2–6 вариантов на вопрос; зелёный круг = верный">
                  <QuestionsEditor questions={form.questions} onChange={qs => set('questions', qs)} />
                </FieldShell>
              </div>
            )}

            {error && (
              <div className="rounded-xl border border-red-500/30 bg-red-900/20 px-4 py-3 text-sm text-red-300">
                {error}
              </div>
            )}

            <div className="h-2" />
          </div>

          {/* Footer */}
          <div className="flex shrink-0 items-center justify-end gap-2 border-t border-[color:var(--hub-tile-icon-border)] px-5 py-4">
            <button
              type="button"
              onClick={onClose}
              className="rounded-full border border-[color:var(--hub-card-border)] px-5 py-2 text-[13px] font-medium text-[color:var(--hub-body)] hover:border-[color:var(--hub-card-border-hover)] hover:text-[color:var(--app-text)] transition-colors"
            >
              {t('lms.courseAdminDialog.отмена')}</button>
            <button type="button" onClick={handleSave} className="alphabase-section-primary !normal-case px-5 py-2 text-[13px]">
              {mode === 'create' ? 'Создать курс' : 'Сохранить'}
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
