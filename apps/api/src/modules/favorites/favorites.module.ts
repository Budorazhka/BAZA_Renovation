import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { FavoriteDocument, FavoriteSchema } from './schemas/favorite.schema';
import { FavoriteRepository } from './repository/favorite.repository';
import { FavoritesService } from './favorites.service';
import { FavoritesController } from './favorites.controller';

@Module({
  imports: [MongooseModule.forFeature([{ name: FavoriteDocument.name, schema: FavoriteSchema }])],
  controllers: [FavoritesController],
  providers: [FavoriteRepository, FavoritesService],
})
export class FavoritesModule {}
