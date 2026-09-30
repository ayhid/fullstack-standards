/**
 * `InvitationsService` — tested through the `Mailer` port, which is mocked.
 *
 * Brevo is never involved: not its SDK, not the adapter. Each case asserts
 * that the port is called with the right params (or not at all), and that
 * the service raises the right exception — or deliberately does not.
 *
 * Lives at `src/invitations/invitations.service.spec.ts`.
 */

import {
  BadRequestException,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';

import { MAILER, MailDeliveryError, type Mailer } from '../mail/mailer.port';
import { InvitationsService } from './invitations.service';

const INPUT = {
  email: '  Ada@Example.com ',
  name: 'Ada',
  projectName: 'Apollo',
  token: 'tok/123',
};

const EXPECTED_EMAIL = {
  to: { email: 'ada@example.com', name: 'Ada' },
  projectName: 'Apollo',
  inviteUrl: 'https://app.test/invitations/tok%2F123',
};

describe('InvitationsService', () => {
  // A typed mock: every method exists, none resolves unless a test says so.
  let mailer: jest.Mocked<Mailer>;
  let service: InvitationsService;

  beforeEach(async () => {
    process.env.APP_URL = 'https://app.test/';
    mailer = {
      sendInvitation: jest.fn(),
      sendInvitationReminder: jest.fn(),
    };
    const moduleRef = await Test.createTestingModule({
      providers: [InvitationsService, { provide: MAILER, useValue: mailer }],
    }).compile();
    service = moduleRef.get(InvitationsService);
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
    delete process.env.APP_URL;
  });

  describe('invite (required email)', () => {
    it('sends one invitation with the normalised address and the invite link', async () => {
      mailer.sendInvitation.mockResolvedValue({ messageId: 'msg-1' });

      await expect(service.invite(INPUT)).resolves.toEqual({ messageId: 'msg-1' });

      expect(mailer.sendInvitation).toHaveBeenCalledTimes(1);
      expect(mailer.sendInvitation).toHaveBeenCalledWith(EXPECTED_EMAIL);
      expect(mailer.sendInvitationReminder).not.toHaveBeenCalled();
    });

    it('rejects an invalid address without calling the provider', async () => {
      await expect(service.invite({ ...INPUT, email: 'not-an-email' })).rejects.toBeInstanceOf(
        BadRequestException
      );
      expect(mailer.sendInvitation).not.toHaveBeenCalled();
    });

    it('fails with 503 when the email cannot be delivered, keeping the cause', async () => {
      const delivery = new MailDeliveryError('provider down');
      mailer.sendInvitation.mockRejectedValue(delivery);

      const error = await service.invite(INPUT).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(ServiceUnavailableException);
      expect((error as Error).cause).toBe(delivery);
    });

    it('lets an unexpected error through unchanged', async () => {
      const bug = new TypeError('boom');
      mailer.sendInvitation.mockRejectedValue(bug);

      await expect(service.invite(INPUT)).rejects.toBe(bug);
    });
  });

  describe('remind (best-effort email)', () => {
    it('sends the reminder with the same params and reports success', async () => {
      mailer.sendInvitationReminder.mockResolvedValue({ messageId: 'msg-2' });

      await expect(service.remind(INPUT)).resolves.toBe(true);
      expect(mailer.sendInvitationReminder).toHaveBeenCalledTimes(1);
      expect(mailer.sendInvitationReminder).toHaveBeenCalledWith(EXPECTED_EMAIL);
    });

    it('does not throw when delivery fails; it reports it', async () => {
      mailer.sendInvitationReminder.mockRejectedValue(new MailDeliveryError('provider down'));

      await expect(service.remind(INPUT)).resolves.toBe(false);
      expect(Logger.prototype.warn).toHaveBeenCalledTimes(1);
    });

    it('still throws on an unexpected error — best-effort covers delivery only', async () => {
      mailer.sendInvitationReminder.mockRejectedValue(new TypeError('boom'));

      await expect(service.remind(INPUT)).rejects.toBeInstanceOf(TypeError);
    });

    it('rejects an invalid address before any call', async () => {
      await expect(service.remind({ ...INPUT, email: '' })).rejects.toBeInstanceOf(
        BadRequestException
      );
      expect(mailer.sendInvitationReminder).not.toHaveBeenCalled();
    });
  });
});
