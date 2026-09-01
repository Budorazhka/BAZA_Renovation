import { useState } from 'react'
import { CheckCircle2, ExternalLink, XCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

// ─── Статья (markdown-lite) ───────────────────────────────────────────────────

function renderInline(text: string): React.ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/)
  return parts.map((p, i) => {
    if (p.startsWith('**') && p.endsWith('**'))
      return <strong key={i} className="font-normal text-[color:var(--gold-light)]">{p.slice(2, -2)}</strong>
    if (p.startsWith('`') && p.endsWith('`'))
      return <code key={i} className="rounded bg-[var(--hub-tile-icon-bg)] px-1 py-0.5 font-mono text-xs text-[color:var(--gold-light)]">{p.slice(1, -1)}</code>
    return p
  })
}

function TableRow({ line }: { line: string }) {
  const cells = line.split('|').filter(Boolean).map(c => c.trim())
  const isHeader = cells.every(c => /^-+$/.test(c))
  if (isHeader) return null
  return (
    <div
      className="grid gap-0 border-b border-[color:var(--hub-tile-icon-border)] last:border-0"
      style={{ gridTemplateColumns: `repeat(${cells.length}, 1fr)` }}
    >
      {cells.map((c, i) => (
        <div key={i} className="px-3 py-2 text-xs text-[color:var(--hub-body)] border-r border-[color:var(--hub-tile-icon-border)] last:border-0">{c}</div>
      ))}
    </div>
  )
}

export function ArticleViewer({ body }: { body: string }) {
  return (
    <div className="space-y-3 text-sm leading-relaxed text-[color:var(--app-text-muted)]">
      {body.split('\n').map((line, i) => {
        if (line.startsWith('## ')) return <h2 key={i} className="text-base font-normal text-[color:var(--app-text)] mt-5 mb-2">{line.slice(3)}</h2>
        if (line.startsWith('### ')) return <h3 key={i} className="text-sm font-normal text-[color:var(--gold-light)] mt-4 mb-1">{line.slice(4)}</h3>
        if (line.startsWith('- ')) return <li key={i} className="ml-4 list-disc">{renderInline(line.slice(2))}</li>
        if (line.startsWith('```')) return null
        if (/^\d+\./.test(line)) return <li key={i} className="ml-4 list-decimal">{renderInline(line.replace(/^\d+\.\s/, ''))}</li>
        if (line.startsWith('|')) return <TableRow key={i} line={line} />
        if (line.trim() === '') return <div key={i} className="h-1" />
        return <p key={i}>{renderInline(line)}</p>
      })}
    </div>
  )
}

// ─── Скрипт (диалог) ──────────────────────────────────────────────────────────

export function ScriptViewer({ lines }: { lines: Array<{ speaker: 'manager' | 'client'; text: string }> }) {
    const { t } = useI18n();
  return (
    <div className="space-y-3">
      {lines.map((line, i) => {
        const isManager = line.speaker === 'manager'
        return (
          <div key={i} className={cn('flex gap-3', isManager ? 'flex-row-reverse' : 'flex-row')}>
            <div className={cn('flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-normal', isManager ? 'bg-[rgba(126,200,227,0.2)] text-[#7ec8e3]' : 'bg-[var(--hub-tile-icon-bg)] text-[color:var(--hub-badge-soon-fg)]')}>
              {isManager ? 'М' : 'К'}
            </div>
            <div className={cn('max-w-[75%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed', isManager ? 'rounded-tr-sm bg-[rgba(126,200,227,0.15)] text-[#c8e8f5] border border-[rgba(126,200,227,0.25)]' : 'rounded-tl-sm bg-[rgba(255,255,255,0.05)] text-[color:var(--app-text-muted)] border border-[color:var(--hub-tile-icon-border)]')}>
              {line.text}
            </div>
          </div>
        )
      })}
      <div className="mt-4 flex items-center gap-4 rounded-xl border border-[color:var(--hub-tile-icon-border)] bg-[rgba(255,255,255,0.03)] px-4 py-3 text-xs text-[color:var(--hub-desc)]">
        <div className="flex items-center gap-1.5"><span className="inline-flex size-5 rounded-full bg-[rgba(126,200,227,0.2)] text-[#7ec8e3] font-normal text-[10px] items-center justify-center">{t('lms.viewers.м')}</span>{t('lms.viewers.менеджер')}</div>
        <div className="flex items-center gap-1.5"><span className="inline-flex size-5 rounded-full bg-[var(--hub-tile-icon-bg)] text-[color:var(--hub-badge-soon-fg)] font-normal text-[10px] items-center justify-center">{t('lms.viewers.к')}</span>{t('lms.viewers.клиент')}</div>
      </div>
    </div>
  )
}

