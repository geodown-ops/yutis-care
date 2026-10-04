import { ApiRequestError } from '@yutis/api-client';
import { problemText } from '../states';

/** Plain text for the codes the admin API returns on a refused change; anything else falls back to problemText. */
const BY_CODE: Record<string, string> = {
  duplicate: '代碼已被使用（同一廠區的部門名稱也不能重複）。',
  in_use: '還有資料使用中（例如廠區、部門、員工或負責人員），不能刪除。',
  account_exists: '這個 Email 已經有帳號。',
  cannot_change_self: '不能停用自己，也不能變更自己的角色。',
  last_tenant_admin: '租戶至少要保留一位啟用中的租戶管理員。',
  unknown_site: '有負責廠區已不存在，請重新整理後再選一次。',
  validation_failed: '有欄位格式不正確，請檢查後再送出。',
  not_draft: '這個版本已經發布或停用，不能再發布。',
  invalid_file: '讀不到這個檔案，請上傳 .xlsx 格式的 Excel 檔。',
  import_invalid: '檔案有錯誤，沒有匯入任何資料。請修正下列問題後重新上傳。',
  not_found: '找不到這筆資料，可能已被其他人刪除。請重新整理。',
  account_not_found: '找不到這個帳號，可能已被其他人變更。請重新整理。',
};

/** `overrides` replaces the text for codes that mean something narrower on one screen (e.g. duplicate). */
export function adminProblem(err: unknown, overrides: Record<string, string> = {}): string {
  if (err instanceof ApiRequestError) {
    const text = overrides[err.code] ?? BY_CODE[err.code];
    if (text) return text;
    if (err.status === 413) return '檔案太大，上限 10 MB。';
  }
  return problemText(err);
}

/** The report inside a 422 import_invalid response: the rows that stopped a committed import. */
export function refusedImportReport<T>(err: unknown): T | null {
  if (!(err instanceof ApiRequestError) || err.code !== 'import_invalid') return null;
  const report = (err.body as { report?: T } | undefined)?.report;
  return report ?? null;
}
