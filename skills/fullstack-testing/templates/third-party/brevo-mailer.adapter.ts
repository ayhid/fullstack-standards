/**
 * Brevo adapter for the `Mailer` port — the only file that imports the Brevo
 * SDK or reads its API key.
 *
 * It maps the app's request to Brevo's payload and Brevo's failures to
 * `MailDeliveryError`. It is tested with a fake SDK client passed to its
 * constructor; the SDK itself is never tested, and no spec calls Brevo.
 *
 * Lives at `src/mail/brevo-mailer.adapter.ts`.
 */

import type { Provider } from '@nestjs/common';
import { BrevoClient, type Brevo } from '@getbrevo/brevo';

import {
  MAILER,
  MailDeliveryError,
  type InvitationEmail,
  type Mailer,
  type Recipient,
} from './mailer.port';

/** The slice of the SDK the adapter uses; `BrevoClient#transactionalEmails` satisfies it. */
export interface BrevoTransactionalApi {
  sendTransacEmail(
    request: Brevo.SendTransacEmailRequest
  ): Promise<Brevo.SendTransacEmailResponse>;
}

/** Template ids configured in Brevo. Read them from config in a real app. */
export const BREVO_TEMPLATES = {
  invitation: 12,
  invitationReminder: 13,
} as const;

export class BrevoMailer implements Mailer {
  constructor(private readonly brevo: BrevoTransactionalApi) {}

  sendInvitation(email: InvitationEmail) {
    return this.send(BREVO_TEMPLATES.invitation, email.to, invitationParams(email), 'invitation');
  }

  sendInvitationReminder(email: InvitationEmail) {
    return this.send(
      BREVO_TEMPLATES.invitationReminder,
      email.to,
      invitationParams(email),
      'invitation-reminder'
    );
  }

  private async send(
    templateId: number,
    to: Recipient,
    params: Record<string, unknown>,
    tag: string
  ): Promise<{ messageId: string }> {
    let response: Brevo.SendTransacEmailResponse;
    try {
      response = await this.brevo.sendTransacEmail({
        templateId,
        to: [to.name ? { email: to.email, name: to.name } : { email: to.email }],
        params,
        tags: [tag],
      });
    } catch (error) {
      throw new MailDeliveryError(`Brevo rejected email template ${templateId}`, {
        cause: error,
      });
    }
    // A 2xx without an id cannot be traced or deduplicated: treat it as a failure.
    if (!response.messageId) {
      throw new MailDeliveryError(`Brevo returned no message id for template ${templateId}`);
    }
    return { messageId: response.messageId };
  }
}

function invitationParams({ projectName, inviteUrl }: InvitationEmail) {
  return { projectName, inviteUrl };
}

/**
 * The SDK is built inside the `MAILER` factory, so a test that overrides
 * `MAILER` never constructs it and never needs `BREVO_API_KEY`.
 */
export const mailerProvider: Provider = {
  provide: MAILER,
  useFactory: (): Mailer => {
    const apiKey = process.env.BREVO_API_KEY;
    if (!apiKey) throw new Error('BREVO_API_KEY is not set');
    return new BrevoMailer(new BrevoClient({ apiKey }).transactionalEmails);
  },
};
