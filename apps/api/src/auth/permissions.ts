/*
 * Who may see what (架構文件「驗證與權限」). Access needs all three: the role allows the data category, the
 * employee is in a site the person is responsible for (see site-access.ts), and the route's feature is the
 * role's. Core rule: medical detail stays with the occupational health staff; HR and managers only get the
 * work-arrangement conclusions they need to act on.
 */
import type { StaffRole } from '../core/context.js';

/** Data sensitivity tiers, also recorded in audit_log.data_category. */
export const DATA_CATEGORIES = [
  /** 身分與組織資料: name, employee number, site, department, contact details. */
  'identity',
  /** 工作安排建議、追蹤狀態: work-arrangement recommendations and follow-up status. */
  'work',
  /** 健檢數值、分級、問卷分數: exam values, grades, questionnaire scores. */
  'health',
  /** 診斷、病史、面談內文、妊娠、不法侵害事件: diagnoses, history, interview notes, pregnancy, violence incidents. */
  'medical',
] as const;
export type DataCategory = (typeof DATA_CATEGORIES)[number];

/** Areas of the back office. The frontend hides menus with these; the API enforces them per route. */
export const FEATURES = [
  /** 職護首頁: to-dos, calendar, abnormal-result follow-up. */
  'nurse-home',
  /** 員工資料、個人首頁、協助紀錄 */
  'employees',
  /** 個案管理 */
  'cases',
  /** 人因、異常工作負荷、母性、不法侵害 */
  'programs',
  /** 勞工健康服務（附表八）與簽核 */
  'service-records',
  /** 統計報表 */
  'reports',
  /** 租戶管理: company profile, sign-in settings, organisation, employee import, accounts, rules, audit search. */
  'tenant-admin',
] as const;
export type Feature = (typeof FEATURES)[number];

interface RoleAccess {
  data: readonly DataCategory[];
  features: readonly Feature[];
}

const clinical: RoleAccess = {
  data: ['identity', 'work', 'health', 'medical'],
  features: ['nurse-home', 'employees', 'cases', 'programs', 'service-records', 'reports'],
};

/**
 * Upper bounds per role. Finer limits are applied where the records are read: 職安衛人員 and 人資 get
 * de-identified statistics only (no cell under 5 people); 部門主管 sees identity data of their own department
 * and only the work recommendations addressed to them, and never a violence incident in which they are the
 * alleged perpetrator; 租戶管理員 manages settings, accounts and the employee master but no health data.
 */
export const ROLE_ACCESS: Record<StaffRole, RoleAccess> = {
  職醫: clinical,
  職護: clinical,
  職安衛人員: { data: ['identity', 'work'], features: ['programs', 'service-records', 'reports'] },
  人資: { data: ['identity', 'work'], features: ['employees', 'programs', 'service-records', 'reports'] },
  部門主管: { data: ['identity', 'work'], features: ['programs', 'service-records'] },
  租戶管理員: { data: ['identity'], features: ['tenant-admin'] },
};

export const canSee = (role: StaffRole, data: DataCategory) => ROLE_ACCESS[role].data.includes(data);
export const canUse = (role: StaffRole, feature: Feature) => ROLE_ACCESS[role].features.includes(feature);