// ─── Презентация (слайдер) ───────────────────────────────────────────────────

export function PresentationViewer({ slides }: { slides: Array<{ title: string; body: string }> }) {
    const { t } = useI18n();
  const [current, setCurrent] = useState(0)
  const slide = slides[current]
  const total = slides.length
  if (!slide) return null

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_280px]">
      {/* Слайд + навигация */}
      <div className="space-y-4">
        <div className="relative aspect-[16/9] min-h-[420px] rounded-2xl bg-gradient-to-br from-slate-800 to-slate-900 p-10 lg:p-14 text-white flex flex-col justify-between overflow-hidden">
          <div className="space-y-6">
            <p className="text-sm font-normal uppercase tracking-widest text-slate-400">{current + 1} / {total}</p>
            <h2 className="text-3xl lg:text-4xl font-normal leading-tight">{slide.title}</h2>
            <div className="text-base lg:text-lg text-slate-200 leading-relaxed whitespace-pre-line max-w-3xl">{slide.body}</div>
          </div>
        </div>
        <div className="flex items-center justify-between gap-3">
          <Button variant="outline" size="sm" onClick={() => setCurrent(c => c - 1)} disabled={current === 0}
            className="border-[color:var(--hub-card-border-hover)] bg-[var(--hub-action-hover)] text-[color:var(--app-text-muted)] hover:bg-[var(--nav-item-bg-active)]">{t('lms.viewers.назад')}</Button>
          <div className="flex items-center gap-1.5">
            {slides.map((_, i) => (
              <button key={i} onClick={() => setCurrent(i)}
                className={cn('rounded-full transition-all', i === current ? 'size-2.5 bg-[var(--gold-light)]' : 'size-2 bg-[var(--gold)]/25 hover:bg-[var(--gold)]/50')}
              />
            ))}
          </div>
          <Button variant="outline" size="sm" onClick={() => setCurrent(c => c + 1)} disabled={current === total - 1}
            className="border-[color:var(--hub-card-border-hover)] bg-[var(--hub-action-hover)] text-[color:var(--app-text-muted)] hover:bg-[var(--nav-item-bg-active)]">{t('lms.viewers.далее')}</Button>
        </div>
      </div>

      {/* Список слайдов — на широких экранах справа, на узких — снизу */}
      <div className="lg:sticky lg:top-4 lg:self-start">
        <p className="mb-2 text-[11px] font-normal uppercase tracking-wider text-[color:var(--hub-stat-label)]">
          {t('lms.viewers.слайды')}{total}
        </p>
        <div className="rounded-xl border border-[color:var(--hub-card-border)] divide-y divide-[color:var(--hub-card-border)] overflow-hidden max-h-[60vh] lg:max-h-[480px] overflow-y-auto">
          {slides.map((s, i) => (
            <button key={i} onClick={() => setCurrent(i)}
              className={cn('flex items-center gap-3 w-full px-4 py-2.5 text-left text-sm transition-colors hover:bg-[var(--hub-action-hover)]', i === current ? 'bg-[var(--nav-item-bg-active)] font-normal text-[color:var(--app-text)]' : 'text-[color:var(--hub-desc)]')}
            >
              <span className={cn('inline-flex size-5 shrink-0 rounded-full text-[10px] font-normal items-center justify-center', i === current ? 'bg-[var(--gold-light)] text-[#0a2619]' : 'bg-[var(--hub-tile-icon-bg)] text-[color:var(--hub-desc)]')}>{i + 1}</span>
              {s.title}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

// ─── Видео ────────────────────────────────────────────────────────────────────

/** YouTube/Vimeo: приводит обычные ссылки к embed-формату. */
export function toEmbedUrl(raw: string): string {
  if (!raw) return raw
  const yt = raw.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([\w-]+)/)
  if (yt) return `https://www.youtube.com/embed/${yt[1]}`
  const vimeo = raw.match(/vimeo\.com\/(\d+)/)
  if (vimeo) return `https://player.vimeo.com/video/${vimeo[1]}`
  return raw
}

export function VideoViewer({ url, description }: { url: string; description?: string }) {
  return (
    <div className="space-y-4">
      <div className="relative overflow-hidden rounded-xl bg-black aspect-video">
        <iframe
          src={toEmbedUrl(url)}
          title="video"
          className="absolute inset-0 w-full h-full"
          allowFullScreen
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        />
      </div>
      {description && <p className="text-sm text-[color:var(--app-text-muted)] leading-relaxed">{description}</p>}
    </div>
  )
}

// ─── PDF ──────────────────────────────────────────────────────────────────────

export function PdfViewer({ url, description }: { url: string; description?: string }) {
    const { t } = useI18n();
  return (
    <div className="space-y-4">
      <div className="overflow-hidden rounded-xl border border-[color:var(--hub-card-border)] bg-[rgba(0,0,0,0.2)]" style={{ height: 520 }}>
        <iframe src={`${url}#toolbar=1`} title="PDF" className="h-full w-full" />
      </div>
      {description && <p className="text-sm text-[color:var(--hub-body)] leading-relaxed">{description}</p>}
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-2 rounded-full border border-[color:var(--hub-card-border-hover)] bg-[var(--hub-action-hover)] px-4 py-2 text-sm text-[color:var(--app-text-muted)] hover:bg-[var(--nav-item-bg-active)] transition-colors"
      >
        <ExternalLink className="size-4" />
        {t('lms.viewers.открыть_в_новой_вкла')}</a>
    </div>
  )
}

// ─── Тест (вопросы с ответами) ────────────────────────────────────────────────

export interface QuizQuestion {
  question: string
  options: string[]
  correct: number
}

export function QuizViewer({
  questions,
  onComplete,
  passingScore,
}: {
  questions: QuizQuestion[]
  onComplete?: (passed: boolean, score: number) => void
  passingScore?: number  // %, для отображения «пройден / не пройден»
}) {
    const { t } = useI18n();
  const [answers, setAnswers] = useState<Record<number, number>>({})
  const [submitted, setSubmitted] = useState(false)
  const allAnswered = Object.keys(answers).length === questions.length
  const correctCount = submitted ? questions.filter((q, i) => answers[i] === q.correct).length : 0
  const scorePct = questions.length ? Math.round((correctCount / questions.length) * 100) : 0
  const passed = passingScore !== undefined ? scorePct >= passingScore : correctCount === questions.length

  function handleSubmit() {
    setSubmitted(true)
    onComplete?.(passingScore !== undefined ? scorePct >= passingScore : correctCount === questions.length, scorePct)
  }

  function handleReset() {
    setAnswers({})
    setSubmitted(false)
  }

  if (submitted) {
    return (
      <div className="space-y-6">
        <div className={cn(
          'rounded-2xl border p-6 text-center',
          passed
            ? 'border-[rgba(111,207,151,0.4)] bg-[rgba(111,207,151,0.08)]'
            : scorePct >= 50
              ? 'border-[rgba(244,185,106,0.4)] bg-[rgba(244,185,106,0.08)]'
              : 'border-[rgba(252,129,129,0.4)] bg-[rgba(252,129,129,0.08)]',
        )}>
          <p className="text-3xl font-normal text-[color:var(--app-text)]">{correctCount} / {questions.length}</p>
          <p className={cn('mt-1 text-sm font-medium', passed ? 'text-[#6fcf97]' : scorePct >= 50 ? 'text-[#f4b96a]' : 'text-[#fc8181]')}>
            {passingScore !== undefined
              ? passed
                ? `Тест пройден (${scorePct}%, нужно ≥ ${passingScore}%)`
                : `Не хватило баллов (${scorePct}%, нужно ≥ ${passingScore}%)`
              : passed
                ? 'Отлично! Все правильно.'
                : scorePct >= 50 ? 'Хороший результат.' : 'Повторите материал.'}
          </p>
        </div>
        <div className="space-y-4">
          {questions.map((q, qi) => {
            const isCorrect = answers[qi] === q.correct
            return (
              <div key={qi} className="rounded-xl border border-[color:var(--hub-card-border)] bg-[rgba(255,255,255,0.02)] p-4 space-y-3">
                <div className="flex items-start gap-2">
                  {isCorrect ? <CheckCircle2 className="size-5 shrink-0 text-[#6fcf97] mt-0.5" /> : <XCircle className="size-5 shrink-0 text-[#fc8181] mt-0.5" />}
                  <p className="text-sm font-medium text-[color:var(--app-text)]">{q.question}</p>
                </div>
                <div className="space-y-1.5 pl-7">
                  {q.options.map((opt, oi) => (
                    <div key={oi} className={cn(
                      'rounded-lg px-3 py-2 text-sm',
                      oi === q.correct
                        ? 'bg-[rgba(111,207,151,0.12)] text-[#6fcf97] font-medium'
                        : oi === answers[qi] && !isCorrect
                          ? 'bg-[rgba(252,129,129,0.1)] text-[#fc8181] line-through'
                          : 'text-[color:var(--workspace-text-muted)]',
                    )}>
                      {opt}
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
        <Button
          variant="outline"
          onClick={handleReset}
          className="w-full border-[color:var(--hub-card-border-hover)] bg-[var(--hub-action-hover)] text-[color:var(--app-text-muted)] hover:bg-[var(--nav-item-bg-active)]"
        >
          {t('lms.viewers.пройти_заново')}</Button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {questions.map((q, qi) => (
        <div key={qi} className="rounded-xl border border-[color:var(--hub-card-border)] bg-[rgba(255,255,255,0.02)] p-4 space-y-3">
          <p className="text-sm font-normal text-[color:var(--app-text)]">
            <span className="mr-2 inline-flex size-5 items-center justify-center rounded-full bg-[var(--nav-item-bg-active)] text-xs font-normal text-[color:var(--theme-accent-link-dim)]">{qi + 1}</span>
            {q.question}
          </p>
          <div className="space-y-2">
            {q.options.map((opt, oi) => (
              <button key={oi} onClick={() => setAnswers(prev => ({ ...prev, [qi]: oi }))}
                className={cn(
                  'w-full rounded-lg border px-4 py-2.5 text-left text-sm transition-colors',
                  answers[qi] === oi
                    ? 'border-[rgba(126,200,227,0.5)] bg-[rgba(126,200,227,0.1)] text-[#c8e8f5] font-medium'
                    : 'border-[color:var(--hub-card-border)] bg-[rgba(255,255,255,0.02)] text-[color:var(--app-text-muted)] hover:border-[color:var(--hub-card-border-hover)] hover:bg-[var(--hub-action-hover)]',
                )}
              >{opt}</button>
            ))}
          </div>
        </div>
      ))}
      <Button variant="sectionPrimary" onClick={handleSubmit} disabled={!allAnswered} className="w-full !normal-case">
        {allAnswered ? 'Проверить ответы' : `Ответьте на все вопросы (${Object.keys(answers).length}/${questions.length})`}
      </Button>
    </div>
  )
}

// ─── Универсальный рендерер контента LMSItem ─────────────────────────────────

import type { LMSItem } from '@/data/lms-mock'
import { useI18n } from "@/i18n";

export function ItemContentViewer({ item }: { item: LMSItem }) {
  const c = item.content
  if (c.type === 'article') return <ArticleViewer body={c.body} />
  if (c.type === 'video') return <VideoViewer url={c.url} description={c.description} />
  if (c.type === 'script') return <ScriptViewer lines={c.lines} />
  if (c.type === 'presentation') return <PresentationViewer slides={c.slides} />
  if (c.type === 'pdf') return <PdfViewer url={c.url} description={c.description} />
  if (c.type === 'quiz') return <QuizViewer questions={c.questions} />
  return null
}
