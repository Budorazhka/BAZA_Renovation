import * as pdfjs from 'pdfjs-dist'
// Воркер pdf.js бандлит и инстанцирует сам Vite (?worker). Раньше воркер
// подключался ссылкой на отдельный .mjs-ассет (?url + workerSrc) — в проде он
// не поднимался («Setting up fake worker failed»), и пользователь видел
// «Не удалось прочитать PDF», хотя сами PDF валидны. Через ?worker запуск не
// зависит от того, как сервер отдаёт .mjs.
import PdfjsWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?worker'

pdfjs.GlobalWorkerOptions.workerPort = new PdfjsWorker()

export function isPdfFile(file: File): boolean {
  return file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')
}

/**
 * Рендерит страницы PDF в PNG data URL.
 * Поэтажки часто на прозрачном фоне — подкладываем белый, иначе на тёмной теме план уходит в чёрноту.
 */
export async function renderPdfToPngDataUrls(
  file: File,
  opts?: { maxWidth?: number; maxPages?: number },
): Promise<string[]> {
  const maxWidth = opts?.maxWidth ?? 2400
  const data = await file.arrayBuffer()
  const doc = await pdfjs.getDocument({ data }).promise
  try {
    const count = opts?.maxPages ? Math.min(opts.maxPages, doc.numPages) : doc.numPages
    const out: string[] = []
    for (let pageNum = 1; pageNum <= count; pageNum += 1) {
      const page = await doc.getPage(pageNum)
      // Большие архитектурные планы (A1) масштабируем под предел ширины, иначе canvas огромный и медленный.
      const base = page.getViewport({ scale: 1 })
      const scale = Math.min(2, maxWidth / base.width)
      const viewport = page.getViewport({ scale })
      const canvas = document.createElement('canvas')
      canvas.width = Math.ceil(viewport.width)
      canvas.height = Math.ceil(viewport.height)
      const ctx = canvas.getContext('2d')
      if (!ctx) throw new Error('Canvas 2D context недоступен')
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      await page.render({ canvasContext: ctx, viewport }).promise
      out.push(canvas.toDataURL('image/png'))
      page.cleanup()
    }
    return out
  } finally {
    await doc.destroy()
  }
}

export function dataUrlToFile(dataUrl: string, name: string): File {
  const [head, body] = dataUrl.split(',')
  const mime = head.match(/data:(.*?);/)?.[1] ?? 'image/png'
  const binary = atob(body)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i)
  return new File([bytes], name, { type: mime })
}
