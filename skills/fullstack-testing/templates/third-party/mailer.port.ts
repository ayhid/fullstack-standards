/**
 * The port: what the app needs from an email provider, in the app's words.
 *
 * Consumers inject `MAILER` and depend on this interface only — never on the
 * provider's SDK. Their specs mock this port; the adapter behind it is the one
 * place that knows Brevo (or whichever provider replaces it).
 *
 * Lives at `src/mail/mailer.port.ts`.
 */

export const MAILER = Symbol('MAILER');

export interface Recipient {
  email: string;
  name?: string;
}

export interface InvitationEmail {
  to: Recipient;
  projectName: string;
  inviteUrl: string;
}

export interface Mailer {
  sendInvitation(email: InvitationEmail): Promise<{ messageId: string }>;
  sendInvitationReminder(email: InvitationEmail): Promise<{ messageId: string }>;
}

/**
 * The one error type a consumer handles. The provider's own error stays on
 * `cause` for logs; nothing outside the adapter branches on it.
 */
export class MailDeliveryError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'MailDeliveryError';
  }
}
