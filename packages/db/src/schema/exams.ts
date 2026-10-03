/* Health checks (健檢) and versioned grading rules (分級標準). */
import { boolean, date, index, integer, jsonb, numeric, pgTable, smallint, text, unique, uuid } from 'drizzle-orm/pg-core';
import { base, bytea, retainUntil, tenantKey, tenantRef } from './common.js';
import { employees } from './employees.js';

/** A rule set is immutable once published; editing creates the next version. Each tenant starts from the platform default. */
export const gradingRuleSets = pgTable('grading_rule_sets', {
  ...base(),
  version: integer('version').notNull(),
  status: text('status', { enum: ['draft', 'published', 'retired'] }).notNull().default('draft'),
  effectiveFrom: date('effective_from'),
  note: text('note'),
}, t => [tenantKey(t), unique().on(t.tenantId, t.version)]);

export const gradingRules = pgTable('grading_rules', {
  ...base(),
  ruleSetId: uuid('rule_set_id').notNull(),
  itemCode: text('item_code').notNull(),
  name: text('name').notNull(),
  sex: text('sex', { enum: ['男', '女', '不限'] }).notNull(),
  unit: text('unit').notNull().default(''),
  valueType: text('value_type', { enum: ['number', 'text'] }).notNull().default('number'),
  /** Same shape as @yutis/domain GradingRule.levels. */
  levels: jsonb('levels').notNull(),
  /** 'demo' marks illustrative thresholds still awaiting physician confirmation. */
  source: text('source', { enum: ['manual', 'demo', 'physician'] }).notNull(),
}, t => [tenantKey(t), tenantRef('grading_rules_rule_set_fk', t, t.ruleSetId, gradingRuleSets)]);

/**
 * How one clinic's Excel export maps to Yutis fields and exam item codes (健檢匯入對照), set up by tenant admins.
 * `mapping` is { columns: { empNo?, nationalId?, examDate, kind?, smoker?, history?, symptoms?, workNote?, specialHazard?, specialLevel? }, items: { [itemCode]: header } }.
 */
export const examImportMappings = pgTable('exam_import_mappings', {
  ...base(),
  clinic: text('clinic').notNull(),
  mapping: jsonb('mapping').notNull(),
}, t => [tenantKey(t), unique().on(t.tenantId, t.clinic)]);

/** One clinic file import (匯入批次). */
export const examBatches = pgTable('exam_batches', {
  ...base(),
  clinic: text('clinic').notNull(),
  fileName: text('file_name'),
  /** Column mapping from the clinic's file to item codes. */
  mapping: jsonb('mapping'),
  rowCount: integer('row_count'),
  status: text('status', { enum: ['uploaded', 'validated', 'imported', 'failed'] }).notNull().default('uploaded'),
}, t => [tenantKey(t)]);

export const healthExams = pgTable('health_exams', {
  ...base(),
  employeeId: uuid('employee_id').notNull(),
  batchId: uuid('batch_id'),
  examDate: date('exam_date').notNull(),
  clinic: text('clinic'),
  kind: text('kind').notNull(),
  /** Rule set used for the stored grades, so a past result can always be explained. */
  ruleSetId: uuid('rule_set_id').notNull(),
  gradeTotal: integer('grade_total').notNull(),
  gradeMax: smallint('grade_max').notNull(),
  specialHazard: text('special_hazard'),
  specialLevel: smallint('special_level'),
  smoker: boolean('smoker'),
  /** Lifestyle answers (drinking, betel nut, sleep hours). */
  lifestyle: jsonb('lifestyle'),
  historyEnc: bytea('history_enc'),
  symptomsEnc: bytea('symptoms_enc'),
  workNoteEnc: bytea('work_note_enc'),
  retainUntil: retainUntil(),
}, t => [
  tenantKey(t),
  unique('health_exams_one_per_day').on(t.tenantId, t.employeeId, t.examDate, t.kind),
  index('health_exams_employee_idx').on(t.tenantId, t.employeeId, t.examDate),
  tenantRef('health_exams_employee_fk', t, t.employeeId, employees),
  tenantRef('health_exams_batch_fk', t, t.batchId, examBatches),
  tenantRef('health_exams_rule_set_fk', t, t.ruleSetId, gradingRuleSets),
]);

export const healthExamResults = pgTable('health_exam_results', {
  ...base(),
  examId: uuid('exam_id').notNull(),
  itemCode: text('item_code').notNull(),
  valueNum: numeric('value_num'),
  valueText: text('value_text'),
  grade: smallint('grade'),
}, t => [
  tenantKey(t),
  unique().on(t.tenantId, t.examId, t.itemCode),
  tenantRef('health_exam_results_exam_fk', t, t.examId, healthExams),
]);
