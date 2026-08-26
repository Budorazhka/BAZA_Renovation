/**
 * docs/architecture/domain-model.md "Money & Currency" — общий transport-контракт,
 * используется API (request/response DTO) и всеми тремя frontend-приложениями
 * через сгенерированный из OpenAPI клиент. Никогда JS float для сумм
 * (conventions.md раздел 1).
 */
export type Currency = 'USD' | 'GEL' | 'RUB';

export interface MoneyAmount {
  readonly amountMinorUnits: number;
  readonly currency: Currency;
}

export const CURRENCIES: readonly Currency[] = ['USD', 'GEL', 'RUB'] as const;

export function isValidCurrency(value: string): value is Currency {
  return (CURRENCIES as readonly string[]).includes(value);
}
