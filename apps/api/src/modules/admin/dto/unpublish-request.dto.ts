import { IsString, MinLength } from 'class-validator';

/**
 * OpenAPI v1-first-vertical-slice.yaml `adminUnpublish` requestBody:
 * {reason: {type: string, minLength: 10}} — permission-matrix.md разд.4
 * обязательный reason для Admin critical action.
 */
export class UnpublishRequestDto {
  @IsString()
  @MinLength(10)
  reason!: string;
}
