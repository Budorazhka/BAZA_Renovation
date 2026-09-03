import mongoose, { Types } from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { LeadDocument, LeadSchema } from '../../src/modules/crm/schemas/lead.schema';
import { LeadEventDocument, LeadEventSchema } from '../../src/modules/crm/schemas/lead-event.schema';

/**
 * `[lead-legacy-migration-tool]` — ЭКСПЕРИМЕНТ, не предположение.
 *
 * LeadMigrationService обязан сохранить НАСТОЯЩУЮ историческую дату
 * (`createdAt` лида, `changedAt` каждого перехода стадии) из легаси-данных, а
 * не момент запуска инструмента переноса. Обе схемы объявлены с
 * `timestamps: {createdAt: '...', updatedAt: false}` — вопрос в том, уважает
 * ли Mongoose явно переданное значение временного поля при `Model.create()`,
 * или всегда перезаписывает его моментом вызова.
 *
 * Чтение исходников Mongoose 8.24.4 (lib/helpers/timestamps/
 * setDocumentTimestamps.js) показывает: pre('save') хук ставит дефолтное
 * значение ТОЛЬКО если `!doc.$__getValue(createdAt)` — то есть поле ещё не
 * установлено. Явно переданное значение (truthy Date) блокирует перезапись.
 * Этот тест подтверждает это ПОВЕДЕНИЕ экспериментально, против реальной
 * MongoDB (не мока): если бы чтение исходников было неверным, эти assert'ы
 * упали бы, и LeadMigrationService.importLegacyLeads пришлось бы переписать
 * на пост-создание `updateOne({_id}, {$set:{createdAt}})` в той же
 * транзакции — вместо этого он использует прямую передачу через
 * LeadRepository.createFromMigration/LeadEventRepository.append(changedAt).
 */
describe('Mongoose timestamps — explicit createdAt/changedAt на LeadDocument/LeadEventDocument (эксперимент)', () => {
  let replSet: MongoMemoryReplSet;
  let connection: mongoose.Connection;
  let LeadModel: mongoose.Model<LeadDocument>;
  let LeadEventModel: mongoose.Model<LeadEventDocument>;

  beforeAll(async () => {
    replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    await replSet.waitUntilRunning();
    connection = await mongoose.createConnection(replSet.getUri()).asPromise();
    LeadModel = connection.model(LeadDocument.name, LeadSchema);
    LeadEventModel = connection.model(LeadEventDocument.name, LeadEventSchema);
  }, 120_000);

  afterAll(async () => {
    await connection?.close();
    await replSet?.stop();
  });

  it('LeadDocument: явно переданный createdAt (историческая дата) сохраняется, НЕ перезаписывается текущим моментом', async () => {
    const historicalDate = new Date('2019-03-14T10:00:00.000Z');
    const organizationId = new Types.ObjectId();
    const contactId = new Types.ObjectId();

    const beforeInsert = Date.now();
    const [doc] = await LeadModel.create([
      {
        organizationId,
        contactId,
        source: { route: 'legacy-migration' },
        stage: 'new',
        createdAt: historicalDate,
      },
    ]);

    expect(doc!.createdAt.getTime()).toBe(historicalDate.getTime());
    expect(doc!.createdAt.getTime()).toBeLessThan(beforeInsert);

    // Перечитываем из базы напрямую (не из in-memory документа) — исключает
    // ложное срабатывание из-за того, что сравниваем с локальной переменной,
    // которую сам driver вернул нетронутой, а в базу ушло другое значение.
    const persisted = await LeadModel.findById(doc!._id).lean();
    expect(persisted!.createdAt.getTime()).toBe(historicalDate.getTime());
  });

  it('LeadDocument: без явного createdAt по-прежнему проставляется текущий момент (regression guard на обычный путь)', async () => {
    const before = Date.now();
    const [doc] = await LeadModel.create([
      {
        organizationId: new Types.ObjectId(),
        contactId: new Types.ObjectId(),
        source: { route: 'manual' },
        stage: 'new',
      },
    ]);
    const after = Date.now();

    expect(doc!.createdAt.getTime()).toBeGreaterThanOrEqual(before);
    expect(doc!.createdAt.getTime()).toBeLessThanOrEqual(after);
  });

  it('LeadEventDocument: явно переданный changedAt (историческая дата перехода) сохраняется', async () => {
    const historicalDate = new Date('2020-07-01T08:30:00.000Z');
    const [doc] = await LeadEventModel.create([
      {
        leadId: new Types.ObjectId(),
        organizationId: new Types.ObjectId(),
        stage: 'new',
        changedBy: { type: 'system' },
        changedAt: historicalDate,
      },
    ]);

    expect(doc!.changedAt.getTime()).toBe(historicalDate.getTime());

    const persisted = await LeadEventModel.findById(doc!._id).lean();
    expect(persisted!.changedAt.getTime()).toBe(historicalDate.getTime());
  });
});
