import { ArrayMinSize, IsArray, IsMongoId, IsObject, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateSelectionDto {
  @IsString()
  @MaxLength(200)
  title!: string;

  @IsArray()
  @ArrayMinSize(1)
  @IsMongoId({ each: true })
  unitIds!: string[];

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

  /** Настройки клиентского отображения (язык/валюта/видимость блоков) — свободная UI-конфигурация, см. dev-selection-customization.ts на фронте. */
  @IsOptional()
  @IsObject()
  customization?: Record<string, unknown>;
}
