import type { ClientSession, Connection } from 'mongoose';

/**
 * Выполняет операцию репозитория с настоящей ClientSession.
 *
 * Нужен там, где сид-хелперы тестов зовут методы, у которых `session`
 * ОБЯЗАТЕЛЕН по сигнатуре. В MarketplacePublicationRepository это сделано
 * намеренно (все три мутирующих метода требуют session — состояние
 * публикации меняется только внутри транзакции), поэтому правильный путь —
 * дать тесту сессию, а не ослаблять продовую сигнатуру до `session?`.
 *
 * Транзакция здесь не открывается: сид — одна запись, атомарность которой
 * не проверяется. Нужна ровно сессия, которую требует тип.
 */
export async function withSession<T>(
  connection: Connection,
  fn: (session: ClientSession) => Promise<T>,
): Promise<T> {
  const session = await connection.startSession();
  try {
    return await fn(session);
  } finally {
    await session.endSession();
  }
}
