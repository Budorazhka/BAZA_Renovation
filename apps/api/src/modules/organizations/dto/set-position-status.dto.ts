import { IsIn } from 'class-validator';
import { TEAM_USER_STATUSES, type TeamUserStatus } from '../team-user-status';

export class SetPositionStatusDto {
  @IsIn(TEAM_USER_STATUSES)
  status!: TeamUserStatus;
}
