/*
 * Services outside the database that tenant onboarding and billing depend on. Each is an interface; production
 * implementations (Cloud KMS, Identity Platform, the email provider, a payment provider) are added when those are
 * set up. Until then the "unconfigured" ones refuse with 503, and local development can use fakes that only log.
 */
import { Logger, ServiceUnavailableException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { PlatformConfig } from '../config.js';
import { CloudKmsTenantKeys, GoogleApi, IdentityPlatformInvitations, IdentityPlatformTenants, googleTokenSource } from './gcp.js';
import { createPaymentGateway, type PaymentGateway } from './tappay.js';

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
  /** The tenant's Identity Platform tenant, which the sign-in link belongs to. */
  idpTenantId: string;
}

/** Invitation email to a tenant's first admin. Contains no health data, only the sign-in link. */
export interface InvitationMailer {
  sendTenantAdminInvitation(invitation: Invitation): Promise<void>;
}

/**
 * The billing extension point (計費). Told about every customer and subscription change, including the periods that
 * paid payment orders add (payments/payments.service.ts). Card payments themselves go through PaymentGateway
 * (tappay.ts): TapPay Direct Pay charges once per order and keeps no customer, so this stays the no-op until a
 * provider with customers or recurring billing is chosen.
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
  payments: PaymentGateway;
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

export function defaultIntegrations(config: Pick<PlatformConfig, 'fakeIntegrations' | 'gcp' | 'tenantBaseDomain' | 'tappay'>): Integrations {
  // TapPay has a sandbox, so card payments are the real thing (or absent) even in local development.
  const payments = createPaymentGateway(config.tappay);
  if (config.fakeIntegrations) {
    return { keys: new FakeTenantKeys(), identityTenants: new FakeIdentityTenants(), invitations: new FakeInvitations(), billing: new NoopBillingProvider(), payments };
  }
  if (config.gcp) {
    const api = new GoogleApi(googleTokenSource());
    return {
      keys: new CloudKmsTenantKeys(api, config.gcp.kmsKeyRing),
      identityTenants: new IdentityPlatformTenants(api, config.gcp.projectId, config.tenantBaseDomain),
      invitations: new IdentityPlatformInvitations(api, config.gcp.projectId),
      billing: new NoopBillingProvider(),
      payments,
    };
  }
  return { keys: new UnconfiguredTenantKeys(), identityTenants: new UnconfiguredIdentityTenants(), invitations: new UnconfiguredInvitations(), billing: new NoopBillingProvider(), payments };
}
