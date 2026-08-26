import { IsMongoId } from 'class-validator';

export class AssignLeadDto {
  @IsMongoId()
  assigneePositionId!: string;
}
