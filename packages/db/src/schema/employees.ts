/* Employee master (員工主檔). */
import { date, pgTable, text, unique, uuid } from 'drizzle-orm/pg-core';
import { base, sexEnum, tenantKey, tenantRef } from './common.js';
import { departments, legalEntities, sites } from './org.js';

export const employees = pgTable('employees', {
  ...base(),
  empNo: text('emp_no').notNull(),
  name: text('name').notNull(),
  sex: sexEnum('sex').notNull(),
  birthDate: date('birth_date').notNull(),
  /** HMAC of the national ID for matching imports; the ID itself is never stored. */
  nationalIdHash: text('national_id_hash'),
  legalEntityId: uuid('legal_entity_id').notNull(),
  siteId: uuid('site_id').notNull(),
  departmentId: uuid('department_id').notNull(),
  title: text('title'),
  shift: text('shift'),
  /** Health-check category, e.g. 一般 or a special-hazard class (T1類…). */
  examCategory: text('exam_category'),
  specialOperations: text('special_operations').array().notNull().default([]),
  /** Employee-portal language: zh, en, ja, vi, th. */
  lang: text('lang').notNull().default('zh'),
  hireDate: date('hire_date'),
  email: text('email'),
  phone: text('phone'),
  status: text('status', { enum: ['在職', '留停', '離職'] }).notNull().default('在職'),
}, t => [
  tenantKey(t),
  unique().on(t.tenantId, t.empNo),
  tenantRef('employees_legal_entity_fk', t, t.legalEntityId, legalEntities),
  tenantRef('employees_site_fk', t, t.siteId, sites),
  tenantRef('employees_department_fk', t, t.departmentId, departments),
]);
