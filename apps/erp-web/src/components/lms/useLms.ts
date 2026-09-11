import { useCallback, useEffect, useRef, useState } from 'react'
import { lmsApi } from '@/services/lmsApi'
import type { LMSItem, LMSCourse } from '@/data/lms-mock'

/** Копия объекта без серверного id — для create-запросов. */
function withoutId<T extends { id: string }>(o: T): Omit<T, 'id'> {
  const rest = { ...o }
  delete (rest as { id?: string }).id
  return rest
}

function describeLoadError(error: unknown): string {
  const status = (error as { response?: { status?: number } })?.response?.status
  if (status === 401) return 'Сессия истекла. Войдите заново, чтобы увидеть базу знаний.'
  if (status === 403) return 'Нет прав на просмотр базы знаний.'
  if (status) return `Сервер ответил ошибкой ${status}. Материалы не загружены.`
  return 'Не удалось связаться с сервером. Материалы не загружены.'
}

/**
 * Библиотека «Обучение» с persistence через lmsApi.
 *
 * ИСПРАВЛЕНО 11.09.2026: `LmsModule` на сервере зарегистрирован и отвечает
 * на `/api/lms/items`/`/api/lms/courses` — предпосылка старого комментария
 * («пока эндпоинты не подняты») больше не выполняется. Раньше ЛЮБАЯ ошибка
 * GET (истёкшая сессия, нет прав, 500, обрыв сети — не только «эндпоинта
 * нет») тихо подменяла реальную библиотеку фиктивными `LMS_ITEMS`/
 * `LMS_COURSES` без какого-либо признака подмены — тот же класс бага, что
 * уже закрывался для карточки объекта и реестра задач (см.
 * roadmap-snapshot-2026-09-05.md §1.1, tasksPageNoSilentMock.test.ts).
 * Теперь при отказе список остаётся пустым, а `loadError` — человеко-
 * читаемым описанием причины; `reload()` позволяет повторить попытку.
 *
 * Запись (create/update/delete) на локальный фолбэк при отказе GET
 * по-прежнему переключается через `backendUp` — этот класс проблемы здесь
 * не тронут, отдельный вопрос (см. docs/operations/lms-knowledge-base.md).
 */
export function useLmsLibrary() {
  const [items, setItems] = useState<LMSItem[]>([])
  const [courses, setCourses] = useState<LMSCourse[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  // true — сервер ответил хотя бы раз; пишем на бэк. false — работаем локально.
  const backendUp = useRef(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [serverItems, serverCourses] = await Promise.all([
        lmsApi.getItems(),
        lmsApi.getCourses(),
      ])
      backendUp.current = true
      setItems(serverItems)
      setCourses(serverCourses)
      setLoadError(null)
    } catch (error) {
      backendUp.current = false
      setItems([])
      setCourses([])
      setLoadError(describeLoadError(error))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  // ─── Материалы ───────────────────────────────────────────────────────────────
  const createItem = useCallback(async (item: LMSItem) => {
    if (backendUp.current) {
      const created = await lmsApi.createItem(withoutId(item))
      setItems(prev => [...prev, created])
    } else {
      setItems(prev => [...prev, item])
    }
  }, [])

  const updateItem = useCallback(async (item: LMSItem) => {
    if (backendUp.current) {
      const { id, ...input } = item
      const saved = await lmsApi.updateItem(id, input)
      setItems(prev => prev.map(i => (i.id === saved.id ? saved : i)))
    } else {
      setItems(prev => prev.map(i => (i.id === item.id ? item : i)))
    }
  }, [])

  const deleteItem = useCallback(async (id: string) => {
    if (backendUp.current) await lmsApi.deleteItem(id)
    setItems(prev => prev.filter(i => i.id !== id))
  }, [])

  // ─── Курсы ───────────────────────────────────────────────────────────────────
  const createCourse = useCallback(async (course: LMSCourse) => {
    if (backendUp.current) {
      const created = await lmsApi.createCourse(withoutId(course))
      setCourses(prev => [...prev, created])
    } else {
      setCourses(prev => [...prev, course])
    }
  }, [])

  const updateCourse = useCallback(async (course: LMSCourse) => {
    if (backendUp.current) {
      const { id, ...input } = course
      const saved = await lmsApi.updateCourse(id, input)
      setCourses(prev => prev.map(c => (c.id === saved.id ? saved : c)))
    } else {
      setCourses(prev => prev.map(c => (c.id === course.id ? course : c)))
    }
  }, [])

  const deleteCourse = useCallback(async (id: string) => {
    if (backendUp.current) await lmsApi.deleteCourse(id)
    setCourses(prev => prev.filter(c => c.id !== id))
  }, [])

  return {
    items,
    courses,
    loading,
    loadError,
    reload: load,
    createItem,
    updateItem,
    deleteItem,
    createCourse,
    updateCourse,
    deleteCourse,
  }
}
