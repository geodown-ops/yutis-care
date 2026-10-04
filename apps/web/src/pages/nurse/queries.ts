/* Nurse workflow reads and writes: phrases, exam import, assistance records, case changes and follow-ups. */
import { queryOptions, useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { ApiRequestError, data, type Schemas, type TenantPaths } from '@yutis/api-client';
import { api } from '../../api';
import { employeeCaseQuery, employeeRecordsQuery } from '../../queries';
import { XLSX_MIME, type ImportReport } from './exams';
import type { CaseFollowOn, RecordBody } from './records';

export type CaseDetail = Schemas['EmployeeCaseDetailDto'];
export type CasePatch = TenantPaths['/api/cases/{id}']['patch']['requestBody']['content']['application/json'];

export const phrasesQuery = queryOptions({ queryKey: ['phrases'], queryFn: () => data(api.GET('/api/phrases')), staleTime: 10 * 60_000 });

export const examMappingsQuery = queryOptions({ queryKey: ['exams', 'mappings'], queryFn: () => data(api.GET('/api/exams/mappings')) });

/** Text for a failed action; the API's `message` is for developers, so this goes by status and code. */
export function actionErrorText(err: unknown): string {
  if (err instanceof ApiRequestError) {
    switch (err.code) {
      case 'outside_sites': return '這位員工不在你負責的廠區。';
      case 'invalid_transition': return '個案狀態已被變更，請重新整理後再試。';
      case 'unknown_staff': return '選擇的人員已停用，請改選其他人員。';
      case 'no_new_events': return '沒有新的異常事件可以開單。';
      case 'follow_up_date': return '選擇「追蹤」時，請填寫下次追蹤日期。';
      case 'mapping_not_found': return '找不到這個匯入對照，請重新選擇。';
      case 'invalid_file': return '無法讀取這個檔案，請確認是 Excel 活頁簿（.xlsx）。';
      case 'payload_too_large': return '檔案超過 10 MB，請分批匯入。';
      case 'validation_failed': return '有欄位格式不正確，請檢查後再試。';
    }
    if (err.status === 401) return '登入已逾時，請重新登入。';
    if (err.status === 403) return '你的角色不能執行這個動作。';
    if (err.status === 404) return '找不到這筆資料，可能已被刪除。';
  }
  return '暫時無法儲存，請稍後再試。';
}

/** Every view of cases: the list (home tiles, 個案管理, the menu badge) and each profile's case. */
const refreshCases = (qc: QueryClient) => Promise.all([
  qc.invalidateQueries({ queryKey: ['cases'] }),
  qc.invalidateQueries({ predicate: q => q.queryKey[0] === 'employees' && q.queryKey[2] === 'case' }),
]);

/** One employee's case changed: keep the returned detail and refresh the list. */
function caseChanged(qc: QueryClient, employeeId: string, detail: CaseDetail) {
  qc.setQueryData(employeeCaseQuery(employeeId).queryKey, detail);
  return qc.invalidateQueries({ queryKey: ['cases'] });
}

const openCase = (employeeId: string) => data(api.POST('/api/employees/{employeeId}/case/open', { params: { path: { employeeId } } }));
const patchCase = (id: string, body: CasePatch) => data(api.PATCH('/api/cases/{id}', { params: { path: { id } }, body }));

/** 開單, or add new events to the running case. */
export function useOpenCase() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (employeeId: string) => openCase(employeeId), onSuccess: (k, employeeId) => caseChanged(qc, employeeId, k) });
}

/** Status (處理中／結案), lead and dates of a case. */
export function useUpdateCase() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { employeeId: string; id: string; body: CasePatch }) => patchCase(id, body),
    onSuccess: (k, v) => caseChanged(qc, v.employeeId, k),
  });
}

/** Scans active employees for 未滿 18 歲／中高齡 and raises one 年齡關注 event each (idempotent). */
export function useAgeEvents() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: () => data(api.POST('/api/cases/age-events')), onSuccess: () => refreshCases(qc) });
}

