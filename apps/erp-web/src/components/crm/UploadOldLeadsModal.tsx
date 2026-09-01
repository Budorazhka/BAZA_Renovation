import { useEffect, useRef, useState, type DragEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { AlertCircle, AlertTriangle, CheckCircle2, FileSpreadsheet, Upload, X } from 'lucide-react'
import {
  developmentApi,
  type OldLeadsExcelUploadResult,
} from '@/services/developmentApi'
import { useI18n } from '@/i18n'

const PRIMARY = 'var(--gold)'
const DIALOG_BG = 'var(--rail-bg)'

function apiErrorMessage(err: unknown, fallback: string): string {
  const axiosMsg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message
  if (typeof axiosMsg === 'string' && axiosMsg.trim()) return axiosMsg.trim()
  if (err instanceof Error && err.message.trim()) return err.message.trim()
  return fallback
}

type Props = {
  open: boolean
  onClose: () => void
  onImported: () => void
}

export function UploadOldLeadsModal({ open, onClose, onImported }: Props) {
  const { t } = useI18n()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)
  const [file, setFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<OldLeadsExcelUploadResult | null>(null)

  useEffect(() => {
    if (!open) return
    setDragging(false)
    setFile(null)
    setUploading(false)
    setError(null)
    setResult(null)
  }, [open])

  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !uploading) onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose, uploading])

  if (!open || typeof document === 'undefined') return null

  function pickFile(next: File | null | undefined) {
    if (!next) return
    const lower = next.name.toLowerCase()
    if (!lower.endsWith('.xlsx') && !lower.endsWith('.xls')) {
      setError(t('oldLeads.upload.invalidFile'))
      setFile(null)
      setResult(null)
      return
    }
    setFile(next)
    setError(null)
    setResult(null)
  }

  function handleDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault()
    setDragging(false)
    pickFile(e.dataTransfer.files?.[0])
  }

  async function handleUpload() {
    if (!file || uploading) return
    setUploading(true)
    setError(null)
    setResult(null)
    try {
      const resp = await developmentApi.uploadOldLeadsExcel(file)
      if (!resp.success || !resp.data) {
        throw new Error(resp.message || t('oldLeads.upload.failed'))
      }
      setResult(resp.data)
      if ((resp.data.totalCreated ?? 0) > 0) onImported()
    } catch (err) {
      setError(apiErrorMessage(err, t('oldLeads.upload.failed')))
    } finally {
      setUploading(false)
    }
  }

  const errors = result?.errors ?? []
  const warnings = result?.warnings ?? []

  const modal = (
    <>
      <div
        role="presentation"
        aria-hidden
        style={{ position: 'fixed', inset: 0, zIndex: 10100, background: 'rgba(0,0,0,0.55)' }}
        onClick={() => {
          if (!uploading) onClose()
        }}
      />
      <div
        role="dialog"
        aria-modal
        aria-labelledby="upload-old-leads-title"
        style={{
          position: 'fixed',
          zIndex: 10101,
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          width: 'min(560px, calc(100vw - 28px))',
          maxHeight: 'min(90vh, 780px)',
          overflowY: 'auto',
          padding: 22,
          background: DIALOG_BG,
          border: `2px solid ${PRIMARY}`,
          borderRadius: 14,
          boxShadow: '0 24px 64px rgba(0,0,0,0.9), inset 0 1px 0 rgba(255,255,255,0.05)',
          boxSizing: 'border-box',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            gap: 12,
            marginBottom: 8,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <FileSpreadsheet size={18} color={PRIMARY} />
            <h2
              id="upload-old-leads-title"
              style={{ margin: 0, fontSize: 18, fontWeight: 400, color: '#fff', lineHeight: 1.25 }}
            >
              {t('oldLeads.upload.title')}
            </h2>
          </div>
          <button
            type="button"
            aria-label={t('oldLeads.upload.close')}
            disabled={uploading}
            onClick={onClose}
            style={{
              flexShrink: 0,
              width: 36,
              height: 36,
              borderRadius: 10,
              border: '1px solid rgba(255,255,255,0.12)',
              background: 'rgba(0,0,0,0.35)',
              color: 'rgba(220,230,224,0.85)',
              cursor: uploading ? 'default' : 'pointer',
              opacity: uploading ? 0.5 : 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <X size={20} />
          </button>
        </div>
        <p style={{ margin: '0 0 18px', fontSize: 13, color: 'rgba(194, 200, 196, 0.72)', lineHeight: 1.45 }}>
          {t('oldLeads.upload.hint')}
        </p>

        <div
          onDragOver={(e) => {
            e.preventDefault()
            setDragging(true)
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 10,
            padding: '28px 16px',
            borderRadius: 12,
            border: `2px dashed ${dragging ? PRIMARY : 'rgba(255,255,255,0.16)'}`,
            background: dragging
              ? 'color-mix(in srgb, var(--gold) 10%, transparent)'
              : 'rgba(0,0,0,0.28)',
            marginBottom: 16,
          }}
        >
          <Upload size={22} color="rgba(220,230,224,0.55)" />
          <div style={{ fontSize: 13, color: file ? '#e8f2ec' : 'rgba(194,200,196,0.7)', textAlign: 'center' }}>
            {file ? file.name : t('oldLeads.upload.dropHere')}
          </div>
          <button
            type="button"
            disabled={uploading}
            onClick={() => fileInputRef.current?.click()}
            style={{
              height: 36,
              padding: '0 14px',
              borderRadius: 10,
              border: '1px solid rgba(255,255,255,0.15)',
              background: 'rgba(0,0,0,0.35)',
              color: 'rgba(220,230,224,0.9)',
              fontSize: 13,
              cursor: uploading ? 'default' : 'pointer',
              fontFamily: 'inherit',
            }}
          >
            {t('oldLeads.upload.chooseFile')}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls"
            className="hidden"
            onChange={(e) => {
              pickFile(e.target.files?.[0])
              e.target.value = ''
            }}
          />
        </div>

        {error && (
          <p style={{ margin: '0 0 14px', fontSize: 13, color: '#fb923c', lineHeight: 1.4 }}>{error}</p>
        )}

        {result && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 16 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
              <SummaryChip
                tone="neutral"
                label={t('oldLeads.upload.totalRows')}
                value={result.totalRows ?? 0}
              />
              <SummaryChip
                tone="ok"
                label={t('oldLeads.upload.created')}
                value={result.totalCreated}
                icon={<CheckCircle2 size={14} />}
              />
              <SummaryChip
                tone="warn"
                label={t('oldLeads.upload.skipped')}
                value={result.totalSkipped ?? 0}
                icon={<AlertTriangle size={14} />}
              />
            </div>

            {errors.length > 0 && (
              <IssueList
                title={t('oldLeads.upload.errors')}
                tone="error"
                items={errors}
                rowLabel={t('oldLeads.upload.row')}
              />
            )}
            {warnings.length > 0 && (
              <IssueList
                title={t('oldLeads.upload.warnings')}
                tone="warn"
                items={warnings}
                rowLabel={t('oldLeads.upload.row')}
              />
            )}
          </div>
        )}

        <div style={{ display: 'flex', gap: 10 }}>
          <button
            type="button"
            onClick={onClose}
            disabled={uploading}
            style={{
              flex: 1,
              height: 48,
              borderRadius: 10,
              border: '1px solid rgba(255,255,255,0.15)',
              background: 'transparent',
              color: 'rgba(220,230,224,0.9)',
              fontSize: 14,
              fontWeight: 400,
              cursor: uploading ? 'default' : 'pointer',
              opacity: uploading ? 0.6 : 1,
              fontFamily: 'inherit',
            }}
          >
            {result ? t('oldLeads.upload.close') : t('oldLeads.upload.cancel')}
          </button>
          {!result && (
            <button
              type="button"
              disabled={!file || uploading}
              onClick={() => void handleUpload()}
              style={{
                flex: 1,
                height: 48,
                borderRadius: 10,
                border: 'none',
                background: '#a07828',
                color: '#fff',
                fontSize: 14,
                fontWeight: 400,
                cursor: !file || uploading ? 'default' : 'pointer',
                opacity: !file || uploading ? 0.6 : 1,
                fontFamily: 'inherit',
                letterSpacing: '0.04em',
              }}
            >
              {uploading ? t('oldLeads.upload.uploading') : t('oldLeads.upload.submit')}
            </button>
          )}
        </div>
      </div>
    </>
  )

  return createPortal(modal, document.body)
}

function SummaryChip({
  label,
  value,
  tone,
  icon,
}: {
  label: string
  value: number
  tone: 'ok' | 'warn' | 'neutral'
  icon?: ReactNode
}) {
  const styles =
    tone === 'ok'
      ? { border: 'rgba(52,211,153,0.35)', bg: 'rgba(16,185,129,0.12)', color: '#a7f3d0' }
      : tone === 'warn'
        ? { border: 'rgba(251,191,36,0.35)', bg: 'rgba(245,158,11,0.12)', color: '#fde68a' }
        : { border: 'rgba(255,255,255,0.12)', bg: 'rgba(0,0,0,0.28)', color: 'rgba(220,230,224,0.85)' }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
        padding: '10px 12px',
        borderRadius: 10,
        border: `1px solid ${styles.border}`,
        background: styles.bg,
        color: styles.color,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, opacity: 0.85 }}>
        {icon}
        {label}
      </div>
      <div style={{ fontSize: 18, fontWeight: 400 }}>{value}</div>
    </div>
  )
}

