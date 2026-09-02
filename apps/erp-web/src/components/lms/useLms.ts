import { useCallback, useEffect, useRef, useState } from 'react'
import { lmsApi } from '@/services/lmsApi'
import { LMS_ITEMS, LMS_COURSES } from '@/data/lms-mock'
import type { LMSItem, LMSCourse } from '@/data/lms-mock'

/** Копия объекта без серверного id — для create-запросов. */
function withoutId<T extends { id: string }>(o: T): Omit<T, 'id'> {
  const rest = { ...o }
  delete (rest as { id?: string }).id
  return rest
}

/**
 * Библиотека «Обучение» с persistence через lmsApi.
 *
 * Пока LMS-эндпоинты на сервере не подняты, первый GET падает — тогда хук
 * остаётся на сид-данных из моков и работает локально (как до интеграции),
 * чтобы вкладка не ломалась. Как только бэкенд ответит на /api/lms/items,
 * тот же код начнёт читать и писать на сервер без изменений в компонентах.
 */
export function useLmsLibrary() {
  const [items, setItems] = useState<LMSItem[]>(LMS_ITEMS)
  const [courses, setCourses] = useState<LMSCourse[]>(LMS_COURSES)
  const [loading, setLoading] = useState(true)

  // true — сервер ответил хотя бы раз; пишем на бэк. false — работаем локально.
  const backendUp = useRef(false)

  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const [serverItems, serverCourses] = await Promise.all([
          lmsApi.getItems(),
          lmsApi.getCourses(),
        ])
        if (!alive) return
        backendUp.current = true
        setItems(serverItems)
        setCourses(serverCourses)
      } catch {
        // Бэкенд LMS ещё недоступен — остаёмся на моках, операции идут локально.
        backendUp.current = false
      } finally {
        if (alive) setLoading(false)
      }
    })()
    return () => { alive = false }
  }, [])

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
    createItem,
    updateItem,
    deleteItem,
    createCourse,
    updateCourse,
    deleteCourse,
  }
}
