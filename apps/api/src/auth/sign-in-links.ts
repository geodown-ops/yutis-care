/*
 * One-time email sign-in links sent from this system's own address: Identity Platform creates the link (it sends
 * nothing) and the Notifier emails it with our wording. Used by the login pages and by tenant admins. When the system
 * cannot send (email only logged, no email-link sign-in, Identity Platform refusing), callers fall back to the sign-in
 * service's own email in the browser.
 */
import { Inject, Injectable, Logger } from '@nestjs/common';
import { notifications } from '@yutis/db';
import { and, gt, inArray, sql } from 'drizzle-orm';
import { tenantOrigin, type ApiConfig } from '../config.js';
import type { RequestContext } from '../core/context.js';
import { API_CONFIG } from '../core/database.js';
import { signInLinkEmail } from '../core/emails.js';
import { Notifier } from '../core/mail.js';
import { IDENTITY_VERIFIER, type IdentityVerifier } from './identity.js';

export const NOT_SENT = ['email_not_configured', 'no_email_link', 'link_refused', 'too_many'] as const;
export type NotSent = (typeof NOT_SENT)[number];

export interface SignInLinkRecipient {
  kind: 'staff' | 'employee';
  id: string;
  email: string;
  name: string;
  /** Employees' portal language. */
  lang?: string;
}

/** Per person: one link a minute and ten a day, so neither a double click nor a stranger on the login page floods a mailbox. */
const MIN_INTERVAL = '1 minute';
const DAILY_LIMIT = 10;

@Injectable()
export class SignInLinks {
  private readonly logger = new Logger(SignInLinks.name);

  constructor(
    @Inject(API_CONFIG) private readonly config: ApiConfig,
    private readonly notifier: Notifier,
    @Inject(IDENTITY_VERIFIER) private readonly identity: IdentityVerifier,
  ) {}

  /** False when this deployment only logs email: callers fall back without looking anyone up. */
  get delivers(): boolean {
    return this.notifier.delivers;
  }

  async send(ctx: RequestContext, r: SignInLinkRecipient): Promise<{ sent: true } | { sent: false; reason: NotSent }> {
    if (!this.notifier.delivers) return { sent: false, reason: 'email_not_configured' };
    const key = r.kind === 'staff' ? 'userId' : 'employeeId';
    const [counts] = await ctx.tx.select({
      minute: sql<number>`count(*) filter (where ${notifications.createdAt} > now() - ${MIN_INTERVAL}::interval)::int`,
      day: sql<number>`count(*)::int`,
    }).from(notifications).where(and(
      inArray(notifications.template, ['staff_sign_in_link', 'employee_sign_in_link']),
      sql`${notifications.params}->>${key} = ${r.id}`,
      gt(notifications.createdAt, sql`now() - interval '1 day'`),
    )) as [{ minute: number; day: number }];
    if (counts.minute > 0 || counts.day >= DAILY_LIMIT) return { sent: false, reason: 'too_many' };

    const origin = tenantOrigin(this.config, ctx.tenant.slug);
    let url: string | null;
    try {
      url = await this.identity.signInLink(ctx.tenant, r.email, r.kind === 'staff' ? `${origin}/login` : `${origin}/me/login`);
    } catch (error) {
      // E.g. the API's service account lacks the permission: the browser can still have the sign-in service send it.
      this.logger.warn(`Could not create a sign-in link: ${error instanceof Error ? error.message : String(error)}`);
      return { sent: false, reason: 'link_refused' };
    }
    if (!url) return { sent: false, reason: 'no_email_link' };
    await this.notifier.email(ctx, signInLinkEmail({
      to: r.email, recipient: r.kind === 'staff' ? { userId: r.id } : { employeeId: r.id }, name: r.name, tenantName: ctx.tenant.name,
      site: `${ctx.tenant.slug}.${this.config.tenantBaseDomain}`, url, lang: r.kind === 'employee' ? r.lang : undefined,
    }));
    return { sent: true };
  }
}
