import { InvitationController } from './invitation.controller';
import type { OrganizationsService } from './organizations.service';

describe('InvitationController.activate', () => {
  it('делегирует OrganizationsService.activateInvitation, оборачивает в {success,data}', async () => {
    const activateInvitationSpy = jest.fn().mockResolvedValue({ email: 'invited@example.com' });
    const controller = new InvitationController(
      { activateInvitation: activateInvitationSpy } as unknown as OrganizationsService,
    );

    const result = await controller.activate('raw-token', { password: 'new-password-123' });

    expect(activateInvitationSpy).toHaveBeenCalledWith('raw-token', 'new-password-123');
    expect(result).toEqual({ success: true, data: { activated: true, email: 'invited@example.com' } });
  });
});
