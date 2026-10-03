/* Organisation (組織): legal entity → site (廠／院區) → department. */
import { pgTable, text, uuid } from 'drizzle-orm/pg-core';
import { base, tenantKey, tenantRef } from './common.js';

export const legalEntities = pgTable('legal_entities', {
  ...base(),
  code: text('code').notNull(),
  name: text('name').notNull(),
}, t => [tenantKey(t)]);

export const sites = pgTable('sites', {
  ...base(),
  legalEntityId: uuid('legal_entity_id').notNull(),
  code: text('code').notNull(),
  name: text('name').notNull(),
  address: text('address'),
}, t => [tenantKey(t), tenantRef('sites_legal_entity_fk', t, t.legalEntityId, legalEntities)]);

export const departments = pgTable('departments', {
  ...base(),
  siteId: uuid('site_id').notNull(),
  code: text('code'),
  name: text('name').notNull(),
  managerName: text('manager_name'),
  managerEmail: text('manager_email'),
  managerPhone: text('manager_phone'),
}, t => [tenantKey(t), tenantRef('departments_site_fk', t, t.siteId, sites)]);
