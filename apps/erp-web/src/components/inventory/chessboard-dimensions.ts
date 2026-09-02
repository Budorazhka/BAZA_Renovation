/** Ячейка: минимальная высота на 2 строки текста, без фиксированного квадрата. */
export const CB_SLOT_BOX = 'w-full min-w-0 min-h-[4.5rem]'
export const CB_ROW_GAP = 'gap-1'

/** Колонка этажей 3rem + равные доли по числу стояков (min 5.5rem per cell so wide grids scroll) */
export function cbGridTemplateColumns(maxPosition: number): string {
  return `3rem repeat(${Math.max(0, maxPosition)}, minmax(5.5rem, 1fr))`
}
