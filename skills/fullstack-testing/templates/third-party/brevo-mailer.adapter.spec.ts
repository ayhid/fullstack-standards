/**
 * `BrevoMailer` — the adapter, tested with a fake SDK client.
 *
 * What is under test is OUR mapping: the payload we hand the SDK and how we
 * translate its failures. The SDK is a plain object of `jest.fn()`s passed to
 * the constructor — never `jest.mock('@getbrevo/brevo')`, never a real call.
 * Whether Brevo delivers, retries or validates is Brevo's business.
 *
 * Lives at `src/mail/brevo-mailer.adapter.spec.ts`.
 */

import { BREVO_TEMPLATES, BrevoMailer, mailerProvider } from './brevo-mailer.adapter';
import { MailDeliveryError } from './mailer.port';

const EMAIL = {
  to: { email: 'ada@example.com', name: 'Ada' },
  projectName: 'Apollo',
  inviteUrl: 'https://app.test/invitations/tok',
};

describe('BrevoMailer', () => {
  const sdk = { sendTransacEmail: jest.fn() };
  const mailer = new BrevoMailer(sdk);

  beforeEach(() => {
    sdk.sendTransacEmail.mockReset();
  });

  it('sends the invitation template with the recipient, params and tag', async () => {
    sdk.sendTransacEmail.mockResolvedValue({ messageId: '<abc@smtp-relay>' });

    await expect(mailer.sendInvitation(EMAIL)).resolves.toEqual({
      messageId: '<abc@smtp-relay>',
    });

    expect(sdk.sendTransacEmail).toHaveBeenCalledTimes(1);
    expect(sdk.sendTransacEmail).toHaveBeenCalledWith({
      templateId: BREVO_TEMPLATES.invitation,
      to: [{ email: 'ada@example.com', name: 'Ada' }],
      params: { projectName: 'Apollo', inviteUrl: 'https://app.test/invitations/tok' },
      tags: ['invitation'],
    });
  });

  it('sends the reminder with its own template, and no name when there is none', async () => {
    sdk.sendTransacEmail.mockResolvedValue({ messageId: 'm' });

    await mailer.sendInvitationReminder({ ...EMAIL, to: { email: 'ada@example.com' } });

    expect(sdk.sendTransacEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        templateId: BREVO_TEMPLATES.invitationReminder,
        to: [{ email: 'ada@example.com' }],
        tags: ['invitation-reminder'],
      })
    );
  });

  it('turns an SDK failure into MailDeliveryError, keeping the original as cause', async () => {
    const sdkError = Object.assign(new Error('Unauthorized'), { statusCode: 401 });
    sdk.sendTransacEmail.mockRejectedValue(sdkError);

    const error = await mailer.sendInvitation(EMAIL).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(MailDeliveryError);
    expect((error as MailDeliveryError).cause).toBe(sdkError);
  });

  it('treats a success without a message id as a delivery failure', async () => {
    sdk.sendTransacEmail.mockResolvedValue({});

    await expect(mailer.sendInvitation(EMAIL)).rejects.toBeInstanceOf(MailDeliveryError);
  });

  it('refuses to build without an API key', () => {
    const saved = process.env.BREVO_API_KEY;
    delete process.env.BREVO_API_KEY;
    try {
      const factory = (mailerProvider as { useFactory: () => unknown }).useFactory;
      expect(() => factory()).toThrow('BREVO_API_KEY is not set');
    } finally {
      if (saved !== undefined) process.env.BREVO_API_KEY = saved;
    }
  });
});
