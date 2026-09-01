import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  BookOpen, MessageSquare, Presentation, Video, FileText, GraduationCap,
  CheckCircle2, Clock, ChevronRight, Trophy, RotateCcw, ArrowLeft,
} from 'lucide-react'
import { getCourseItems, getCourseDurationMinutes } from '@/data/lms-mock'
import type { ContentType, LMSItem } from '@/data/lms-mock'
import { DashboardShell } from '@/components/layout/DashboardShell'
import { getCourseProgress, getCourseProgressPct, resetCourseProgress } from './progress'
import { useLmsProgress } from './useLmsProgress'
import { useLmsLibrary } from './useLms'
import { cn } from '@/lib/utils'
import { useI18n } from "@/i18n";

const TYPE_ICON: Record<ContentType, React.ReactNode> = {
  article:      <BookOpen className="size-3.5" />,
  script:       <MessageSquare className="size-3.5" />,
  presentation: <Presentation className="size-3.5" />,
  video:        <Video className="size-3.5" />,
  pdf:          <FileText className="size-3.5" />,
  quiz:         <GraduationCap className="size-3.5" />,
}

const TYPE_LABEL: Record<ContentType, string> = {
  article: 'Статья', script: 'Скрипт', presentation: 'Презентация',
  video: 'Видео', pdf: 'PDF', quiz: 'Тест',
}

