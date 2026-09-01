import { useMemo } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, GraduationCap } from 'lucide-react'
import { DashboardShell } from '@/components/layout/DashboardShell'
import { QuizViewer } from './viewers'
import { setFinalQuizResult } from './progress'
import { useLmsLibrary } from './useLms'
import { useI18n } from "@/i18n";

export function TestPage() {
    const { t } = useI18n();
  // ВНИМАНИЕ: исторически параметр URL — `lessonId`. Теперь по факту это courseId.
  const { lessonId } = useParams<{ lessonId: string }>()
  const navigate = useNavigate()
  const courseId = lessonId
  const { courses } = useLmsLibrary()

  const course = useMemo(
    () => (courseId ? courses.find(c => c.id === courseId) ?? null : null),
    [courseId, courses],
  )

  if (!course || !course.finalQuiz) {
    return (
      <DashboardShell>
        <div className="flex min-h-[60vh] items-center justify-center text-[color:var(--hub-desc)]">
          {t('lms.testPage.тест_не_найден')}</div>
      </DashboardShell>
    )
  }

  return (
    <DashboardShell>
      <div className="min-h-screen bg-[var(--app-bg)] text-[var(--app-text)]">
        <div className="mx-auto max-w-3xl space-y-5 p-6 lg:p-8">

          <button
            type="button"
            onClick={() => navigate(`/dashboard/lms/course/${course.id}`)}
            className="inline-flex items-center gap-2 text-sm text-[color:var(--theme-accent-link-dim)] hover:text-[color:var(--app-text)] transition-colors"
          >
            <ArrowLeft className="size-4" />
            {course.title}
          </button>

          <div className="space-y-1">
            <p className="text-[11px] uppercase tracking-widest text-[color:var(--hub-stat-label)]">{t('lms.testPage.финальный_тест_курса')}</p>
            <h1 className="text-2xl font-normal text-[color:var(--app-text)] flex items-center gap-3">
              <GraduationCap className="size-6 text-[color:var(--gold)]" />
              {t('lms.testPage.проверка_знаний')}</h1>
            <p className="text-sm text-[color:var(--hub-desc)]">
              {course.finalQuiz.questions.length} {t('lms.testPage.вопросов_проходной_б')}{course.finalQuiz.passingScore}%
            </p>
          </div>

          <div className="rounded-2xl border border-[color:var(--hub-card-border)] bg-[rgba(10,35,24,0.85)] shadow-xl overflow-hidden p-5 sm:p-6">
            <QuizViewer
              questions={course.finalQuiz.questions}
              passingScore={course.finalQuiz.passingScore}
              onComplete={(passed, score) => setFinalQuizResult(course.id, passed, score)}
            />
          </div>

          <div className="text-center">
            <button
              type="button"
              onClick={() => navigate(`/dashboard/lms/course/${course.id}`)}
              className="text-sm text-[color:var(--theme-accent-link-dim)] hover:text-[color:var(--app-text)] transition-colors"
            >
              {t('lms.testPage.вернуться_к_курсу')}</button>
          </div>

        </div>
      </div>
    </DashboardShell>
  )
}
