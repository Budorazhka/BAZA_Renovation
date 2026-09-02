/**
 * D-02 COMPLETE: расширяет паттерн extractErrorMessage из ProjectWizardV2Page.tsx
 * (403 forbidden), добавляя различение 404 not-found и version-conflict
 * (409+code) — оба нужны для полноценного управления иерархией Building→
 * Section→Floor→Unit, которых у wizard'а нет.
 *
 * Ключевое: status===409 сам по себе НЕ означает version conflict —
 * UNIT_INVALID_STATUS_TRANSITION тоже 409, но это другая проблема
 * ("обновите данные" не решает запрещённый переход статуса). Различаем по
 * error.code, не только по HTTP-статусу.
 */

export interface ExtractedError {
  message: string
  isForbidden: boolean
  isNotFound: boolean
  isVersionConflict: boolean
}

export function extractErrorMessage(
  err: unknown,
  fallback = 'Не удалось выполнить операцию. Попробуйте ещё раз',
): ExtractedError {
  const anyErr = err as {
    response?: { status?: number; data?: { error?: { code?: string; message?: string }; message?: string } }
    message?: string
  }
  const status = anyErr?.response?.status
  const code = anyErr?.response?.data?.error?.code
  const backendMessage = anyErr?.response?.data?.error?.message ?? anyErr?.response?.data?.message

  if (status === 403) {
    return { message: backendMessage || 'Недостаточно прав для этого действия', isForbidden: true, isNotFound: false, isVersionConflict: false }
  }
  if (status === 404) {
    return { message: backendMessage || 'Запись не найдена', isForbidden: false, isNotFound: true, isVersionConflict: false }
  }
  if (status === 409 && code === 'VERSION_CONFLICT') {
    return {
      message: backendMessage || 'Данные были изменены другим пользователем — обновите и попробуйте снова',
      isForbidden: false,
      isNotFound: false,
      isVersionConflict: true,
    }
  }
  if (backendMessage) {
    return { message: backendMessage, isForbidden: false, isNotFound: false, isVersionConflict: false }
  }
  if (anyErr?.message) {
    return { message: anyErr.message, isForbidden: false, isNotFound: false, isVersionConflict: false }
  }
  return { message: fallback, isForbidden: false, isNotFound: false, isVersionConflict: false }
}
