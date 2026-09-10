import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import type {
  ExchangeIntent,
  ExchangeSide,
  ExchangeStatus,
  ThreadType,
} from '../schemas/community-thread.schema';

export const THREAD_TYPES: ThreadType[] = [
  'discussion',
  'question',
  'announcement',
  'exchange',
  'showcase',
];

export const EXCHANGE_INTENTS: ExchangeIntent[] = [
  'rent_seek',
  'buy_seek',
  'partner_seek',
  'client_handover',
  'rent_offer',
  'sale_offer',
  'service_offer',
];

export const EXCHANGE_SIDES: ExchangeSide[] = ['demand', 'supply'];

export const EXCHANGE_STATUSES: ExchangeStatus[] = ['open', 'in_work', 'closed'];

export class ListCommunityThreadsQueryDto {
  @IsOptional()
  @IsString()
  section?: string;

  @IsOptional()
  @IsEnum(THREAD_TYPES)
  type?: ThreadType;

  @IsOptional()
  @IsString()
  tag?: string;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsEnum(EXCHANGE_INTENTS)
  exchangeIntent?: ExchangeIntent;

  @IsOptional()
  @IsEnum(EXCHANGE_SIDES)
  exchangeSide?: ExchangeSide;

  @IsOptional()
  @IsEnum(EXCHANGE_STATUSES)
  exchangeStatus?: ExchangeStatus;

  @IsOptional()
  @IsEnum(['active', 'new', 'unanswered'])
  sort?: 'active' | 'new' | 'unanswered';

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  pageSize?: number;
}

export class ExchangeMetaDto {
  @IsEnum(EXCHANGE_INTENTS)
  intent!: ExchangeIntent;

  @IsEnum(EXCHANGE_SIDES)
  side!: ExchangeSide;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  dealKind!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  location!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  amount!: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  commission?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  deadline?: string;

  @IsOptional()
  @IsEnum(EXCHANGE_STATUSES)
  status?: ExchangeStatus;
}

export class CreateCommunityThreadDto {
  @IsEnum(THREAD_TYPES)
  type!: ThreadType;

  @IsString()
  @IsNotEmpty()
  sectionId!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(250)
  title!: string;

  @IsString()
  @IsNotEmpty()
  body!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  excerpt?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  // `pinned` убран 11.09.2026: любой, кто мог создать тему, закреплял её поверх
  // общей ленты у всех организаций. Закрепление — только
  // PATCH /community/threads/:id/pin (модерация своей организации). В
  // OpenAPI CreateCommunityThreadRequest этого поля и не было.

  @IsOptional()
  @ValidateNested()
  @Type(() => ExchangeMetaDto)
  exchange?: ExchangeMetaDto;
}

export class UpdateCommunityThreadDto {
  @IsOptional()
  @IsString()
  @MaxLength(250)
  title?: string;

  @IsOptional()
  @IsString()
  body?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  excerpt?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @IsOptional()
  @IsBoolean()
  pinned?: boolean;

  @IsOptional()
  @IsBoolean()
  solved?: boolean;

  @IsOptional()
  @IsBoolean()
  locked?: boolean;

  @IsOptional()
  @ValidateNested()
  @Type(() => ExchangeMetaDto)
  exchange?: ExchangeMetaDto;
}

export class ListCommunityRepliesQueryDto {
  @IsOptional()
  @IsEnum(['best_first', 'newest', 'oldest'])
  sort?: 'best_first' | 'newest' | 'oldest';

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  pageSize?: number;
}

export class CreateCommunityReplyDto {
  @IsString()
  @IsNotEmpty()
  body!: string;
}

export class UpdateCommunityReplyDto {
  @IsString()
  @IsNotEmpty()
  body!: string;
}

export class UpdateExchangeStatusDto {
  @IsEnum(EXCHANGE_STATUSES)
  status!: ExchangeStatus;
}

export class ListCommunityEventsQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  pageSize?: number;
}
