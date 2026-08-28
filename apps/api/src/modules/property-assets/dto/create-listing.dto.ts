import { Type } from 'class-transformer';
import { IsIn, IsInt, IsNotEmpty, IsString, Min, ValidateNested } from 'class-validator';

class MoneyAmountDto {
  @IsInt()
  @Min(0)
  amountMinorUnits!: number;

  @IsString()
  @IsIn(['USD', 'GEL', 'RUB'])
  currency!: 'USD' | 'GEL' | 'RUB';
}

export class CreateListingDto {
  @IsIn(['sale', 'rent_long', 'rent_short'])
  dealType!: 'sale' | 'rent_long' | 'rent_short';

  @ValidateNested()
  @Type(() => MoneyAmountDto)
  @IsNotEmpty()
  price!: MoneyAmountDto;
}
