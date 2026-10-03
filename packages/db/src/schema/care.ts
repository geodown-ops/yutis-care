/* Assistance records (協助紀錄), phrases, and case management (個案管理). */
import { boolean, date, index, jsonb, pgTable, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';
import { base, bytea, caseStatusEnum, eventTypeEnum, retainUntil, tenantKey, tenantRef } from './common.js';
import { employees } from './employees.js';
import { users } from './accounts.js';

export const phrases = pgTable('phrases', {
  ...base(),
  category: text('category').notNull(),
  text: text('text').notNull(),
  /** For measures (不法侵害－措施): 改善 = should add or improve, 建議 = may adopt. */
  kind: text('kind', { enum: ['改善', '建議'] }),
}, t => [tenantKey(t)]);

export const assistRecords = pgTable('assist_records', {
  ...base(),
  employeeId: uuid('employee_id').notNull(),
  category: text('category').notNull(),
  occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull(),
  consultTypes: text('consult_types').array().notNull().default([]),
  lifestyleAdvice: text('lifestyle_advice').array().notNull().default([]),
  /** Explanation, handling and notes (說明、處置、備註). */
  contentEnc: bytea('content_enc'),
  /** [{ userId, minutes }] — staff time spent, for 附表八 statistics. */
  helpers: jsonb('helpers').notNull().default([]),
  result: text('result', { enum: ['追蹤', '結案'] }).notNull(),
  followUpOn: date('follow_up_on'),
  followUpUserId: uuid('follow_up_user_id'),
  followUpDone: boolean('follow_up_done').notNull().default(false),
  draft: boolean('draft').notNull().default(false),
  retainUntil: retainUntil(),
}, t => [
  tenantKey(t),
  index('assist_records_employee_idx').on(t.tenantId, t.employeeId, t.occurredAt),
  tenantRef('assist_records_employee_fk', t, t.employeeId, employees),
  tenantRef('assist_records_follow_up_user_fk', t, t.followUpUserId, users),
]);

/** One open case per employee at a time; a closed case reopens as 未開單 when a new event arrives. */
export const cases = pgTable('cases', {
  ...base(),
  employeeId: uuid('employee_id').notNull(),
  status: caseStatusEnum('status').notNull().default('起單'),
  leadUserId: uuid('lead_user_id'),
  openedOn: date('opened_on').notNull(),
  noticeOn: date('notice_on'),
  plannedOn: date('planned_on'),
  repliedOn: date('replied_on'),
  agreed: boolean('agreed'),
  closedOn: date('closed_on'),
}, t => [
  tenantKey(t),
  tenantRef('cases_employee_fk', t, t.employeeId, employees),
  tenantRef('cases_lead_user_fk', t, t.leadUserId, users),
]);

/** Abnormal events detected by the rules (health check 3–4, overwork, NMQ ≥ 3, maternal, age, special check). */
export const caseEvents = pgTable('case_events', {
  ...base(),
  employeeId: uuid('employee_id').notNull(),
  caseId: uuid('case_id'),
  type: eventTypeEnum('type').notNull(),
  /** Table and row that raised the event, e.g. health_exams / <id>. Unique so re-running detection is idempotent. */
  sourceTable: text('source_table').notNull(),
  sourceId: uuid('source_id').notNull(),
  occurredOn: date('occurred_on').notNull(),
  description: text('description').notNull(),
  status: caseStatusEnum('status').notNull().default('未開單'),
}, t => [
  tenantKey(t),
  unique().on(t.tenantId, t.sourceTable, t.sourceId, t.type),
  index('case_events_employee_idx').on(t.tenantId, t.employeeId),
  tenantRef('case_events_employee_fk', t, t.employeeId, employees),
  tenantRef('case_events_case_fk', t, t.caseId, cases),
]);

export const eventStatusHistory = pgTable('event_status_history', {
  ...base(),
  eventId: uuid('event_id').notNull(),
  fromStatus: caseStatusEnum('from_status'),
  toStatus: caseStatusEnum('to_status').notNull(),
  note: text('note'),
}, t => [tenantKey(t), tenantRef('event_status_history_event_fk', t, t.eventId, caseEvents)]);
