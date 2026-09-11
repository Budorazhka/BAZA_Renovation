import mongoose, { Types } from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { CommunityThreadRepository } from '../../src/modules/community/repository/community-thread.repository';
import { CommunityReplyRepository } from '../../src/modules/community/repository/community-reply.repository';
import { CommunityEventRepository } from '../../src/modules/community/repository/community-event.repository';
import {
  CommunityThreadDocument,
  CommunityThreadSchema,
} from '../../src/modules/community/schemas/community-thread.schema';
import {
  CommunityReplyDocument,
  CommunityReplySchema,
} from '../../src/modules/community/schemas/community-reply.schema';
import {
  CommunityEventDocument,
  CommunityEventSchema,
} from '../../src/modules/community/schemas/community-event.schema';

/**
 * ИСПРАВЛЕНО 11.09.2026 (community-forum-exchange.md, «Что открыто» п.5):
 * toggleReaction/toggleAttendance читали документ, мутировали в JS и звали
 * save() — классическая read-modify-write гонка без CAS. Два разных
 * пользователя, поставивших реакцию практически одновременно, читали одно и
 * то же состояние ДО первого save(), и более поздний save() затирал
 * документ целиком поверх более раннего — одна из двух реакций терялась
 * молча (не дублировалась, а пропадала). idempotency-coverage.test.ts
 * описывал эти маршруты как идемпотентные — на деле это было не так.
 *
 * Проверяется на настоящей MongoDB: N параллельных Promise.all-вызовов от
 * РАЗНЫХ identity должны дать ровно N в счётчике и ровно N id в массиве —
 * не меньше. Репозитории вызываются напрямую (не через CommunityService):
 * сервисный toggleThreadReaction добавляет только findById-проверку
 * существования, не связан с самой гонкой toggle — тот же выбор уровня
 * тестирования, что у community-author-snapshot.integration-spec.ts.
 */
describe('Community: гонка конкурентных toggle реакций/участия', () => {
  let replSet: MongoMemoryReplSet;
  let connection: mongoose.Connection;
  let threadRepository: CommunityThreadRepository;
  let replyRepository: CommunityReplyRepository;
  let eventRepository: CommunityEventRepository;
  let ThreadModel: mongoose.Model<CommunityThreadDocument>;
  let ReplyModel: mongoose.Model<CommunityReplyDocument>;
  let EventModel: mongoose.Model<CommunityEventDocument>;

  beforeAll(async () => {
    replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    await replSet.waitUntilRunning();
    connection = await mongoose.createConnection(replSet.getUri()).asPromise();

    ThreadModel = connection.model(CommunityThreadDocument.name, CommunityThreadSchema);
    ReplyModel = connection.model(CommunityReplyDocument.name, CommunityReplySchema);
    EventModel = connection.model(CommunityEventDocument.name, CommunityEventSchema);

    threadRepository = new CommunityThreadRepository(ThreadModel);
    replyRepository = new CommunityReplyRepository(ReplyModel);
    eventRepository = new CommunityEventRepository(EventModel);
  }, 120_000);

  afterAll(async () => {
    await connection?.close();
    await replSet?.stop();
  });

  function authorFields() {
    return {
      authorIdentityId: new Types.ObjectId(),
      authorPositionId: new Types.ObjectId(),
      organizationId: new Types.ObjectId(),
      authorSnapshot: { name: 'Автор' },
    };
  }

  it('десять конкурентных лайков темы от разных участников — реакции не теряются', async () => {
    const threadId = `race-thread-${new Types.ObjectId().toString()}`;
    await ThreadModel.create({
      threadId,
      type: 'discussion',
      sectionId: 'market',
      title: 'Гонка лайков',
      excerpt: 'Гонка лайков',
      body: 'Текст',
      ...authorFields(),
    });

    const userIds = Array.from({ length: 10 }, (_, i) => `race-user-${i}`);
    await Promise.all(userIds.map((userId) => threadRepository.toggleReaction(threadId, userId)));

    const stored = await ThreadModel.findOne({ threadId }).exec();
    expect(stored?.reactions).toBe(10);
    expect(stored?.reactionUserIds).toHaveLength(10);
    expect(new Set(stored?.reactionUserIds)).toEqual(new Set(userIds));
  });

  it('десять конкурентных лайков ответа от разных участников — реакции не теряются', async () => {
    const replyId = `race-reply-${new Types.ObjectId().toString()}`;
    await ReplyModel.create({
      replyId,
      threadId: `thread-${new Types.ObjectId().toString()}`,
      body: 'Ответ',
      ...authorFields(),
    });

    const userIds = Array.from({ length: 10 }, (_, i) => `race-user-${i}`);
    await Promise.all(userIds.map((userId) => replyRepository.toggleReaction(replyId, userId)));

    const stored = await ReplyModel.findOne({ replyId }).exec();
    expect(stored?.reactions).toBe(10);
    expect(stored?.reactionUserIds).toHaveLength(10);
  });

  it('десять конкурентных записей на мероприятие от разных участников — записи не теряются', async () => {
    const eventId = `race-event-${new Types.ObjectId().toString()}`;
    await EventModel.create({
      eventId,
      title: 'Митап',
      description: 'Описание',
      date: '2026-10-01',
      location: 'Москва',
      format: 'offline',
    });

    const identityIds = Array.from({ length: 10 }, () => new Types.ObjectId());
    await Promise.all(identityIds.map((identityId) => eventRepository.toggleAttendance(eventId, identityId)));

    const stored = await EventModel.findOne({ eventId }).exec();
    expect(stored?.attendeeCount).toBe(10);
    expect(stored?.attendeeIdentityIds).toHaveLength(10);
  });

  it('toggle остаётся переключателем: добавляет, затем убирает', async () => {
    const threadId = `toggle-thread-${new Types.ObjectId().toString()}`;
    await ThreadModel.create({
      threadId,
      type: 'discussion',
      sectionId: 'market',
      title: 'Обычный toggle',
      excerpt: 'Обычный toggle',
      body: 'Текст',
      ...authorFields(),
    });

    const userId = 'solo-user';
    const first = await threadRepository.toggleReaction(threadId, userId);
    expect(first).toEqual({ reactions: 1, reacted: true });

    const second = await threadRepository.toggleReaction(threadId, userId);
    expect(second).toEqual({ reactions: 0, reacted: false });
  });
});
