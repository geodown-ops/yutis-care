/*
 * Outgoing email. Each message is recorded in `notifications` inside the request's transaction and sent once that
 * commits, so a rolled-back request never emails anyone and a sent link always points at committed data. The row
 * then ends `sent` or `failed` (with the provider's error); with EMAIL_PROVIDER=log it stays `queued` (not sent).
 * Templates never include health content, only who is asking and a link (see ./emails.ts).
 */
import { Logger } from '@nestjs/common';
import { notifications, withTenant, type Db } from '@yutis/db';
import { eq } from 'drizzle-orm';
import type { EmailConfig } from '../config.js';
import { afterCommit, type RequestContext } from './context.js';

export interface Mail {
  to: string;
  subject: string;
  text: string;
  /** Lets the provider drop a duplicate of the same message (the notification id). */
  idempotencyKey?: string;
}

/** Sends one email; throws if the provider refused it. Swap the implementation through EMAIL_PROVIDER. */
export interface Mailer {
  /** False when messages are only logged, never delivered. */
  readonly delivers: boolean;
  send(mail: Mail): Promise<void>;
}
export const MAILER = Symbol('MAILER');

/** Local development and the demo site: log that a message would have gone out, without its body or full address. */
export class LoggingMailer implements Mailer {
  readonly delivers = false;
  private readonly logger = new Logger('Mailer');

  async send(mail: Mail): Promise<void> {
    this.logger.log(`Not sent (EMAIL_PROVIDER=log): "${mail.subject}" to ${maskEmail(mail.to)}`);
  }
}

export const RESEND_ENDPOINT = 'https://api.resend.com/emails';

/** Resend's HTTPS API (https://resend.com/docs/api-reference/emails/send-email). */
export class ResendMailer implements Mailer {
  readonly delivers = true;

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

export interface Email extends Omit<Mail, 'idempotencyKey'> {
  /** Kind of message, stored on the notification row (e.g. `staff_invitation`, `signature`). */
  template: string;
  /** Ids the message is about; never the link itself, which carries a one-time token. */
  params: Record<string, unknown>;
}

/** Records and sends email for a request (see the top of this file). Provided by CoreModule. */
export class Notifier {
  private readonly logger = new Logger(Notifier.name);

  constructor(private readonly mailer: Mailer, private readonly db: Db) {}

  async email(ctx: RequestContext, email: Email): Promise<void> {
    const createdBy = ctx.principal?.kind === 'staff' ? ctx.principal.userId : null;
    const [row] = await ctx.tx.insert(notifications)
      .values({ tenantId: ctx.tenant.id, recipientEmail: email.to, template: email.template, params: email.params, createdBy })
      .returning({ id: notifications.id });
    const id = row!.id;
    afterCommit(ctx, async () => {
      let outcome: { status: 'sent'; sentAt: Date; error: null } | { status: 'failed'; error: string };
      try {
        await this.mailer.send({ to: email.to, subject: email.subject, text: email.text, idempotencyKey: id });
        if (!this.mailer.delivers) return;
        outcome = { status: 'sent', sentAt: new Date(), error: null };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.warn(`Email ${email.template} ${id} to ${maskEmail(email.to)} failed: ${message}`);
        outcome = { status: 'failed', error: message.slice(0, 1000) };
      }
      await withTenant(this.db, ctx.tenant.id, tx => tx.update(notifications).set({ ...outcome, updatedAt: new Date() }).where(eq(notifications.id, id)));
    });
  }
}
