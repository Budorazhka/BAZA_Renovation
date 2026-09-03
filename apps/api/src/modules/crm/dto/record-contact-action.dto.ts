import { IsIn } from 'class-validator';

/** POST /leads/:leadId/contact-actions — легаси recordLeadContactAction ('call' | 'chat'). */
export class RecordContactActionDto {
  @IsIn(['call', 'chat'])
  contactType!: 'call' | 'chat';
}
