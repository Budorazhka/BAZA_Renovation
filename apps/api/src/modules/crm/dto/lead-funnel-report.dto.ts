import { IsDateString, IsIn, IsOptional } from 'class-validator';
import { PRODUCT_TYPES, type ProductType } from '../lead-stage-definitions';

/** GET /crm/reports/lead-funnel?productType=&from=&to= — все параметры опциональны. */
export class LeadFunnelReportDto {
  @IsOptional()
  @IsIn(PRODUCT_TYPES)
  productType?: ProductType;

  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;
}
