import { IsMongoId, IsOptional } from 'class-validator';

export class ListInstallmentPlansQueryDto {
  @IsOptional()
  @IsMongoId()
  unitId?: string;
}
