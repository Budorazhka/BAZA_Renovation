import { Connection, ClientSession } from 'mongoose';

/**
 * Единая точка выполнения MongoDB multi-document transaction (ADR-006).
 * Требует replica set (ADR-001 инфраструктурная предпосылка) — на
 * standalone MongoDB инстансе `startSession().withTransaction()` бросит
 * ошибку, что и является намеренным поведением: транзакционные команды
 * (booking, publish, vacatePosition) не должны молча деградировать до
 * нетранзакционного выполнения.
 *
 * Использует встроенный retry MongoDB-драйвера для TransientTransactionError
 * (withTransaction делает это автоматически) — важно для ADR-006 BookingLock
 * паттерна, где конкурентные транзакции ожидаемо получают write conflict
 * и должны повторяться, не падать с ошибкой наружу.
 */
export async function runInTransaction<T>(
  connection: Connection,
  work: (session: ClientSession) => Promise<T>,
): Promise<T> {
  const session = await connection.startSession();
  try {
    let result: T | undefined;
    await session.withTransaction(async () => {
      result = await work(session);
    });
    return result as T;
  } finally {
    await session.endSession();
  }
}
