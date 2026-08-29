/** @vitest-environment jsdom */

import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { useConfirmReasonAction } from '../src/hooks/useConfirmReasonAction'
import { AdminApiError } from '../src/api/admin-api'

/**
 * Общий hook для deactivate/reactivate/revoke confirm-диалогов
 * (AccountsPage). Тот же контракт, что useUnpublishAction, покрытый
 * no-mock-data.test.tsx для публикаций — здесь то же самое для
 * параметризованного варианта: reason-гейт, loading/error state,
 * отсутствие вызова submitAction при недостаточной причине.
 */
describe('useConfirmReasonAction', () => {
  it('submit без открытого диалога — no-op, не вызывает submitAction', async () => {
    const submitAction = vi.fn()
    const { result } = renderHook(() => useConfirmReasonAction(submitAction, vi.fn()))

    await act(async () => {
      await result.current.submit()
    })

    expect(submitAction).not.toHaveBeenCalled()
  })

  it('canSubmit остаётся false, пока reason короче порога — submit не вызывает submitAction', async () => {
    const submitAction = vi.fn()
    const { result } = renderHook(() => useConfirmReasonAction(submitAction, vi.fn()))

    act(() => {
      result.current.open({ id: 'acc1' })
    })
    act(() => {
      result.current.setReason('коротко')
    })

    expect(result.current.canSubmit).toBe(false)

    await act(async () => {
      await result.current.submit()
    })

    expect(submitAction).not.toHaveBeenCalled()
  })

  it('успешный submit вызывает submitAction(target, reason), закрывает диалог, вызывает onSuccess', async () => {
    const submitAction = vi.fn().mockResolvedValue({ status: 'deactivated' })
    const onSuccess = vi.fn()
    const { result } = renderHook(() => useConfirmReasonAction(submitAction, onSuccess))
    const target = { id: 'acc1' }

    act(() => {
      result.current.open(target)
    })
    act(() => {
      result.current.setReason('причина деактивации не менее 10 символов')
    })

    expect(result.current.canSubmit).toBe(true)

    await act(async () => {
      await result.current.submit()
    })

    expect(submitAction).toHaveBeenCalledWith(target, 'причина деактивации не менее 10 символов')
    expect(onSuccess).toHaveBeenCalledWith({ status: 'deactivated' }, target)
    expect(result.current.dialog.status).toBe('closed')
  })

  it('ошибка сервера (AdminApiError) держит диалог открытым и показывает message, не закрывает его', async () => {
    const submitAction = vi.fn().mockRejectedValue(new AdminApiError('Grant изменён другим запросом', 409, 'VERSION_CONFLICT'))
    const { result } = renderHook(() => useConfirmReasonAction(submitAction, vi.fn()))

    act(() => {
      result.current.open({ id: 'grant1' })
    })
    act(() => {
      result.current.setReason('причина отзыва этого granta')
    })

    await act(async () => {
      await result.current.submit()
    })

    expect(result.current.dialog.status).toBe('open')
    if (result.current.dialog.status === 'open') {
      expect(result.current.dialog.error).toBe('Grant изменён другим запросом')
      expect(result.current.dialog.submitting).toBe(false)
    }
  })

  it('close() сбрасывает диалог в closed', () => {
    const { result } = renderHook(() => useConfirmReasonAction(vi.fn(), vi.fn()))

    act(() => {
      result.current.open({ id: 'acc1' })
    })
    expect(result.current.dialog.status).toBe('open')

    act(() => {
      result.current.close()
    })
    expect(result.current.dialog.status).toBe('closed')
  })
})
