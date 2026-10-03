/*
 * Services outside the database that tenant onboarding and billing depend on. Each is an interface; production
 * implementations (Cloud KMS, Identity Platform, the email provider, a payment provider) are added when those are
 * set up. Until then the "unconfigured" ones refuse with 503, and local development can use fakes that only log.
 */
import { Logger, ServiceUnavailableException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';

/** One Cloud KMS key per tenant; it wraps the tenant's data keys, so destroying it makes the tenant's `_enc` data unreadable. */
export interface TenantKeyService {
  createKey(tenantSlug: string): Promise<string>;
  destroyKey(keyName: string): Promise<void>;
}

/** One Identity Platform tenant per Yutis tenant, holding its SSO and sign-in settings. */
export interface IdentityTenantService {
  createTenant(tenantSlug: string, displayName: string): Promise<string>;
  deleteTenant(idpTenantId: string): Promise<void>;
}

export interface Invitation {
  email: string;
  name: string;
  tenantName: string;
  /** e.g. https://acme.care.yutis.com.tw */
  tenantUrl: string;
}

/** Invitation email to a tenant's first admin. Contains no health data, only the sign-in link. */
export interface InvitationMailer {
  sendTenantAdminInvitation(invitation: Invitation): Promise<void>;
}

/**
 * The billing extension point (計費). The billing model is not decided, so the only implementation does nothing.
 * Choosing a payment provider means adding an implementation of this interface, without changing the tables.
 */
export interface BillingProvider {
  /** Create the customer at the payment provider; returns its reference for tenant_subscriptions.billing_ref, or null. */
  createCustomer(tenant: { id: string; slug: string; name: string }): Promise<string | null>;
  /** A subscription was created or changed (plan, status, seat limit, term). */
  subscriptionChanged(subscription: { tenantId: string; planCode: string; status: string; seatLimit: number | null }): Promise<void>;
  /** A notification from the payment provider. */
  handleWebhook(payload: unknown): Promise<void>;
}

export const TENANT_KEYS = Symbol('TENANT_KEYS');
export const IDENTITY_TENANTS = Symbol('IDENTITY_TENANTS');
export const INVITATIONS = Symbol('INVITATIONS');
export const BILLING = Symbol('BILLING');

export interface Integrations {
  keys: TenantKeyService;
  identityTenants: IdentityTenantService;
  invitations: InvitationMailer;
  billing: BillingProvider;
}

const unavailable = (what: string) => new ServiceUnavailableException({ code: 'integration_unavailable', message: `${what} is not configured` });

export class UnconfiguredTenantKeys implements TenantKeyService {
  async createKey(): Promise<string> { throw unavailable('Cloud KMS'); }
  async destroyKey(): Promise<void> { throw unavailable('Cloud KMS'); }
}

export class UnconfiguredIdentityTenants implements IdentityTenantService {
  async createTenant(): Promise<string> { throw unavailable('Identity Platform'); }
  async deleteTenant(): Promise<void> { throw unavailable('Identity Platform'); }
}

export class UnconfiguredInvitations implements InvitationMailer {
  async sendTenantAdminInvitation(): Promise<void> { throw unavailable('Email'); }
}

export class NoopBillingProvider implements BillingProvider {
  async createCustomer(): Promise<string | null> { return null; }
  async subscriptionChanged(): Promise<void> {}
  async handleWebhook(): Promise<void> {}
}

const fakeLog = new Logger('FakeIntegrations');

/** Local development only (PLATFORM_FAKE_INTEGRATIONS=true): pretend, and log what would have happened. */
export class FakeTenantKeys implements TenantKeyService {
  async createKey(slug: string) {
    const name = `projects/local/locations/asia-east1/keyRings/tenants/cryptoKeys/${slug}-${randomUUID().slice(0, 8)}`;
    fakeLog.log(`KMS key created: ${name}`);
    return name;
  }
  async destroyKey(name: string) { fakeLog.log(`KMS key destroyed: ${name}`); }
}

export class FakeIdentityTenants implements IdentityTenantService {
  async createTenant(slug: string) {
    const id = `${slug}-${randomUUID().slice(0, 8)}`;
    fakeLog.log(`Identity Platform tenant created: ${id}`);
    return id;
  }
  async deleteTenant(id: string) { fakeLog.log(`Identity Platform tenant deleted: ${id}`); }
}

export class FakeInvitations implements InvitationMailer {
  async sendTenantAdminInvitation(i: Invitation) { fakeLog.log(`Invitation for ${i.tenantName} sent to the new tenant admin: ${i.tenantUrl}`); }
}

export function defaultIntegrations(fake: boolean): Integrations {
  return fake
    ? { keys: new FakeTenantKeys(), identityTenants: new FakeIdentityTenants(), invitations: new FakeInvitations(), billing: new NoopBillingProvider() }
    : { keys: new UnconfiguredTenantKeys(), identityTenants: new UnconfiguredIdentityTenants(), invitations: new UnconfiguredInvitations(), billing: new NoopBillingProvider() };
}
