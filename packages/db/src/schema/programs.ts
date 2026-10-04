/* The four statutory prevention programmes (四大計畫). Questionnaire answers are JSONB with a form version. */
import { boolean, date, index, integer, jsonb, numeric, pgTable, smallint, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';
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
  /** 管控追蹤 for a suspected hazard: { measures, note, nextOn, status: 列管中 | 已改善 | 解除列管 }. */
  tracking: jsonb('tracking'),
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
  reminders: integer('reminders').notNull().default(0),
  lastRemindedAt: timestamp('last_reminded_at', { withTimezone: true }),
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
  /** 面談指導結果 (fatigue, mental-health concern, diagnosis and guidance classes, remarks) as encrypted JSON. */
  guidanceEnc: bytea('guidance_enc'),
  notesEnc: bytea('notes_enc'),
  /** 是否安排下次面談; null until answered. */
  nextInterview: boolean('next_interview'),
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
  departmentId: uuid('department_id'),
  checkedOn: date('checked_on').notNull(),
  items: jsonb('items').notNull(),
}, t => [
  tenantKey(t),
  tenantRef('violence_checklists_site_fk', t, t.siteId, sites),
  tenantRef('violence_checklists_department_fk', t, t.departmentId, departments),
]);

/** Incident reports. Visible to care staff only; an accused manager never sees the incident. */
export const violenceIncidents = pgTable('violence_incidents', {
  ...base(),
  occurredOn: date('occurred_on').notNull(),
  /** HH:MM, Taiwan time. */
  occurredTime: text('occurred_time'),
  siteId: uuid('site_id').notNull(),
  departmentId: uuid('department_id'),
  place: text('place'),
  type: text('type').notNull(),
  victimEmployeeId: uuid('victim_employee_id'),
  victimKind: text('victim_kind', { enum: ['內部人員', '外部人員'] }),
  perpetratorKind: text('perpetrator_kind', { enum: ['內部人員', '外部人員'] }),
  /** Names, relationship, what happened and how it was handled. */
  detailEnc: bytea('detail_enc'),
  followUps: text('follow_ups').array().notNull().default([]),
  status: text('status', { enum: ['處理中', '結案'] }).notNull().default('處理中'),
  retainUntil: retainUntil(),
}, t => [
  tenantKey(t),
  tenantRef('violence_incidents_site_fk', t, t.siteId, sites),
  tenantRef('violence_incidents_department_fk', t, t.departmentId, departments),
  tenantRef('violence_incidents_victim_fk', t, t.victimEmployeeId, employees),
]);

/** 預防措施查核及評估: a periodic review of the prevention measures, signed off like 附表八 (signatures). */
export const violenceReviews = pgTable('violence_reviews', {
  ...base(),
  siteId: uuid('site_id').notNull(),
  departmentId: uuid('department_id'),
  reviewedOn: date('reviewed_on').notNull(),
  /** Per review item: checked points, result, corrective measures. */
  items: jsonb('items').notNull(),
  status: text('status', { enum: ['草稿', '簽核中', '已完成'] }).notNull().default('草稿'),
}, t => [
  tenantKey(t),
  tenantRef('violence_reviews_site_fk', t, t.siteId, sites),
  tenantRef('violence_reviews_department_fk', t, t.departmentId, departments),
]);

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

/* ---------- 員工端草稿 (employee portal drafts) ---------- */

/**
 * Answers an employee has started but not yet submitted, one per questionnaire, so a long questionnaire survives the
 * session's idle timeout. Only the employee's own portal routes read them; submitting the questionnaire, by the employee
 * or by a nurse, deletes the draft.
 */
export const portalDrafts = pgTable('portal_drafts', {
  ...base(),
  employeeId: uuid('employee_id').notNull(),
  /** nmq → ergo_surveys, cbi and overload → workload_assessments. */
  taskKind: text('task_kind', { enum: ['nmq', 'cbi', 'overload'] }).notNull(),
  taskId: uuid('task_id').notNull(),
  answers: jsonb('answers').notNull(),
}, t => [
  tenantKey(t),
  unique('portal_drafts_task_key').on(t.tenantId, t.employeeId, t.taskKind, t.taskId),
  tenantRef('portal_drafts_employee_fk', t, t.employeeId, employees),
]);
