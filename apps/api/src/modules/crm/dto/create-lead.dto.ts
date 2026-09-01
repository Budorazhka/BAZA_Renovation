import { IsMongoId, IsOptional, IsString, Length } from 'class-validator';

/**
 * Ровно один способ указать контакт лида: либо уже существующий
 * `contactId` (агент выбрал контакт из CRM), либо `requesterPhone`
 * (+опционально `requesterName`) — CrmService.resolveContact сам находит
 * существующий Contact по телефону в этой организации или создаёт новый
 * (tenant-local dedupe, тот же механизм, что публичный reveal-contact
 * использует для гостя). Если передан `contactId`, остальные поля
 * игнорируются — явного запрета на одновременную передачу нет
 * (не усложняем DTO бесполезной для клиента ошибкой валидации).
 */
export class CreateLeadDto {
  @IsOptional()
  @IsMongoId()
  contactId?: string;

  @IsOptional()
  @IsString()
  @Length(1, 200)
  requesterName?: string;

  @IsOptional()
  @IsString()
  @Length(1, 30)
  requesterPhone?: string;
}
