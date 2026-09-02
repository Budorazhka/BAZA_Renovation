import type { LMSCourse } from '@/data/lms-mock'
import { lmsApi } from '@/services/lmsApi'
import type { LMSProgressEntry, LMSProgressMap } from '@/services/lmsApi'

const STORAGE_KEY = 'lms-progress-v1'

export type ProgressEntry = LMSProgressEntry
type ProgressMap = LMSProgressMap

// ─── localStorage: мгновенный кэш и офлайн-фолбэк ──────────────────────────────

function readMap(): ProgressMap {
  if (typeof window === 'undefined') return {}
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    return typeof parsed === 'object' && parsed ? parsed : {}
  } catch {
    return {}
  }
}

function writeMap(map: ProgressMap) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(map))
  } catch {
    /* quota / disabled storage — игнорируем */
  }
  emit()
}

// ─── Подписка: компоненты перерисовываются при любом изменении прогресса ────────

let version = 0
const listeners = new Set<() => void>()

function emit() {
  version++
  for (const l of listeners) l()
}

/** Текущая «версия» прогресса — растёт при каждом изменении (для деп useMemo). */
export function getProgressVersion(): number {
  return version
}

/** Подписаться на изменения прогресса. Возвращает функцию отписки. */
export function subscribeProgress(fn: () => void): () => void {
  listeners.add(fn)
  return () => { listeners.delete(fn) }
}

// ─── Синхронизация с сервером ──────────────────────────────────────────────────
// null — ещё не знаем, есть ли бэкенд; true/false — после первого ответа.
let serverAvailable: boolean | null = null
let hydrated = false
let hydrating: Promise<void> | null = null

/** Фоновая отправка прогресса по курсу на сервер (fire-and-forget). */
function pushCourse(courseId: string, entry: ProgressEntry) {
  if (serverAvailable === false) return
  lmsApi
    .putProgress(courseId, entry)
    .then(() => { serverAvailable = true })
    .catch(() => { serverAvailable = false })
}

/**
 * Подтягивает прогресс пользователя с сервера и сливает в localStorage
 * (серверные записи перекрывают локальные, локальные-only сохраняются).
 * Выполняется один раз за сессию; если бэкенда нет — тихо остаёмся на localStorage.
 */
export function hydrateProgressFromServer(): Promise<void> {
  if (hydrated) return Promise.resolve()
  if (hydrating) return hydrating
  hydrating = lmsApi
    .getProgress()
    .then((serverMap) => {
      serverAvailable = true
      hydrated = true
      const merged: ProgressMap = { ...readMap(), ...(serverMap ?? {}) }
      writeMap(merged)
    })
    .catch(() => {
      // Бэкенд прогресса ещё недоступен — остаёмся на localStorage.
      serverAvailable = false
    })
    .finally(() => { hydrating = null })
  return hydrating
}

// ─── Публичный API (синхронный, как раньше) ────────────────────────────────────

export function getCourseProgress(courseId: string): ProgressEntry {
  const map = readMap()
  return map[courseId] ?? { completedItems: [] }
}

export function setItemCompleted(courseId: string, itemId: string, done: boolean) {
  const map = readMap()
  const cur = map[courseId] ?? { completedItems: [] }
  const set = new Set(cur.completedItems)
  if (done) set.add(itemId)
  else set.delete(itemId)
  const entry: ProgressEntry = { ...cur, completedItems: Array.from(set) }
  map[courseId] = entry
  writeMap(map)
  pushCourse(courseId, entry)
}

export function setFinalQuizResult(courseId: string, passed: boolean, scorePct: number) {
  const map = readMap()
  const cur = map[courseId] ?? { completedItems: [] }
  const entry: ProgressEntry = { ...cur, finalQuizPassed: passed, finalQuizScore: scorePct }
  map[courseId] = entry
  writeMap(map)
  pushCourse(courseId, entry)
}

export function resetCourseProgress(courseId: string) {
  const map = readMap()
  delete map[courseId]
  writeMap(map)
  if (serverAvailable !== false) {
    lmsApi.deleteProgress(courseId)
      .then(() => { serverAvailable = true })
      .catch(() => { serverAvailable = false })
  }
}

/** Процент завершения курса: материалы взвешены поровну, финальный тест — как отдельный «урок». */
export function getCourseProgressPct(course: LMSCourse, progress?: ProgressEntry): number {
  const p = progress ?? getCourseProgress(course.id)
  const totalUnits = course.itemIds.length + (course.finalQuiz ? 1 : 0)
  if (!totalUnits) return 0
  const valid = new Set(course.itemIds)
  const doneItems = p.completedItems.filter(id => valid.has(id)).length
  const doneQuiz = course.finalQuiz && p.finalQuizPassed ? 1 : 0
  return Math.round(((doneItems + doneQuiz) / totalUnits) * 100)
}
