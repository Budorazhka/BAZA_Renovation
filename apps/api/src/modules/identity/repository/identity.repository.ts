import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { IdentityDocument, type IdentityStatus } from '../schemas/identity.schema';

/**
 * Единственная точка доступа к коллекции identities (ADR-002 требование 2).
 */
@Injectable()
export class IdentityRepository {
  constructor(@InjectModel(IdentityDocument.name) private readonly model: Model<IdentityDocument>) {}

  /**
   * passwordHash имеет `select: false` в схеме (не должен утекать в обычные
   * find/toJSON по умолчанию) — auth-flow явный единственный легитимный
   * потребитель, запрашивает его явно через `.select('+passwordHash')`.
   */
  async findByNormalizedLoginWithPasswordHash(normalizedLogin: string): Promise<IdentityDocument | null> {
    return this.model.findOne({ normalizedLogin }).select('+passwordHash').exec();
  }

  /**
   * assignOccupant-invite-flow (organizations.service.ts): найти существующую
   * Identity по email БЕЗ пароля — не auth-путь, просто existence-check
   * перед решением "линковать существующую" vs "создать pending_invite".
   */
  async findByNormalizedLogin(normalizedLogin: string): Promise<IdentityDocument | null> {
    return this.model.findOne({ normalizedLogin }).exec();
  }

  async findById(id: Types.ObjectId): Promise<IdentityDocument | null> {
    return this.model.findOne({ _id: id }).exec();
  }

  /**
   * team-users read-model (TeamController.list): батчевое чтение вместо
   * N отдельных findById на N занятых позиций организации.
   */
  async findByIds(ids: Types.ObjectId[]): Promise<IdentityDocument[]> {
    return this.model.find({ _id: { $in: ids } }).exec();
  }

  /**
   * passwordHash уже захеширован вызывающим кодом (AuthService — тот же
   * единственный сервис, что делает argon2.verify на login-пути, argon2.hash
   * живёт там же, не здесь: repository не должен решать, каким алгоритмом
   * хешировать пароль — это забота auth-домена, не data-access слоя).
   */
  async create(params: { normalizedLogin: string; passwordHash: string }): Promise<IdentityDocument> {
    return this.model.create(params);
  }

  /**
   * assignOccupant-invite-flow: Identity для человека, который ещё не
   * поставил себе пароль — passwordHash отсутствует, status:'pending_invite'
   * (login() отклоняет такую Identity явно, см. auth.service.ts).
   */
  async createPendingInvite(normalizedLogin: string): Promise<IdentityDocument> {
    return this.model.create({ normalizedLogin, status: 'pending_invite' });
  }

  /**
   * POST /invite/:token/activate — приглашённый ставит себе пароль
   * впервые, pending_invite → active необратимо. Условие status:'pending_invite'
   * в фильтре enforced на уровне запроса — повторная активация уже
   * активной Identity невозможна (modifiedCount:0 сигнализирует об этом
   * вызывающему коду).
   */
  async setPasswordAndActivate(id: Types.ObjectId, passwordHash: string): Promise<{ modifiedCount: number }> {
    const result = await this.model
      .updateOne({ _id: id, status: 'pending_invite' }, { $set: { passwordHash, status: 'active' } })
      .exec();
    return { modifiedCount: result.modifiedCount };
  }

  /**
   * domain-model.md Module 1 Identity command `deactivate` — единственный
   * mutation-метод для status/deactivatedAt. reactivate (status→'active')
   * переиспользует этот же метод (симметрично), не отдельная команда.
   */
  async updateStatus(id: Types.ObjectId, status: IdentityStatus): Promise<{ modifiedCount: number }> {
    const result = await this.model
      .updateOne(
        { _id: id },
        status === 'active'
          ? { $set: { status }, $unset: { deactivatedAt: 1 } }
          : { $set: { status, deactivatedAt: new Date() } },
      )
      .exec();
    return { modifiedCount: result.modifiedCount };
  }
}
