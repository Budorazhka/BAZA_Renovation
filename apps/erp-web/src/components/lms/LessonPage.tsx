import { useMemo, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import {
  ArrowLeft, ArrowRight, Check, BookOpen, MessageSquare,
  Presentation, Video, FileText, Clock, GraduationCap,
} from 'lucide-react'
import { getCourseItems } from '@/data/lms-mock'
import type { ContentType } from '@/data/lms-mock'
import { DashboardShell } from '@/components/layout/DashboardShell'
import { ItemContentViewer } from './viewers'
import { getCourseProgress, setItemCompleted } from './progress'
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

export function LessonPage() {
    const { t } = useI18n();
  // ВНИМАНИЕ: параметр URL называется `lessonId` исторически — фактически это id LMSItem.
  const { lessonId } = useParams<{ lessonId: string }>()
  const [searchParams] = useSearchParams()
  const courseId = searchParams.get('courseId')
  const navigate = useNavigate()
  const { courses, items: allItems } = useLmsLibrary()

  const course = useMemo(
    () => (courseId ? courses.find(c => c.id === courseId) ?? null : null),
    [courseId, courses],
  )
  const courseItems = useMemo(() => (course ? getCourseItems(course, allItems) : []), [course, allItems])
  const item = useMemo(
    () => (lessonId ? allItems.find(i => i.id === lessonId) ?? courseItems.find(i => i.id === lessonId) ?? null : null),
    [lessonId, courseItems, allItems],
  )

  const itemIdxInCourse = course && item ? course.itemIds.indexOf(item.id) : -1
  const prevItem = itemIdxInCourse > 0 ? courseItems.find(i => i.id === course!.itemIds[itemIdxInCourse - 1]) : null
  const nextItem = itemIdxInCourse >= 0 && itemIdxInCourse < (course?.itemIds.length ?? 0) - 1
    ? courseItems.find(i => i.id === course!.itemIds[itemIdxInCourse + 1])
    : null
  const isLastInCourse = course && itemIdxInCourse >= 0 && itemIdxInCourse === course.itemIds.length - 1

  // Прогресс — берём один раз при монтировании и обновляем локально
  const [progressTick, setProgressTick] = useState(0)
  const progressVersion = useLmsProgress()
  const progress = useMemo(
    () => (course ? getCourseProgress(course.id) : { completedItems: [] as string[] }),
    [course, progressTick, progressVersion],
  )
  const isCompleted = item ? progress.completedItems.includes(item.id) : false

  function toggleCompleted(done: boolean) {
    if (!course || !item) return
    setItemCompleted(course.id, item.id, done)
    setProgressTick(t => t + 1)
  }

  function goNext() {
    if (!course) return
    if (nextItem) {
      navigate(`/dashboard/lms/lesson/${nextItem.id}?courseId=${course.id}`)
    } else if (course.finalQuiz) {
      navigate(`/dashboard/lms/test/${course.id}`)
    } else {
      navigate(`/dashboard/lms/course/${course.id}`)
    }
  }

  if (!item) {
    return (
      <DashboardShell>
        <div className="flex min-h-[60vh] items-center justify-center text-[color:var(--hub-desc)]">
          {t('lms.lessonPage.материал_не_найден')}</div>
      </DashboardShell>
    )
  }

  return (
    <DashboardShell>
      <div className="min-h-screen bg-[var(--app-bg)] text-[var(--app-text)]">
        <div className="mx-auto max-w-7xl space-y-5 p-6 lg:p-8">

          {/* Breadcrumb */}
          <div className="flex items-center gap-2 text-sm">
            <button
              type="button"
              onClick={() => navigate(course ? `/dashboard/lms/course/${course.id}` : '/dashboard/lms/browse')}
              className="inline-flex items-center gap-2 text-[color:var(--theme-accent-link-dim)] hover:text-[color:var(--app-text)] transition-colors"
            >
              <ArrowLeft className="size-4" />
              {course ? course.title : 'Обучение'}
            </button>
          </div>

          {/* Метаданные + прогресс-индикатор в курсе */}
          <div className="space-y-2">
            {course && itemIdxInCourse >= 0 && (
              <p className="text-[11px] uppercase tracking-widest text-[color:var(--hub-stat-label)]">
                {t('lms.lessonPage.урок')}{itemIdxInCourse + 1} {t('lms.lessonPage.из')}{course.itemIds.length}
              </p>
            )}
            <h1 className="text-2xl font-normal text-[color:var(--app-text)]">{item.title}</h1>
            <p className="text-sm text-[color:var(--hub-desc)]">{item.description}</p>
            <div className="flex flex-wrap items-center gap-3 text-xs text-[color:var(--theme-accent-icon-dim)]">
              <span className="inline-flex items-center gap-1.5">
                {TYPE_ICON[item.type]} {TYPE_LABEL[item.type]}
              </span>
              {item.readTime && (
                <span className="inline-flex items-center gap-1">
                  <Clock className="size-3" /> {item.readTime}
                </span>
              )}
              {item.tags?.map(t => (
                <span key={t} className="rounded-full bg-[var(--nav-item-bg-active)] px-2 py-0.5">{t}</span>
              ))}
            </div>
          </div>

          {/* Контент: широкие форматы — на всю ширину, текстовые — узкая колонка для читаемости */}
          <div className={cn(
            'rounded-2xl border border-[color:var(--hub-card-border)] bg-[rgba(10,35,24,0.85)] shadow-xl overflow-hidden p-5 sm:p-6 lg:p-8',
            (item.type === 'article' || item.type === 'script' || item.type === 'quiz') && 'mx-auto w-full max-w-4xl',
          )}>
            <ItemContentViewer item={item} />
          </div>

          {/* Шаги в курсе */}
          {course && (
            <div className="space-y-3">
              {/* Тогглер «пройдено» */}
              <button
                type="button"
                onClick={() => toggleCompleted(!isCompleted)}
                className={cn(
                  'flex w-full items-center justify-center gap-2 rounded-2xl border px-4 py-3 text-sm font-medium transition-colors',
                  isCompleted
                    ? 'border-emerald-500/45 bg-emerald-500/[0.1] text-emerald-300 hover:bg-emerald-500/[0.15]'
                    : 'border-[rgba(230,195,100,0.45)] bg-[rgba(230,195,100,0.08)] text-[color:var(--gold-light)] hover:bg-[rgba(230,195,100,0.14)]',
                )}
              >
                {isCompleted ? <><Check className="size-4" /> {t('lms.lessonPage.урок_пройден')}</> : 'Отметить пройденным'}
              </button>

              {/* Навигация prev/next */}
              <div className="flex flex-col gap-2 sm:flex-row sm:items-stretch sm:justify-between">
                <button
                  type="button"
                  onClick={() => prevItem && navigate(`/dashboard/lms/lesson/${prevItem.id}?courseId=${course.id}`)}
                  disabled={!prevItem}
                  className={cn(
                    'flex items-center gap-2 rounded-2xl border px-4 py-3 text-sm transition-colors max-w-full sm:max-w-[48%]',
                    prevItem
                      ? 'border-[color:var(--hub-card-border)] bg-[var(--hub-action-hover)] text-[color:var(--app-text-muted)] hover:bg-[var(--nav-item-bg-active)]'
                      : 'border-[color:var(--hub-card-border)] bg-transparent text-[color:var(--theme-accent-icon-dim)] cursor-not-allowed opacity-50',
                  )}
                >
                  <ArrowLeft className="size-4 shrink-0" />
                  <div className="min-w-0 text-left">
                    <p className="text-[10px] uppercase tracking-widest text-[color:var(--theme-accent-icon-dim)]">{t('lms.lessonPage.предыдущий')}</p>
                    <p className="truncate">{prevItem?.title ?? '—'}</p>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={goNext}
                  className={cn(
                    'flex items-center gap-2 rounded-2xl border px-4 py-3 text-sm transition-colors max-w-full sm:max-w-[48%]',
                    isLastInCourse && course.finalQuiz
                      ? 'border-[rgba(230,195,100,0.55)] bg-[rgba(230,195,100,0.12)] text-[color:var(--gold-light)] hover:bg-[rgba(230,195,100,0.18)]'
                      : isLastInCourse
                        ? 'border-emerald-500/45 bg-emerald-500/[0.1] text-emerald-300 hover:bg-emerald-500/[0.15]'
                        : 'border-[color:var(--hub-card-border-hover)] bg-[var(--hub-action-hover)] text-[color:var(--app-text-muted)] hover:bg-[var(--nav-item-bg-active)]',
                  )}
                >
                  <div className="min-w-0 text-right">
                    <p className="text-[10px] uppercase tracking-widest text-[color:var(--theme-accent-icon-dim)]">
                      {isLastInCourse && course.finalQuiz ? 'К тесту' : isLastInCourse ? 'Завершить' : 'Следующий'}
                    </p>
                    <p className="truncate">
                      {nextItem?.title ?? (course.finalQuiz ? 'Финальный тест' : 'К программе')}
                    </p>
                  </div>
                  <ArrowRight className="size-4 shrink-0" />
                </button>
              </div>
            </div>
          )}

        </div>
      </div>
    </DashboardShell>
  )
}
