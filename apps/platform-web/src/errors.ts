/*
 * Platform API errors in plain Chinese. The API's `message` is for developers and is never shown; the text comes from
 * the error `code` (see the controllers in apps/platform-api), then from the HTTP status.
 */
import { ApiRequestError } from '@yutis/api-client';

const BY_CODE: Record<string, string> = {
  unauthorized: '登入已逾時，請重新整理頁面再試一次。',
  not_platform_user: '這個帳號不是啟用中的平台人員，請聯絡工程同仁開通。',
  forbidden: '你的平台角色沒有權限執行這個操作。',
  validation_failed: '有欄位不符合格式，請檢查後再送出。',
  tenant_not_found: '找不到這個租戶。',
  tenant_status: '租戶狀態已經變更，請重新整理後再試。',
  subdomain_taken: '這個子網域已經有租戶使用，請換一個。',
  trial_application_decided: '這件申請已經有人處理過了，請重新整理。',
  trial_application_not_found: '找不到這件試用申請，可能已被刪除。',
  invalid_subdomain: '子網域只能使用小寫英文字母、數字和連字號，且不能是平台保留的名稱。',
  unknown_plan: '找不到這個方案，或方案已停用，請重新選擇。',
  templates_missing: '還沒有可用的預設範本，請先到「預設範本」更新範本後再開通。',
  integration_unavailable: '金鑰、登入或郵件服務尚未設定完成，暫時無法開通租戶。',
  plan_exists: '這個方案代碼已經存在。',
  plan_not_found: '找不到這個方案，可能已被刪除。',
  period_overlap: '新的一期要晚於最近一期的開始日，請調整開始日。',
  announcement_not_found: '找不到這則公告，可能已被刪除。',
  platform_user_exists: '這個 Email 已經是平台人員。',
  platform_user_not_found: '找不到這位平台人員。',
  cannot_change_self: '不能停用自己的帳號或變更自己的角色。',
  too_many_requests: '操作太頻繁，請稍候再試。',
  tenant_closed: '這個租戶已結束，不能再建立付款單。',
  payment_order_not_found: '找不到這張付款單。',
  payment_order_closed: '這張付款單已經付款或取消，請重新整理。',
  payment_in_progress: '付款人正在刷卡付款，請稍候再試。',
};

const BY_STATUS: Record<number, string> = {
  400: '資料格式不正確，請檢查後再試。',
  404: '找不到這筆資料，可能已被刪除。',
  409: '資料已經被其他人變更，請重新整理後再試。',
};

export function errorMessage(error: unknown): string {
  if (error instanceof ApiRequestError) {
    return BY_CODE[error.code] ?? BY_STATUS[error.status] ?? (error.status >= 500 ? '平台 API 暫時無法使用，請稍後再試。' : '操作沒有成功，請稍後再試。');
  }
  // fetch rejects with a TypeError when the request never reaches the server.
  if (error instanceof TypeError) return '無法連線到平台 API，請檢查網路後再試。';
  return '發生未預期的錯誤，請重新整理頁面再試一次。';
}

/** The API refused because of the caller's platform role (not because they are signed out or not staff). */
export const isForbidden = (error: unknown) => error instanceof ApiRequestError && error.status === 403 && error.code === 'forbidden';

/** A tenant id that does not exist, or is not even a UUID (the API answers 400 for those). */
export const isMissingTenant = (error: unknown) =>
  error instanceof ApiRequestError && (error.code === 'tenant_not_found' || error.status === 404 || error.status === 400);
