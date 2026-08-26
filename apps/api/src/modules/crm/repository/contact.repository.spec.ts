import { Types } from 'mongoose';
import { ContactRepository } from './contact.repository';

describe('ContactRepository.findByPhone', () => {
  /**
   * domain-model.md Module 7 invariant: tenant-local dedupe — organizationId
   * ОБЯЗАТЕЛЬНО в фильтре, не только phone. Без него dedupe утекал бы через
   * границу организации (чужой Contact с тем же номером считался бы найденным).
   */
  it('фильтр включает organizationId И phone, не только phone', async () => {
    const organizationId = new Types.ObjectId();
    const execSpy = jest.fn().mockResolvedValue(null);
    const findOneSpy = jest.fn().mockReturnValue({ exec: execSpy });
    const repository = new ContactRepository({ findOne: findOneSpy } as never);

    await repository.findByPhone(organizationId, '+79997654321');

    expect(findOneSpy).toHaveBeenCalledWith({ organizationId, phone: '+79997654321' });
  });
});