export interface SaveRecord {
  employeeId: string;
  /** Edit this record; otherwise create one. */
  id?: string;
  body: RecordBody;
  /** Case steps to run after a final save (open, then 處理中 or 結案). */
  followOn?: CaseFollowOn | null;
  /** A follow-up this record answers: marked done after a final save. */
  completes?: string;
}

/**
 * Saves a record, then runs the case steps it implies. The record is saved first and stays saved when a later step
 * fails; that step's problem is returned so the form can say what is left to do.
 */
export function useSaveRecord() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ employeeId, id, body, followOn, completes }: SaveRecord) => {
      const record = id
        ? await data(api.PATCH('/api/records/{id}', { params: { path: { id } }, body }))
        : await data(api.POST('/api/records', { body: { ...body, employeeId } }));
      const later: string[] = [];
      if (!body.draft && completes && completes !== record.id) {
        await data(api.PATCH('/api/records/{id}', { params: { path: { id: completes } }, body: { followUpDone: true } }))
          .catch((e: unknown) => later.push(`原追蹤未標示完成：${actionErrorText(e)}`));
      }
      if (!body.draft && followOn) {
        try {
          let k = followOn.open ? await openCase(employeeId) : qc.getQueryData(employeeCaseQuery(employeeId).queryKey) ?? await data(api.GET('/api/employees/{employeeId}/case', { params: { path: { employeeId } } }));
          if (followOn.to && k.case) k = await patchCase(k.case.id, { status: followOn.to });
          qc.setQueryData(employeeCaseQuery(employeeId).queryKey, k);
        } catch (e) {
          later.push(`個案狀態未更新：${actionErrorText(e)}`);
        }
      }
      return { record, later };
    },
    onSettled: (_r, _e, v) => Promise.all([
      qc.invalidateQueries({ queryKey: employeeRecordsQuery(v.employeeId).queryKey }),
      qc.invalidateQueries({ queryKey: ['records'] }),
      ...(v.followOn && !v.body.draft ? [refreshCases(qc)] : []),
    ]),
  });
}

/** Complete or reschedule a follow-up (PATCH /api/records/{id}). */
export function useFollowUp() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ recordId, body }: { recordId: string; employeeId: string; body: { followUpDone?: boolean; followUpOn?: string } }) =>
      data(api.PATCH('/api/records/{id}', { params: { path: { id: recordId } }, body })),
    onSuccess: (_r, v) => Promise.all([
      qc.invalidateQueries({ queryKey: ['records'] }),
      qc.invalidateQueries({ queryKey: employeeRecordsQuery(v.employeeId).queryKey }),
    ]),
  });
}

/** Preview (commit=false) or import a clinic's .xlsx; a 422 still carries the report with the rows to fix. */
export function useExamImport() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ mapping, file, commit }: { mapping: string; file: File; commit: boolean }): Promise<ImportReport> => {
      try {
        return await data(api.POST('/api/exams/import', {
          params: { query: { mapping, commit: commit ? 'true' : 'false', fileName: file.name } },
          // The raw workbook is the body (the API reads it as a buffer).
          body: file as unknown as string,
          bodySerializer: b => b,
          headers: { 'Content-Type': XLSX_MIME },
        }));
      } catch (e) {
        const report = e instanceof ApiRequestError && e.code === 'import_invalid' ? (e.body as { report?: ImportReport } | undefined)?.report : undefined;
        if (report) return report;
        throw e;
      }
    },
    onSuccess: r => {
      if (!r.committed) return;
      // New exams, grades and abnormal events: cases, profiles and the grade report.
      return Promise.all([refreshCases(qc), qc.invalidateQueries({ queryKey: ['employees'] }), qc.invalidateQueries({ queryKey: ['reports'] })]);
    },
  });
}
