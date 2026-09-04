import { Body, Controller, Delete, Get, HttpCode, Post, Req, UseGuards } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { Types } from 'mongoose';
import { MarketplaceAccountGuard } from '../../shared/marketplace-account/marketplace-account.guard';
import { requireMarketplaceAccountContext } from '../../shared/marketplace-account/marketplace-account-context.middleware';
import { FavoritesService } from './favorites.service';
import { FavoriteTargetDto } from './dto/favorite-target.dto';

/**
 * Избранное покупателя (MKT-SCR-017).
 *
 * Требует сессии: избранное принадлежит человеку. Гостю сердечко предлагает
 * войти — храня избранное анонимно, мы бы обещали сохранность, которой нет
 * (другое устройство или очистка браузера — и список пуст).
 *
 * Обе мутации идемпотентны по построению: повторное добавление ничего не
 * дублирует (уникальный индекс + upsert), повторное удаление возвращает тот же
 * результат. Поэтому Idempotency-Key здесь не требуется, и это заявлено в
 * реестре стража явно.
 */
@Controller('marketplace/favorites')
@UseGuards(MarketplaceAccountGuard)
export class FavoritesController {
  constructor(private readonly service: FavoritesService) {}

  @Get()
  list(@Req() req: FastifyRequest) {
    const account = requireMarketplaceAccountContext(req);
    return this.service.list(new Types.ObjectId(account.identityId));
  }

  @Post()
  add(@Req() req: FastifyRequest, @Body() dto: FavoriteTargetDto) {
    const account = requireMarketplaceAccountContext(req);
    return this.service.add(new Types.ObjectId(account.identityId), dto.targetType, dto.slug);
  }

  /**
   * DELETE с телом, а не с путём вида `/:targetType/:slug`: slug и так
   * ограничен алфавитом без слэшей, но тело оставляет форму запроса такой же,
   * как у добавления, и не заставляет клиента кодировать значения в путь.
   */
  @Delete()
  @HttpCode(200)
  remove(@Req() req: FastifyRequest, @Body() dto: FavoriteTargetDto) {
    const account = requireMarketplaceAccountContext(req);
    return this.service.remove(new Types.ObjectId(account.identityId), dto.targetType, dto.slug);
  }
}
