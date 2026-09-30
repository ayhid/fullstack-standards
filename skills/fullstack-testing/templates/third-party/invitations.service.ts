/**
 * Example consumer of a third-party port. It knows `Mailer`, not Brevo.
 *
 * Two kinds of call, decided per call and tested both ways:
 * - required (`invite`): if the email fails, the operation fails with a Nest
 *   exception the global filter can shape;
 * - best-effort (`remind`): a delivery failure is logged and reported, never
 *   thrown. An unexpected error (a bug) still throws.
 *
 * Lives at `src/invitations/invitations.service.ts`.
 */

import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';

import { MAILER, MailDeliveryError, type Mailer } from '../mail/mailer.port';

export interface InviteInput {
  email: string;
  name?: string;
  projectName: string;
  token: string;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

@Injectable()
export class InvitationsService {
  private readonly logger = new Logger(InvitationsService.name);
  private readonly appUrl = (process.env.APP_URL ?? 'http://localhost:5173').replace(/\/+$/, '');

  constructor(@Inject(MAILER) private readonly mailer: Mailer) {}

  async invite(input: InviteInput): Promise<{ messageId: string }> {
    try {
      return await this.mailer.sendInvitation(this.toEmail(input));
    } catch (error) {
      if (error instanceof MailDeliveryError) {
        throw new ServiceUnavailableException('The invitation email could not be sent', {
          cause: error,
        });
      }
      throw error;
    }
  }

  /** Resolves `false` when the reminder could not be delivered. */
  async remind(input: InviteInput): Promise<boolean> {
    try {
      await this.mailer.sendInvitationReminder(this.toEmail(input));
      return true;
    } catch (error) {
      if (!(error instanceof MailDeliveryError)) throw error;
      this.logger.warn(`Invitation reminder not delivered: ${error.message}`);
      return false;
    }
  }

  /** Validates before any call: an invalid address never reaches the provider. */
  private toEmail({ email, name, projectName, token }: InviteInput) {
    const address = email.trim().toLowerCase();
    if (!EMAIL.test(address)) {
      throw new BadRequestException('Invalid email address');
    }
    return {
      to: name ? { email: address, name } : { email: address },
      projectName,
      inviteUrl: `${this.appUrl}/invitations/${encodeURIComponent(token)}`,
    };
  }
}
