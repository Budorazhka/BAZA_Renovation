/** @vitest-environment jsdom */

/**
 * Форма создания задачи раньше брала у файлов только имена и выбрасывала
 * тела — «демо, без загрузки», как честно называл это легаси-тип. Теперь файлы
 * уходят в хранилище до создания задачи, и задача ссылается на подтверждённые
 * asset'ы. Два свойства закреплены: без загрузки задача не создаётся, а сбой
 * загрузки — отказ формы, а не задача «с вложением», которого нет.
 */

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { createElement } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const uploadFileMock = vi.fn()

vi.mock('@/i18n', () => ({
  useI18n: () => ({ t: (key: string, fallback?: string) => fallback ?? key }),
}))

vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ currentUser: { id: 'u1', name: 'Анна', positionId: 'pos-1' } }),
}))

vi.mock('@/context/LeadsContext', () => ({
  useLeads: () => ({ state: { leadPool: [], leadManagers: [] } }),
}))

vi.mock('@/services/mediaApiV2', async () => {
  class MediaUploadError extends Error {
    constructor(
      message: string,
      readonly fileName: string,
    ) {
      super(message)
      this.name = 'MediaUploadError'
    }
  }
  return { mediaApiV2: { uploadFile: uploadFileMock }, MediaUploadError }
})

async function renderModal(onCreate: (task: unknown) => Promise<void> | void) {
  const { CreateTaskModal } = await import('@/components/tasks/CreateTaskModal')
  render(
    createElement(CreateTaskModal, {
      open: true,
      onOpenChange: vi.fn(),
      onCreate,
      assignees: [{ id: 'pos-1', name: 'Анна Первичкина' }],
    } as never),
  )
  // Заголовок — единственное обязательное поле без значения по умолчанию.
  // По placeholder: текст label дополнен звёздочкой обязательности.
  fireEvent.change(screen.getByPlaceholderText('tasks.createTaskModal.заголовок'), {
    target: { value: 'Собрать документы' },
  })
}

function pickFile(name: string) {
  const input = document.querySelector('input[type="file"]') as HTMLInputElement
  const file = new File(['%PDF-1.4'], name, { type: 'application/pdf' })
  fireEvent.change(input, { target: { files: [file] } })
}

function submit() {
  fireEvent.submit(document.querySelector('form') as HTMLFormElement)
}

describe('CreateTaskModal — вложения', () => {
  beforeEach(() => {
    uploadFileMock.mockReset()
    vi.resetModules()
  })

  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  it('файл загружается в хранилище, и задача получает ссылку на asset, а не имя', async () => {
    uploadFileMock.mockResolvedValue({ assetId: 'asset-1' })
    const onCreate = vi.fn().mockResolvedValue(undefined)

    await renderModal(onCreate)
    pickFile('договор.pdf')
    submit()

    await waitFor(() => expect(onCreate).toHaveBeenCalledTimes(1))
    expect(uploadFileMock).toHaveBeenCalledWith(expect.any(File), 'task_attachment')
    const created = onCreate.mock.calls[0][0] as { attachments?: unknown; attachmentFileNames?: unknown }
    expect(created.attachments).toEqual([{ assetId: 'asset-1', fileName: 'договор.pdf' }])
  })

  it('сбой загрузки — отказ формы с именем файла, задача не создаётся', async () => {
    const { MediaUploadError } = await import('@/services/mediaApiV2')
    uploadFileMock.mockRejectedValue(new MediaUploadError('Файл не прошёл проверку', 'скан.pdf'))
    const onCreate = vi.fn()

    await renderModal(onCreate)
    pickFile('скан.pdf')
    submit()

    expect(await screen.findByText(/скан\.pdf.*не загружен/)).toBeTruthy()
    expect(onCreate).not.toHaveBeenCalled()
  })

  it('без файлов загрузка не вызывается, задача уходит с пустым списком вложений', async () => {
    const onCreate = vi.fn().mockResolvedValue(undefined)

    await renderModal(onCreate)
    submit()

    await waitFor(() => expect(onCreate).toHaveBeenCalledTimes(1))
    expect(uploadFileMock).not.toHaveBeenCalled()
    const created = onCreate.mock.calls[0][0] as { attachments?: unknown }
    expect(created.attachments).toEqual([])
  })
})
