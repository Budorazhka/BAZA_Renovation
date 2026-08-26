import { AdminAccountSchema } from './admin-account.schema';

describe('admin module schemas — smoke', () => {
  it('AdminAccountSchema инстанцируется без ошибок', () => {
    expect(AdminAccountSchema).toBeDefined();
  });
});
