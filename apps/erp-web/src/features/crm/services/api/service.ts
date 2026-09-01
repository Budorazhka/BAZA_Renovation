import { createApiClient } from './client';
import { createAuthMethods } from './auth';
import { createAdminMethods } from './admin';
import { createLeadsMethods } from './leads';
import { createTasksMethods } from './tasks';
import { createCalendarMethods } from './calendar';
import { createNotesMethods } from './notes';
import { createNotificationsMethods } from './notifications';
import { createAppealsMethods } from './appeals';
import { createFilesMethods } from './files';
import { createOnlineMethods } from './online';
import { createSettingsMethods } from './settings';

const api = createApiClient();
const ctx = { api };

const auth = createAuthMethods(ctx);
const admin = createAdminMethods(ctx);
const leads = createLeadsMethods(ctx);
const tasks = createTasksMethods(ctx);
const calendar = createCalendarMethods(ctx);
const notes = createNotesMethods(ctx);
const notifications = createNotificationsMethods(ctx);
const appeals = createAppealsMethods(ctx);
const settings = createSettingsMethods(ctx);
const files = createFilesMethods({
  uploadTaskFile: tasks.uploadTaskFile,
  uploadLeadFile: leads.uploadLeadFile,
  uploadNoteFile: notes.uploadNoteFile,
  uploadTaskFilesBulk: tasks.uploadTaskFilesBulk,
  uploadLeadFilesBulk: leads.uploadLeadFilesBulk,
  uploadNoteFilesBulk: notes.uploadNoteFilesBulk,
});
const online = createOnlineMethods(ctx);

export type ApiServiceType = ReturnType<typeof createAuthMethods> &
  ReturnType<typeof createAdminMethods> &
  ReturnType<typeof createLeadsMethods> &
  ReturnType<typeof createTasksMethods> &
  ReturnType<typeof createCalendarMethods> &
  ReturnType<typeof createNotesMethods> &
  ReturnType<typeof createNotificationsMethods> &
  ReturnType<typeof createAppealsMethods> &
  ReturnType<typeof createFilesMethods> &
  ReturnType<typeof createOnlineMethods> &
  ReturnType<typeof createSettingsMethods>;

export const apiService: ApiServiceType = {
  ...auth,
  ...admin,
  ...leads,
  ...tasks,
  ...calendar,
  ...notes,
  ...notifications,
  ...appeals,
  ...files,
  ...online,
  ...settings,
};
