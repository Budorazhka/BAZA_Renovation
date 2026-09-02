// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import { applyRuntimeTranslations } from '@/i18n/runtimeTranslations'

function flushObserver() {
  return new Promise<void>((resolve) => setTimeout(resolve, 0))
}

describe('applyRuntimeTranslations', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
    applyRuntimeTranslations('ru')
  })

  it('translates text present at the moment of the call', () => {
    const span = document.createElement('span')
    span.textContent = 'ИИ Отключен'
    document.body.appendChild(span)

    applyRuntimeTranslations('en')

    expect(span.textContent).toBe('AI off')
  })

  // React обновляет подпись через nodeValue существующего текстового узла,
  // поэтому мутируем именно его, а не textContent (тот создаёт новый узел).
  it('re-translates a node when its text changes afterwards', async () => {
    const span = document.createElement('span')
    const text = document.createTextNode('ИИ Отключен')
    span.appendChild(text)
    document.body.appendChild(span)
    applyRuntimeTranslations('en')

    text.nodeValue = 'ИИ Включен'
    await flushObserver()

    expect(span.textContent).toBe('AI on')
  })

  it('restores the latest original text when switching back to ru', async () => {
    const span = document.createElement('span')
    const text = document.createTextNode('ИИ Отключен')
    span.appendChild(text)
    document.body.appendChild(span)
    applyRuntimeTranslations('en')

    text.nodeValue = 'ИИ Включен'
    await flushObserver()
    applyRuntimeTranslations('ru')

    expect(span.textContent).toBe('ИИ Включен')
  })

  it('re-translates attributes when they change afterwards', async () => {
    const button = document.createElement('button')
    button.setAttribute('title', 'Обычная отправка · автоответ ИИ выключен')
    document.body.appendChild(button)
    applyRuntimeTranslations('en')
    expect(button.getAttribute('title')).toBe('Regular send · AI auto-reply is off')

    button.setAttribute('title', 'ИИ ответит и включит автоответ на входящие')
    await flushObserver()

    expect(button.getAttribute('title')).toBe(
      'AI will reply and enable auto-replies for incoming messages'
    )
  })
})
