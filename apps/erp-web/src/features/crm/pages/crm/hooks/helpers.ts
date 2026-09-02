/** Ограничиваем список категорий: максимум 2 уникальных значения */
export function sanitizeCategories(cats?: string[] | null): string[] | undefined {
  if (!cats || !Array.isArray(cats)) return undefined;
  const unique = Array.from(new Set(cats.filter(Boolean)));
  return unique.slice(0, 2);
}
