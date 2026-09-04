import { IsInt, IsMongoId, IsObject, IsOptional, IsString, Min, MaxLength } from 'class-validator';

export class UpdateSelectionDto {
  @IsInt()
  @Min(0)
  expectedVersion!: number;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @IsMongoId()
  leadId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  clientName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  clientPhone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  agentNote?: string;

  @IsOptional()
  @IsObject()
  customization?: Record<string, unknown>;
}
