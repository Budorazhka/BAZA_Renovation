import { useCallback, useEffect, useState, type DragEvent } from 'react'
import { AlertCircle, AlertTriangle, CheckCircle2, Download, FileSpreadsheet, Upload, X } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  downloadTemplate,
  createServerImportFile,
  parseImportFile,
  type ImportResult,
} from '@/lib/chessboard-xlsx'
import { useCoreStore } from '@/store/useCoreStore'
import type { UnitsExcelUploadResult } from '@/services/developmentApi'
import { useI18n } from "@/i18n";

interface Props {
  onClose: () => void
}

export function ChessboardImportDialog({ onClose }: Props) {
    const { t } = useI18n();
  const activeProjectId = useCoreStore((s) => s.activeProjectId)
  const activeBuildingId = useCoreStore((s) => s.activeBuildingId)
  const buildings = useCoreStore((s) => s.buildings)
  const projects = useCoreStore((s) => s.projects)
  const uploadUnitsExcel = useCoreStore((s) => s.uploadUnitsExcel)
  const fetchBuildings = useCoreStore((s) => s.fetchBuildings)
  const applyImportedFinishPrices = useCoreStore((s) => s.applyImportedFinishPrices)
  const activeProject = projects.find((project) => project._id === activeProjectId)

  const [isDragging, setIsDragging] = useState(false)
  const [file, setFile] = useState<File | null>(null)
  const [fileName, setFileName] = useState<string | null>(null)
  const [result, setResult] = useState<ImportResult | null>(null)
  const [isParsing, setIsParsing] = useState(false)
  const [targetBuildingId, setTargetBuildingId] = useState<string>(activeBuildingId ?? '')
  const [isUploading, setIsUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [serverResult, setServerResult] = useState<UnitsExcelUploadResult | null>(null)
  const [expanded, setExpanded] = useState(false)
  const [isLoadingBuildings, setIsLoadingBuildings] = useState(false)

  // Корпуса могут быть ещё не загружены в стор к моменту открытия диалога
  // (например, переход по прямой ссылке на шахматку). Подгружаем их для
  // активного проекта, чтобы не показывать ложное «нет корпусов».
  useEffect(() => {
    if (!activeProjectId || buildings.length > 0) return
    let cancelled = false
    setIsLoadingBuildings(true)
    void (async () => {
      try {
        await fetchBuildings(activeProjectId)
      } finally {
        if (!cancelled) setIsLoadingBuildings(false)
      }
    })()
    return () => { cancelled = true }
  }, [activeProjectId, buildings.length, fetchBuildings])

  // Как только корпуса появились — выбираем активный/первый, если ещё не выбран.
  useEffect(() => {
    if (buildings.length === 0) return
    setTargetBuildingId((prev) => {
      if (prev && buildings.some((b) => b._id === prev)) return prev
      return activeBuildingId && buildings.some((b) => b._id === activeBuildingId)
        ? activeBuildingId
        : buildings[0]._id
    })
  }, [buildings, activeBuildingId])

  const handleFile = useCallback(async (selected: File) => {
    setFile(selected)
    setFileName(selected.name)
    setIsParsing(true)
    setUploadError(null)
    setServerResult(null)
    try {
      const parsed = await parseImportFile(selected)
      setResult(parsed)
    } catch (err) {
      setResult({
        rows: [],
        errors: [{ row: 0, message: err instanceof Error ? err.message : t('inventory.chessboardImportDialog.не_удалось_прочесть_файл') }],
      })
    } finally {
      setIsParsing(false)
    }
  }, [])

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    setIsDragging(false)
    const file = event.dataTransfer.files?.[0]
    if (file) void handleFile(file)
  }

  const handleFileInput = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (file) void handleFile(file)
  }

  const handleUpload = async () => {
    if (!file || !result || result.rows.length === 0 || !targetBuildingId || !activeProjectId) return
    setIsUploading(true)
    setUploadError(null)
    setServerResult(null)
    try {
      const normalizedFile = createServerImportFile(result.rows, file.name)
      const data = await uploadUnitsExcel(targetBuildingId, normalizedFile)
      applyImportedFinishPrices(targetBuildingId, result.rows)
      setServerResult(data)
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : t('inventory.chessboardImportDialog.не_удалось_загрузить_на_сервер'))
    } finally {
      setIsUploading(false)
    }
  }

  const canUpload =
    !!file &&
    !!result &&
    result.rows.length > 0 &&
    !!targetBuildingId &&
    !!activeProjectId &&
    !isParsing &&
    !isUploading

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div
        className={`flex flex-col rounded-2xl border border-[rgba(242,207,141,0.2)] bg-[#0e1a12] shadow-2xl transition-[width,max-height] duration-200 ${
          expanded ? 'max-h-[95vh] w-full max-w-4xl' : 'max-h-[88vh] w-full max-w-2xl'
        }`}
      >
        <header className="flex shrink-0 items-center justify-between border-b border-[rgba(242,207,141,0.15)] px-5 py-4">
          <div className="flex items-center gap-2">
            <FileSpreadsheet size={18} className="text-[#c9a84c]" />
            <h2 className="text-sm font-normal text-[#fcecc8]">{t('inventory.chessboardImportDialog.импорт_шахматки_из_e')}</h2>
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="rounded-md px-2 py-1 text-[10px] text-[rgba(242,207,141,0.5)] hover:bg-[rgba(242,207,141,0.1)] hover:text-[#fcecc8]"
            >
              {expanded ? t('inventory.chessboardImportDialog.сжать') : t('inventory.chessboardImportDialog.расширить')}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-md p-1.5 text-[rgba(242,207,141,0.5)] hover:bg-[rgba(242,207,141,0.1)] hover:text-[#fcecc8]"
              aria-label={t('inventory.chessboardImportDialog.закрыть')}
            >
              <X size={16} />
            </button>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {/* Info + template */}
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs text-[rgba(242,207,141,0.6)]">
              {t('inventory.chessboardImportDialog.перетащите_xlsx_файл')}</p>
            <Button
              size="sm"
              variant="outline"
              onClick={() => downloadTemplate(activeProject?.finishTypes, activeProject?.currency || 'USD')}
              className="shrink-0 border-[rgba(242,207,141,0.3)] bg-transparent text-[#e8dcc4] hover:bg-[rgba(242,207,141,0.1)]"
            >
              <Download size={14} />
              {t('inventory.chessboardImportDialog.шаблон')}</Button>
          </div>

          {/* Целевой корпус — все строки файла будут загружены в него */}
          <div className="rounded-lg border border-[rgba(242,207,141,0.15)] bg-[rgba(0,0,0,0.25)] px-3 py-2.5 text-xs text-[rgba(242,207,141,0.7)] space-y-1.5">
            <label className="font-medium text-[rgba(242,207,141,0.9)]">{t('inventory.chessboardImportDialog.корпус_для_загрузки')}</label>
            {buildings.length === 0 ? (
              isLoadingBuildings ? (
                <div className="text-[rgba(242,207,141,0.6)]">{t('inventory.chessboardImportDialog.загрузка_корпусов')}</div>
              ) : (
                <div className="text-rose-300">{t('inventory.chessboardImportDialog.нет_корпусов_сначала')}</div>
              )
            ) : (
              <select
                value={targetBuildingId}
                onChange={(e) => setTargetBuildingId(e.target.value)}
                className="w-full rounded-md border border-[rgba(242,207,141,0.25)] bg-[rgba(0,0,0,0.4)] px-2.5 py-1.5 text-[#fcecc8] focus:border-[#c9a84c] focus:outline-none"
              >
                <option value="" disabled>
                  {t('inventory.chessboardImportDialog.выберите_корпус')}</option>
                {buildings.map((b) => (
                  <option key={b._id} value={b._id} className="bg-[#0e1a12]">
                    {b.name ?? b._id}
                  </option>
                ))}
              </select>
            )}
            <p className="text-[10px] text-[rgba(242,207,141,0.5)]">
              {t('inventory.chessboardImportDialog.все_строки_файла_ста')}</p>
          </div>

          {/* Drop zone */}
          <div
            onDragOver={(e) => { e.preventDefault(); setIsDragging(true) }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
            className={`flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-6 text-sm transition-colors ${
              isDragging
                ? 'border-[#c9a84c] bg-[rgba(201,168,76,0.1)] text-[#fcecc8]'
                : 'border-[rgba(242,207,141,0.2)] bg-[rgba(0,0,0,0.3)] text-[rgba(242,207,141,0.6)]'
            }`}
          >
            <Upload size={22} className="text-[rgba(242,207,141,0.45)]" />
            {fileName ? (
              <div className="font-medium text-[#fcecc8]">{fileName}</div>
            ) : (
              <div>{t('inventory.chessboardImportDialog.перетащите_файл_сюда')}</div>
            )}
            <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-[rgba(242,207,141,0.3)] bg-[rgba(0,0,0,0.3)] px-3 py-1.5 text-xs font-medium text-[#e8dcc4] hover:bg-[rgba(242,207,141,0.1)] hover:text-[#fcecc8]">
              {t('inventory.chessboardImportDialog.выбрать_файл')}<input type="file" accept=".xlsx,.xls" className="hidden" onChange={handleFileInput} />
            </label>
            {isParsing && <div className="text-xs text-[rgba(242,207,141,0.6)]">{t('inventory.chessboardImportDialog.читаем_файл')}</div>}
          </div>

          {result && (
            <div className="flex flex-col gap-3">
              {/* Summary row */}
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="flex items-center gap-2 rounded-md border border-emerald-400/40 bg-emerald-500/10 p-2 text-emerald-200">
                  <CheckCircle2 size={14} />
                  {t('inventory.chessboardImportDialog.корректных_строк')}<b>{result.rows.length}</b>
                </div>
                <div className={`flex items-center gap-2 rounded-md border p-2 ${
                  result.errors.length > 0
                    ? 'border-rose-400/40 bg-rose-500/10 text-rose-200'
                    : 'border-[rgba(242,207,141,0.15)] bg-[rgba(0,0,0,0.3)] text-[rgba(242,207,141,0.55)]'
                }`}>
                  <AlertCircle size={14} />
                  {t('inventory.chessboardImportDialog.ошибок_в_файле')}<b>{result.errors.length}</b>
                </div>
              </div>

              {/* Parse errors */}
              {result.errors.length > 0 && (
                <div className="max-h-36 overflow-y-auto rounded-md border border-rose-400/40 bg-rose-500/10 p-2 text-xs text-rose-200 space-y-0.5">
                  {result.errors.slice(0, 30).map((err, idx) => (
                    <div key={`${err.row}-${idx}`} className="flex gap-2">
                      <span className="shrink-0 opacity-60">{t('inventory.chessboardImportDialog.строка')}{err.row}:</span>
                      <span>{err.message}</span>
                    </div>
                  ))}
                  {result.errors.length > 30 && (
                    <div className="mt-1 font-normal">{t('inventory.chessboardImportDialog.ещ')}{result.errors.length - 30} {t('inventory.chessboardImportDialog.ошибок')}</div>
                  )}
                </div>
              )}

            </div>
          )}

          {uploadError && (
            <div className="flex items-start gap-2 rounded-md border border-rose-400/40 bg-rose-500/10 p-2 text-xs text-rose-200">
              <AlertCircle size={14} className="mt-0.5 shrink-0" />
              <span>{uploadError}</span>
            </div>
          )}
        </div>

        <footer className="flex shrink-0 items-center justify-end gap-2 border-t border-[rgba(242,207,141,0.15)] bg-[rgba(0,0,0,0.2)] px-5 py-3">
          <Button
            size="sm"
            variant="outline"
            onClick={onClose}
            className="border-[rgba(242,207,141,0.3)] bg-transparent text-[#e8dcc4] hover:bg-[rgba(242,207,141,0.1)]"
          >
            {t('inventory.chessboardImportDialog.отмена')}</Button>
          <Button
            size="sm"
            disabled={!canUpload}
            onClick={handleUpload}
            className="bg-[#c9a84c] text-[#0a1f12] hover:bg-[#e2c97e] disabled:opacity-40"
          >
            {isUploading ? t('inventory.chessboardImportDialog.загрузка') : t('inventory.chessboardImportDialog.загрузить_на_сервер')}
          </Button>
        </footer>
      </div>

      {serverResult && (
        <UploadResultPopup result={serverResult} onClose={() => setServerResult(null)} />
      )}
    </div>
  )
}

interface ResultPopupProps {
  result: UnitsExcelUploadResult
  onClose: () => void
}

function UploadResultPopup({ result, onClose }: ResultPopupProps) {
    const { t } = useI18n();
  const errors = result.errors ?? []
  const warnings = result.warnings ?? []
  const ok = errors.length === 0

  const stats: { label: string; value: number; tone: string }[] = [
    { label: t('inventory.chessboardImportDialog.всего_строк'), value: result.totalRows ?? 0, tone: 'text-[#fcecc8]' },
    { label: t('inventory.chessboardImportDialog.создано'), value: result.totalCreated ?? 0, tone: 'text-emerald-300' },
    { label: t('inventory.chessboardImportDialog.обновлено'), value: result.totalUpdated ?? 0, tone: 'text-sky-300' },
    { label: t('inventory.chessboardImportDialog.пропущено'), value: result.totalSkipped ?? 0, tone: 'text-rose-300' },
  ]

  return (
    <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/60 p-4">
      <div className="flex max-h-[88vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-[rgba(242,207,141,0.25)] bg-[#0e1a12] shadow-2xl">
        <header className="flex shrink-0 items-center justify-between border-b border-[rgba(242,207,141,0.15)] px-5 py-4">
          <div className="flex items-center gap-2">
            {ok ? (
              <CheckCircle2 size={18} className="text-emerald-400" />
            ) : (
              <AlertTriangle size={18} className="text-amber-400" />
            )}
            <h2 className="text-sm font-normal text-[#fcecc8]">
              {ok ? t('inventory.chessboardImportDialog.файл_загружен') : t('inventory.chessboardImportDialog.файл_загружен_с_замечаниями')}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1.5 text-[rgba(242,207,141,0.5)] hover:bg-[rgba(242,207,141,0.1)] hover:text-[#fcecc8]"
            aria-label={t('inventory.chessboardImportDialog.закрыть')}
          >
            <X size={16} />
          </button>
        </header>

        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
          {/* Stats */}
          <div className="grid grid-cols-4 gap-2">
            {stats.map((s) => (
              <div
                key={s.label}
                className="rounded-lg border border-[rgba(242,207,141,0.15)] bg-[rgba(0,0,0,0.3)] px-2 py-2.5 text-center"
              >
                <div className={`text-lg font-medium ${s.tone}`}>{s.value}</div>
                <div className="mt-0.5 text-[10px] uppercase tracking-wide text-[rgba(242,207,141,0.5)]">
                  {s.label}
                </div>
              </div>
            ))}
          </div>

          {/* Errors */}
          {errors.length > 0 && (
            <div className="overflow-hidden rounded-lg border border-rose-400/40 bg-rose-500/8">
              <div className="flex items-center gap-2 border-b border-rose-400/25 px-3 py-2 text-[11px] font-medium uppercase tracking-wide text-rose-300">
                <AlertCircle size={13} />
                {t('inventory.chessboardImportDialog.ошибки')}{errors.length}{t('inventory.chessboardImportDialog.строки_пропущены')}</div>
              <div className="max-h-44 divide-y divide-rose-400/10 overflow-y-auto">
                {errors.map((e, idx) => (
                  <div key={`err-${e.row}-${idx}`} className="px-3 py-2 text-xs text-rose-200">
                    <div className="mb-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] text-rose-300/70">
                      <span>{t('inventory.chessboardImportDialog.строка')}{e.row}</span>
                      {e.aptNum && <span>{t('inventory.chessboardImportDialog.кв')}{e.aptNum}</span>}
                      {e.field && <span>{t('inventory.chessboardImportDialog.поле')}{e.field}»</span>}
                    </div>
                    <div>{e.message}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Warnings */}
          {warnings.length > 0 && (
            <div className="overflow-hidden rounded-lg border border-amber-400/40 bg-amber-500/8">
              <div className="flex items-center gap-2 border-b border-amber-400/25 px-3 py-2 text-[11px] font-medium uppercase tracking-wide text-amber-300">
                <AlertTriangle size={13} />
                {t('inventory.chessboardImportDialog.предупреждения')}{warnings.length})
              </div>
              <div className="max-h-44 divide-y divide-amber-400/10 overflow-y-auto">
                {warnings.map((w, idx) => (
                  <div key={`warn-${w.row}-${idx}`} className="px-3 py-2 text-xs text-amber-100">
                    <div className="mb-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] text-amber-300/70">
                      <span>{t('inventory.chessboardImportDialog.строка')}{w.row}</span>
                      {w.aptNum && <span>{t('inventory.chessboardImportDialog.кв')}{w.aptNum}</span>}
                      {w.field && <span>{t('inventory.chessboardImportDialog.поле')}{w.field}»</span>}
                    </div>
                    <div>{w.message}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {ok && warnings.length === 0 && (
            <div className="flex items-center gap-2 rounded-md border border-emerald-400/40 bg-emerald-500/10 p-2.5 text-xs text-emerald-200">
              <CheckCircle2 size={14} />
              {t('inventory.chessboardImportDialog.все_строки_обработан')}</div>
          )}
        </div>

        <footer className="flex shrink-0 items-center justify-end border-t border-[rgba(242,207,141,0.15)] bg-[rgba(0,0,0,0.2)] px-5 py-3">
          <Button
            size="sm"
            onClick={onClose}
            className="bg-[#c9a84c] text-[#0a1f12] hover:bg-[#e2c97e]"
          >
            {t('inventory.chessboardImportDialog.готово')}</Button>
        </footer>
      </div>
    </div>
  )
}
