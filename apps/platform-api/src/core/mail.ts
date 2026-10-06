/*
 * The platform's own outgoing email (trial application notices), through the same provider as the tenant API. Tenant
 * admin invitations still go through Identity Platform (integrations/gcp.ts).
 */
import { Logger } from '@nestjs/common';
import type { EmailConfig } from '../config.js';

export interface Mail {
  to: string;
  subject: string;
  text: string;
  /** Lets the provider drop a duplicate of the same message. */
  idempotencyKey?: string;
}

/** Sends one email; throws if the provider refused it. Chosen by EMAIL_PROVIDER. */
export interface Mailer {
  send(mail: Mail): Promise<void>;
}
export const MAILER = Symbol('MAILER');

/** Local development and tests: log that a message would have gone out, without its body or full address. */
export class LoggingMailer implements Mailer {
  private readonly logger = new Logger('Mailer');

  async send(mail: Mail): Promise<void> {
    this.logger.log(`Not sent (EMAIL_PROVIDER=log): "${mail.subject}" to ${maskEmail(mail.to)}`);
  }
}

export const RESEND_ENDPOINT = 'https://api.resend.com/emails';

/** Resend's HTTPS API (https://resend.com/docs/api-reference/emails/send-email). */
export class ResendMailer implements Mailer {
  constructor(private readonly apiKey: string, private readonly from: string) {}

  async send(mail: Mail): Promise<void> {
    const res = await fetch(RESEND_ENDPOINT, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${this.apiKey}`,
        'content-type': 'application/json',
        ...(mail.idempotencyKey ? { 'idempotency-key': mail.idempotencyKey } : {}),
      },
      body: JSON.stringify({ from: this.from, to: [mail.to], subject: mail.subject, text: mail.text }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new Error(`Resend answered ${res.status}: ${(await res.text()).slice(0, 300)}`);
  }
}

export function createMailer(config: EmailConfig): Mailer {
  return config.provider === 'resend' ? new ResendMailer(config.apiKey, config.from) : new LoggingMailer();
}

/** `a***@example.com`: enough to tell recipients apart in logs without writing the address down. */
export function maskEmail(email: string): string {
  const at = email.lastIndexOf('@');
  return at < 1 ? '***' : `${email[0]}***${email.slice(at)}`;
}