export function CoursePage() {
    const { t } = useI18n();
  const { courseId } = useParams<{ courseId: string }>()
  const navigate = useNavigate()
  const { courses, items: allItems } = useLmsLibrary()

  const course = courses.find(c => c.id === courseId)
  const [progressTick, setProgressTick] = useState(0)
  const progressVersion = useLmsProgress()
  const progress = useMemo(() => courseId ? getCourseProgress(courseId) : { completedItems: [] }, [courseId, progressTick, progressVersion])

  // Перечитываем прогресс когда возвращаемся со страницы урока
  useEffect(() => {
    function onFocus() { setProgressTick(t => t + 1) }
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [])

  if (!course) {
    return (
      <DashboardShell>
        <div className="flex min-h-[60vh] items-center justify-center text-[color:var(--hub-desc)]">
          {t('lms.coursePage.курс_не_найден')}</div>
      </DashboardShell>
    )
  }

  const items: LMSItem[] = course ? getCourseItems(course, allItems) : []
  const completedSet = new Set(progress.completedItems)
  const pct = getCourseProgressPct(course, progress)
  const totalMin = getCourseDurationMinutes(course)
  const totalUnits = course.itemIds.length + (course.finalQuiz ? 1 : 0)
  const doneUnits = items.filter(i => completedSet.has(i.id)).length + (course.finalQuiz && progress.finalQuizPassed ? 1 : 0)

  return (
    <DashboardShell>
      <div className="min-h-screen bg-[var(--app-bg)] text-[var(--app-text)]">
        <div className="mx-auto max-w-7xl space-y-8 p-6 lg:p-8">

          {/* Breadcrumb */}
          <button
            type="button"
            onClick={() => navigate('/dashboard/lms/browse?tab=courses')}
            className="inline-flex items-center gap-2 text-sm text-[color:var(--theme-accent-link-dim)] hover:text-[color:var(--app-text)] transition-colors"
          >
            <ArrowLeft className="size-4" />
            {t('lms.coursePage.все_курсы')}</button>

          {/* Hero */}
          <div className="grid gap-6 lg:grid-cols-[1fr_280px]">
            <div className="space-y-4">
              <div className="text-5xl">{course.emoji}</div>
              <div>
                <p className="text-xs uppercase tracking-widest text-[color:var(--hub-stat-label)] mb-1">{t('lms.coursePage.база_знаний_курс')}</p>
                <h1 className="text-3xl font-normal text-[color:var(--app-text)]">{course.title}</h1>
                <p className="mt-2 text-sm text-[color:var(--hub-desc)] leading-relaxed max-w-xl">{course.description}</p>
              </div>
              <div className="flex flex-wrap items-center gap-4 text-xs text-[color:var(--theme-accent-icon-dim)]">
                <span className="flex items-center gap-1.5">
                  <BookOpen className="size-3.5" /> {course.itemIds.length} {t('lms.coursePage.материалов')}</span>
                {course.finalQuiz && (
                  <span className="flex items-center gap-1.5">
                    <GraduationCap className="size-3.5" /> {t('lms.coursePage.финальный_тест')}{course.finalQuiz.passingScore}%
                  </span>
                )}
                {totalMin > 0 && (
                  <span className="flex items-center gap-1.5">
                    <Clock className="size-3.5" /> ~{totalMin} {t('lms.coursePage.мин')}</span>
                )}
              </div>
            </div>

            {/* Прогресс-карточка */}
            <div className="rounded-2xl border border-[color:var(--hub-card-border)] bg-[rgba(10,30,22,0.55)] p-5 space-y-4">
              <div>
                <p className="text-[10px] uppercase tracking-widest text-[color:var(--hub-stat-label)]">{t('lms.coursePage.ваш_прогресс')}</p>
                <p className={cn('text-3xl font-normal mt-1', pct === 100 ? 'text-emerald-300' : 'text-[color:var(--gold)]')}>
                  {pct}%
                </p>
                <p className="text-xs text-[color:var(--hub-badge-soon-fg)]">{doneUnits} {t('lms.coursePage.из')}{totalUnits} {t('lms.coursePage.блоков')}</p>
              </div>
              <div className="h-2 w-full rounded-full bg-[rgba(255,255,255,0.08)] overflow-hidden">
                <div
                  className="h-full rounded-full transition-all"
                  style={{ width: `${pct}%`, background: pct === 100 ? '#6fcf97' : 'var(--gold)' }}
                />
              </div>
              {pct > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    if (window.confirm('Сбросить прогресс по этому курсу?')) {
                      resetCourseProgress(course.id)
                      setProgressTick(t => t + 1)
                    }
                  }}
                  className="inline-flex items-center gap-1.5 text-[11px] text-[color:var(--theme-accent-icon-dim)] hover:text-[color:var(--theme-accent-link-dim)] transition-colors"
                >
                  <RotateCcw className="size-3" /> {t('lms.coursePage.сбросить_прогресс')}</button>
              )}
            </div>
          </div>

          {/* Программа */}
          <div className="space-y-3">
            <p className="text-xs uppercase tracking-widest text-[color:var(--hub-stat-label)]">{t('lms.coursePage.программа_курса')}</p>
            <div className="space-y-2">
              {items.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-[color:var(--hub-card-border)] bg-[var(--hub-card-bg)] py-10 text-center text-sm text-[color:var(--hub-desc)]">
                  {t('lms.coursePage.в_этом_курсе_пока_не')}</div>
              ) : items.map((item, idx) => {
                const done = completedSet.has(item.id)
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => navigate(`/dashboard/lms/lesson/${item.id}?courseId=${course.id}`)}
                    className={cn(
                      'group flex w-full items-center gap-4 rounded-2xl border bg-[rgba(10,30,22,0.4)] px-4 py-3.5 text-left transition-colors',
                      done
                        ? 'border-emerald-500/30 bg-emerald-500/[0.05] hover:bg-emerald-500/[0.08]'
                        : 'border-[color:var(--hub-card-border)] hover:border-[color:var(--hub-card-border-hover)] hover:bg-[var(--hub-action-hover)]',
                    )}
                  >
                    <div className={cn(
                      'flex size-9 shrink-0 items-center justify-center rounded-full',
                      done ? 'bg-emerald-500/15 text-emerald-300' : 'bg-[var(--hub-tile-icon-bg)] text-[color:var(--hub-badge-soon-fg)]',
                    )}>
                      {done ? <CheckCircle2 className="size-5" /> : <span className="text-sm font-normal">{idx + 1}</span>}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className={cn('font-normal leading-snug', done ? 'text-emerald-300' : 'text-[color:var(--app-text)]')}>
                        {item.title}
                      </p>
                      <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-[color:var(--theme-accent-icon-dim)]">
                        <span className="inline-flex items-center gap-1">
                          {TYPE_ICON[item.type]} {TYPE_LABEL[item.type]}
                        </span>
                        {item.readTime && <><span>·</span><span>{item.readTime}</span></>}
                        {item.description && (
                          <>
                            <span>·</span>
                            <span className="truncate max-w-[280px]">{item.description}</span>
                          </>
                        )}
                      </div>
                    </div>
                    <ChevronRight className="size-4 shrink-0 text-[color:var(--theme-accent-icon-dim)] transition-transform group-hover:translate-x-0.5 group-hover:text-[color:var(--theme-accent-link-dim)]" />
                  </button>
                )
              })}

              {/* Финальный тест как отдельный блок */}
              {course.finalQuiz && (
                <button
                  type="button"
                  onClick={() => navigate(`/dashboard/lms/test/${course.id}`)}
                  disabled={items.length > 0 && doneUnits < course.itemIds.length}
                  className={cn(
                    'group relative flex w-full items-center gap-4 rounded-2xl border px-4 py-4 text-left transition-colors',
                    progress.finalQuizPassed
                      ? 'border-emerald-500/35 bg-emerald-500/[0.07] hover:bg-emerald-500/[0.1]'
                      : doneUnits < course.itemIds.length
                        ? 'border-[color:var(--hub-card-border)] bg-[rgba(10,30,22,0.4)] opacity-50 cursor-not-allowed'
                        : 'border-[rgba(230,195,100,0.45)] bg-[rgba(230,195,100,0.06)] hover:bg-[rgba(230,195,100,0.1)]',
                  )}
                >
                  <div className={cn(
                    'flex size-9 shrink-0 items-center justify-center rounded-full',
                    progress.finalQuizPassed
                      ? 'bg-emerald-500/15 text-emerald-300'
                      : 'bg-[rgba(230,195,100,0.15)] text-[color:var(--gold)]',
                  )}>
                    {progress.finalQuizPassed ? <Trophy className="size-5" /> : <GraduationCap className="size-5" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className={cn('font-normal leading-snug', progress.finalQuizPassed ? 'text-emerald-300' : 'text-[color:var(--gold-light)]')}>
                      {t('lms.coursePage.финальный_тест_курса')}</p>
                    <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-[color:var(--theme-accent-icon-dim)]">
                      <span>{course.finalQuiz.questions.length} {t('lms.coursePage.вопросов')}</span>
                      <span>·</span>
                      <span>{t('lms.coursePage.проходной_балл')}{course.finalQuiz.passingScore}%</span>
                      {progress.finalQuizScore !== undefined && (
                        <>
                          <span>·</span>
                          <span className={progress.finalQuizPassed ? 'text-emerald-300' : 'text-amber-300'}>
                            {t('lms.coursePage.ваш_результат')}{progress.finalQuizScore}%
                          </span>
                        </>
                      )}
                      {!progress.finalQuizPassed && items.length > 0 && doneUnits < course.itemIds.length && (
                        <>
                          <span>·</span>
                          <span>{t('lms.coursePage.сначала_пройдите_все')}</span>
                        </>
                      )}
                    </div>
                  </div>
                  <ChevronRight className="size-4 shrink-0 text-[color:var(--theme-accent-icon-dim)] transition-transform group-hover:translate-x-0.5 group-hover:text-[color:var(--gold)]" />
                </button>
              )}
            </div>
          </div>

          {pct === 100 && (
            <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/[0.08] p-6 flex flex-col items-center text-center">
              <Trophy className="size-10 text-emerald-300" />
              <p className="mt-3 text-lg font-normal text-emerald-200">{t('lms.coursePage.курс_пройден')}</p>
              <p className="mt-1 text-sm text-[color:var(--hub-desc)]">{t('lms.coursePage.все_материалы_изучен')}{course.finalQuiz ? ', тест сдан' : ''}.</p>
            </div>
          )}

        </div>
      </div>
    </DashboardShell>
  )
}

