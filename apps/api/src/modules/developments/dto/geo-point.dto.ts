import { IsIn, IsNumber, ArrayMinSize, ArrayMaxSize } from 'class-validator';

/**
 * ADR-007: GeoJSON Point, [longitude, latitude] — жёсткое требование
 * порядка (не [lat, lng], частая ошибка при интеграции с картами).
 */
export class GeoPointDto {
  @IsIn(['Point'])
  type!: 'Point';

  @ArrayMinSize(2)
  @ArrayMaxSize(2)
  @IsNumber({}, { each: true })
  coordinates!: [number, number];
}
