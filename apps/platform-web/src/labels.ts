/* Chinese labels for the platform API's enum values. Keyed by the generated types, so a new value fails typecheck here. */
import type { AnnouncementKind, PlatformRole, SubscriptionStatus, TemplateKind, TenantStatus, TrialApplicationStatus } from './api';

/** Badge colours: the --yutis-{tone} status tokens, plus neutral for states that need no attention. */
export type Tone = 'ok' | 'info' | 'warn' | 'bad' | 'neutral';

export interface Label { label: string; tone: Tone }

export const TENANT_STATUS: Record<TenantStatus, Label> = {
  active: { label: '啟用', tone: 'ok' },
  suspended: { label: '停用', tone: 'warn' },
  closed: { label: '已關閉', tone: 'neutral' },
};

export const SUBSCRIPTION_STATUS: Record<SubscriptionStatus, Label> = {
  trial: { label: '試用', tone: 'info' },
  active: { label: '正式', tone: 'ok' },
  past_due: { label: '逾期未付', tone: 'bad' },
  cancelled: { label: '已取消', tone: 'neutral' },
};

/** Order for pickers. */
export const SUBSCRIPTION_STATUSES = Object.keys(SUBSCRIPTION_STATUS) as SubscriptionStatus[];

export const ANNOUNCEMENT_KIND: Record<AnnouncementKind, Label> = {
  maintenance: { label: '系統維護', tone: 'warn' },
  feature: { label: '新功能', tone: 'info' },
  notice: { label: '一般公告', tone: 'neutral' },
};

export const ANNOUNCEMENT_KINDS = Object.keys(ANNOUNCEMENT_KIND) as AnnouncementKind[];

export const TEMPLATE_KIND: Record<TemplateKind, { label: string; description: string }> = {
  grading_rules: { label: '健檢分級規則', description: '健檢各項目的 1 至 4 級判定標準' },
  phrases: { label: '片語庫', description: '健康諮詢、處理狀況、臨場服務、不法侵害與母性評估的常用片語' },
  sign_off_roles: { label: '簽核角色', description: '紀錄簽核欄位可選的職稱，例如醫師、護理人員、職安衛人員' },
  survey_versions: { label: '問卷版本', description: 'NMQ、過勞量表、異常工作負荷、母性保護與不法侵害問卷的版本' },
};

export const PLATFORM_ROLES = ['營運', '客服', '工程'] as const satisfies readonly PlatformRole[];

/**
 * What each platform role may do, as the platform API enforces it (apps/platform-api/src/auth/permissions.ts, a first
 * proposal Yutis has yet to confirm). Shown next to the role picker; the API remains the authority.
 */
export const PLATFORM_ROLE_SUMMARY: Record<PlatformRole, string> = {
  營運: '開通、停用租戶，設定方案與訂閱，發布公告與預設範本',
  客服: '查看租戶狀態，發布公告；進入租戶需該租戶管理員授權',
  工程: '查看租戶狀態，發布預設範本，管理平台帳號',
};

export const TRIAL_APPLICATION_STATUS: Record<TrialApplicationStatus, Label> = {
  pending: { label: '待審核', tone: 'warn' },
  approved: { label: '已開通', tone: 'ok' },
  declined: { label: '已婉拒', tone: 'neutral' },
};
