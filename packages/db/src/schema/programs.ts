/* The four statutory prevention programmes (四大計畫). Questionnaire answers are JSONB with a form version. */
import { boolean, date, index, integer, jsonb, numeric, pgTable, smallint, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { base, bytea, filledByEnum, matLevelEnum, retainUntil, surveyStatusEnum, tenantKey, tenantRef } from './common.js';
import { employees } from './employees.js';
import { departments, sites } from './org.js';
import { users } from './accounts.js';
import { healthExams } from './exams.js';

/* ---------- 人因性危害 (ergonomics) ---------- */

export const ergoDispatches = pgTable('ergo_dispatches', {
  ...base(),
  name: text('name').notNull(),
  sentOn: date('sent_on').notNull(),
  dueOn: date('due_on'),
}, t => [tenantKey(t)]);

export const ergoSurveys = pgTable('ergo_surveys', {
  ...base(),
  dispatchId: uuid('dispatch_id').notNull(),
  employeeId: uuid('employee_id').notNull(),
  status: surveyStatusEnum('status').notNull().default('未填寫'),
  lang: text('lang').notNull().default('zh'),
  formVersion: text('form_version').notNull(),
  /** NMQ part scores 0–5 plus the yes/no answers. */
  answers: jsonb('answers'),
  maxScore: smallint('max_score'),
  suspectedHazard: boolean('suspected_hazard'),
  filledAt: timestamp('filled_at', { withTimezone: true }),
  filledBy: filledByEnum('filled_by'),
  reminders: integer('reminders').notNull().default(0),
  lastRemindedAt: timestamp('last_reminded_at', { withTimezone: true }),
  retainUntil: retainUntil(),
}, t => [
  tenantKey(t),
  tenantRef('ergo_surveys_dispatch_fk', t, t.dispatchId, ergoDispatches),
  tenantRef('ergo_surveys_employee_fk', t, t.employeeId, employees),
  index('ergo_surveys_employee_idx').on(t.tenantId, t.employeeId),
]);

export const ergoInjuries = pgTable('ergo_injuries', {
  ...base(),
  employeeId: uuid('employee_id').notNull(),
  occurredOn: date('occurred_on').notNull(),
  bodyPart: text('body_part').notNull(),
  description: text('description'),
  leaveDays: numeric('leave_days'),
}, t => [tenantKey(t), tenantRef('ergo_injuries_employee_fk', t, t.employeeId, employees)]);

/** Improvement measures and tracking for a suspected-hazard survey (列管). */
export const ergoMeasures = pgTable('ergo_measures', {
  ...base(),
  surveyId: uuid('survey_id').notNull(),
  measures: text('measures').array().notNull().default([]),
  note: text('note'),
  trackedOn: date('tracked_on'),
  status: text('status', { enum: ['列管中', '解除列管'] }).notNull().default('列管中'),
}, t => [tenantKey(t), tenantRef('ergo_measures_survey_fk', t, t.surveyId, ergoSurveys)]);

/* ---------- 異常工作負荷 (overwork) ---------- */

export const workloadAssessments = pgTable('workload_assessments', {
  ...base(),
  employeeId: uuid('employee_id').notNull(),
  sentOn: date('sent_on').notNull(),
  /** Copenhagen Burnout Inventory answers { p: number[], w: number[] }. */
  cbiAnswers: jsonb('cbi_answers'),
  personalBurnout: numeric('personal_burnout'),
  workBurnout: numeric('work_burnout'),
  fatigueAt: timestamp('fatigue_at', { withTimezone: true }),
  fatigueBy: filledByEnum('fatigue_by'),
  overtime1m: numeric('overtime_1m'),
  overtime6mAvg: numeric('overtime_6m_avg'),
  workPatterns: text('work_patterns').array().notNull().default([]),
  overloadAt: timestamp('overload_at', { withTimezone: true }),
  /** Health check the CVD score was computed from. */
  examId: uuid('exam_id'),
  /** Snapshot of the computed CVD score, load level and matrix result, with the rule version used. */
  evaluation: jsonb('evaluation'),
  riskLevel: smallint('risk_level'),
  ruleVersion: text('rule_version'),
  retainUntil: retainUntil(),
}, t => [
  tenantKey(t),
  index('workload_assessments_employee_idx').on(t.tenantId, t.employeeId),
  tenantRef('workload_assessments_employee_fk', t, t.employeeId, employees),
  tenantRef('workload_assessments_exam_fk', t, t.examId, healthExams),
]);

/** Physician interview and health guidance (醫師面談、健康指導). */
export const interviews = pgTable('interviews', {
  ...base(),
  assessmentId: uuid('assessment_id').notNull(),
  status: text('status', { enum: ['待安排', '已安排', '已面談', '拒絕面談'] }).notNull().default('待安排'),
  interviewedOn: date('interviewed_on'),
  doctorUserId: uuid('doctor_user_id'),
  /** Structured findings and work-arrangement advice shown to HR (no clinical detail). */
  workAdvice: jsonb('work_advice'),
  notesEnc: bytea('notes_enc'),
  nextOn: date('next_on'),
}, t => [
  tenantKey(t),
  tenantRef('interviews_assessment_fk', t, t.assessmentId, workloadAssessments),
  tenantRef('interviews_doctor_fk', t, t.doctorUserId, users),
]);

/* ---------- 母性健康保護 (maternal protection) ---------- */

export const maternalEnvAssessments = pgTable('maternal_env_assessments', {
  ...base(),
  siteId: uuid('site_id').notNull(),
  departmentId: uuid('department_id'),
  area: text('area').notNull(),
  shiftType: text('shift_type'),
  assessedOn: date('assessed_on').notNull(),
  /** { 物理性危害: { v: '有'|'可能有影響'|'無', note } … } */
  hazards: jsonb('hazards').notNull(),
  level: matLevelEnum('level').notNull(),
}, t => [
  tenantKey(t),
  tenantRef('maternal_env_assessments_site_fk', t, t.siteId, sites),
  tenantRef('maternal_env_assessments_department_fk', t, t.departmentId, departments),
]);

export const maternalCases = pgTable('maternal_cases', {
  ...base(),
  employeeId: uuid('employee_id').notNull(),
  type: text('type', { enum: ['妊娠', '產後'] }).notNull(),
  notifiedOn: date('notified_on').notNull(),
  dueDate: date('due_date'),
  birthDate: date('birth_date'),
  envAssessmentId: uuid('env_assessment_id'),
  level: matLevelEnum('level'),
  /** Self-reported symptoms, risk factors and notes. */
  detailEnc: bytea('detail_enc'),
  retainUntil: retainUntil(),
}, t => [
  tenantKey(t),
  tenantRef('maternal_cases_employee_fk', t, t.employeeId, employees),
  tenantRef('maternal_cases_env_fk', t, t.envAssessmentId, maternalEnvAssessments),
]);

export const maternalInterviews = pgTable('maternal_interviews', {
  ...base(),
  caseId: uuid('case_id').notNull(),
  interviewedOn: date('interviewed_on').notNull(),
  staffUserId: uuid('staff_user_id'),
  fitAdvice: text('fit_advice'),
  limits: text('limits').array().notNull().default([]),
  agreedArrangement: text('agreed_arrangement'),
  notesEnc: bytea('notes_enc'),
}, t => [
  tenantKey(t),
  tenantRef('maternal_interviews_case_fk', t, t.caseId, maternalCases),
  tenantRef('maternal_interviews_staff_fk', t, t.staffUserId, users),
]);

/* ---------- 執行職務遭受不法侵害 (workplace violence) ---------- */

export const violenceRiskAssessments = pgTable('violence_risk_assessments', {
  ...base(),
  siteId: uuid('site_id').notNull(),
  departmentId: uuid('department_id'),
  assessedOn: date('assessed_on').notNull(),
  /** Per question: likelihood, severity, computed risk, controls. */
  items: jsonb('items').notNull(),
}, t => [
  tenantKey(t),
  tenantRef('violence_risk_assessments_site_fk', t, t.siteId, sites),
  tenantRef('violence_risk_assessments_department_fk', t, t.departmentId, departments),
]);

export const violenceChecklists = pgTable('violence_checklists', {
  ...base(),
  kind: text('kind', { enum: ['作業場所', '人力'] }).notNull(),
  siteId: uuid('site_id').notNull(),
  checkedOn: date('checked_on').notNull(),
  items: jsonb('items').notNull(),
}, t => [tenantKey(t), tenantRef('violence_checklists_site_fk', t, t.siteId, sites)]);

/** Incident reports. Visible to care staff only; an accused manager never sees the incident. */
export const violenceIncidents = pgTable('violence_incidents', {
  ...base(),
  occurredOn: date('occurred_on').notNull(),
  siteId: uuid('site_id').notNull(),
  type: text('type').notNull(),
  victimEmployeeId: uuid('victim_employee_id'),
  detailEnc: bytea('detail_enc'),
  followUps: text('follow_ups').array().notNull().default([]),
  status: text('status', { enum: ['處理中', '結案'] }).notNull().default('處理中'),
  retainUntil: retainUntil(),
}, t => [
  tenantKey(t),
  tenantRef('violence_incidents_site_fk', t, t.siteId, sites),
  tenantRef('violence_incidents_victim_fk', t, t.victimEmployeeId, employees),
]);

export const violenceReviews = pgTable('violence_reviews', {
  ...base(),
  reviewedOn: date('reviewed_on').notNull(),
  items: jsonb('items').notNull(),
}, t => [tenantKey(t)]);

/* ---------- notices to department managers ---------- */

/**
 * Work-arrangement advice sent to an employee's department manager (通知主管). A manager sees only the notices sent
 * to them, and only the advice text: never the clinical reasons behind it.
 */
export const managerNotices = pgTable('manager_notices', {
  ...base(),
  managerUserId: uuid('manager_user_id').notNull(),
  employeeId: uuid('employee_id').notNull(),
  /** What the advice came from, e.g. interviews / <id>, maternal_interviews / <id>. */
  subjectTable: text('subject_table').notNull(),
  subjectId: uuid('subject_id').notNull(),
  advice: text('advice').notNull(),
  readAt: timestamp('read_at', { withTimezone: true }),
}, t => [
  tenantKey(t),
  index('manager_notices_manager_idx').on(t.tenantId, t.managerUserId),
  tenantRef('manager_notices_manager_fk', t, t.managerUserId, users),
  tenantRef('manager_notices_employee_fk', t, t.employeeId, employees),
]);
