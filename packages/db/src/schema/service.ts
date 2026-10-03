/* 勞工健康服務執行紀錄表 (附表八), e-signatures, employee confirmations, consents, attachments, notifications. */
import { bigint, date, jsonb, pgTable, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';
import { base, tenantKey, tenantRef } from './common.js';
import { employees } from './employees.js';
import { sites } from './org.js';

export const serviceRecords = pgTable('service_records', {
  ...base(),
  serviceOn: date('service_on').notNull(),
  siteId: uuid('site_id').notNull(),
  /** Form content: staff present, work done, findings, recommendations. */
  content: jsonb('content').notNull(),
  status: text('status', { enum: ['草稿', '簽核中', '已完成'] }).notNull().default('草稿'),
}, t => [tenantKey(t), tenantRef('service_records_site_fk', t, t.siteId, sites)]);

/**
 * Email sign-off on any record (附表八, maternal environment assessment…). The emailed link carries a one-time
 * token; only its hash is stored.
 */
export const signatures = pgTable('signatures', {
  ...base(),
  subjectTable: text('subject_table').notNull(),
  subjectId: uuid('subject_id').notNull(),
  signerRole: text('signer_role').notNull(),
  signerName: text('signer_name').notNull(),
  signerEmail: text('signer_email').notNull(),
  tokenHash: text('token_hash'),
  tokenExpiresAt: timestamp('token_expires_at', { withTimezone: true }),
  firstSentAt: timestamp('first_sent_at', { withTimezone: true }),
  lastSentAt: timestamp('last_sent_at', { withTimezone: true }),
  signedAt: timestamp('signed_at', { withTimezone: true }),
  comment: text('comment'),
}, t => [tenantKey(t), unique().on(t.tokenHash)]);

/** An employee confirming a record about them, e.g. a maternal interview (員工 Email 確認). */
export const employeeAcknowledgements = pgTable('employee_acknowledgements', {
  ...base(),
  employeeId: uuid('employee_id').notNull(),
  subjectTable: text('subject_table').notNull(),
  subjectId: uuid('subject_id').notNull(),
  tokenHash: text('token_hash'),
  tokenExpiresAt: timestamp('token_expires_at', { withTimezone: true }),
  sentAt: timestamp('sent_at', { withTimezone: true }),
  confirmedAt: timestamp('confirmed_at', { withTimezone: true }),
  comment: text('comment'),
}, t => [tenantKey(t), unique().on(t.tokenHash), tenantRef('employee_acknowledgements_employee_fk', t, t.employeeId, employees)]);

/**
 * Privacy notices shown (個資法告知) and consents for non-statutory uses. Statutory health management needs no
 * consent; anything beyond it (e.g. health promotion) does.
 */
export const consents = pgTable('consents', {
  ...base(),
  employeeId: uuid('employee_id').notNull(),
  kind: text('kind', { enum: ['notice', 'consent'] }).notNull(),
  purpose: text('purpose').notNull(),
  documentVersion: text('document_version').notNull(),
  givenAt: timestamp('given_at', { withTimezone: true }).notNull(),
  withdrawnAt: timestamp('withdrawn_at', { withTimezone: true }),
}, t => [tenantKey(t), tenantRef('consents_employee_fk', t, t.employeeId, employees)]);

/** Files live in Cloud Storage (private bucket, CMEK); rows hold the key and checksum only. */
export const attachments = pgTable('attachments', {
  ...base(),
  subjectTable: text('subject_table').notNull(),
  subjectId: uuid('subject_id').notNull(),
  storageKey: text('storage_key').notNull(),
  fileName: text('file_name').notNull(),
  mimeType: text('mime_type').notNull(),
  sizeBytes: bigint('size_bytes', { mode: 'number' }).notNull(),
  sha256: text('sha256').notNull(),
}, t => [tenantKey(t)]);

/** Outgoing email. Templates never include health content, only a link to sign in. */
export const notifications = pgTable('notifications', {
  ...base(),
  recipientEmail: text('recipient_email').notNull(),
  template: text('template').notNull(),
  params: jsonb('params').notNull().default({}),
  status: text('status', { enum: ['queued', 'sent', 'failed'] }).notNull().default('queued'),
  sentAt: timestamp('sent_at', { withTimezone: true }),
  error: text('error'),
}, t => [tenantKey(t)]);