function IssueList({
  title,
  tone,
  items,
  rowLabel,
}: {
  title: string
  tone: 'error' | 'warn'
  items: { row: number; field?: string; message: string }[]
  rowLabel: string
}) {
  const styles =
    tone === 'error'
      ? { border: 'rgba(251,113,133,0.4)', bg: 'rgba(244,63,94,0.12)', color: '#fecdd3', icon: <AlertCircle size={14} /> }
      : { border: 'rgba(251,191,36,0.4)', bg: 'rgba(245,158,11,0.12)', color: '#fde68a', icon: <AlertTriangle size={14} /> }

  return (
    <div
      style={{
        borderRadius: 10,
        border: `1px solid ${styles.border}`,
        background: styles.bg,
        color: styles.color,
        padding: 10,
        maxHeight: 160,
        overflowY: 'auto',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, marginBottom: 6 }}>
        {styles.icon}
        {title} ({items.length})
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12 }}>
        {items.slice(0, 40).map((item, idx) => (
          <div key={`${item.row}-${item.field ?? ''}-${idx}`} style={{ display: 'flex', gap: 8 }}>
            <span style={{ opacity: 0.65, flexShrink: 0 }}>
              {rowLabel} {item.row}
              {item.field ? ` · ${item.field}` : ''}:
            </span>
            <span>{item.message}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
