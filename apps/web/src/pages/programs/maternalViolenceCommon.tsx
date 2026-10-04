/* Shared by the maternal and violence programme pages: who may do what, sites, people and form bits. */
import { Badge, Select, Stack, Text, TextInput, type ModalProps, type TextInputProps } from '@mantine/core';
import { useDebouncedValue, useMediaQuery } from '@mantine/hooks';
import { useQuery } from '@tanstack/react-query';
import { ApiRequestError, data, type Schemas } from '@yutis/api-client';
import { useState, type ReactNode } from 'react';
import { api } from '../../api';
import { AnchorLink } from '../../links';
import { canAccess, type Access } from '../../nav';
import { useMe } from '../../session';
import { problemText } from '../states';
import { orgQuery } from './directory';
import { siteDepartments, treeNames } from './lists';

/* Mirrors the route decorators in apps/api/src/programs (maternal-violence.controller.ts, advice.controller.ts). */
/** Maternal cases, interviews and violence incidents (@Clinical). */
export const CLINICAL_ACCESS: Access = { feature: 'programs', data: 'health', roles: ['職護', '職醫'] };
/** Maternal environment assessments, violence risk assessments and checklists (ENVIRONMENT_ROLES). */
export const ENVIRONMENT_ACCESS: Access = { feature: 'programs', roles: ['職護', '職醫', '職安衛人員'] };
/** Work-arrangement advice without clinical detail (ADVICE_ROLES). */
export const ADVICE_ACCESS: Access = { feature: 'programs', data: 'work', roles: ['職護', '職醫', '人資'] };

export type Tone = 'ok' | 'warn' | 'bad' | 'info';
type Employee = Schemas['EmployeeDto'];

export const dt = (iso: string | null | undefined) => (iso ? iso.slice(0, 10).replaceAll('-', '/') : '—');

/** My sites plus sites with active break-glass access, which is what the list endpoints cover. */
export function useMySites() {
  const me = useMe();
  return [...me.sites, ...me.breakGlassSites.filter(b => !me.sites.some(s => s.id === b.id))];
}

export function useSiteName() {
  const sites = useMySites();
  return (id: string) => sites.find(s => s.id === id)?.name ?? '—';
}

/** Site and department names by id from the organisation tree (GET /api/org); my sites' names while it loads. */
export function useOrgNames() {
  const org = useQuery(orgQuery);
  const siteName = useSiteName();
  const tree = treeNames(org.data ?? []);
  return { ...tree, site: (id: string) => (tree.site(id) === '—' ? siteName(id) : tree.site(id)) };
}

export function ToneBadge({ tone, children }: { tone: Tone; children: ReactNode }) {
  return <Badge styles={{ root: { background: `var(--yutis-${tone}-weak)`, color: `var(--yutis-${tone})`, textTransform: 'none', fontWeight: 600 } }}>{children}</Badge>;
}

/** Optional department of the chosen site, from the organisation tree (GET /api/org). */
export function DepartmentSelect({ siteId, value, onChange }: { siteId: string | null; value: string | null; onChange: (id: string | null) => void }) {
  const org = useQuery(orgQuery);
  const departments = siteDepartments(org.data ?? [], siteId);
  return (
    <Select label="部門" clearable searchable value={value} onChange={onChange} data={departments.map(d => ({ value: d.id, label: d.name }))}
      placeholder={org.isPending ? '載入中…' : departments.length ? '不指定' : '這個廠區沒有部門'} disabled={!departments.length}
      error={org.isError ? problemText(org.error) : undefined} nothingFoundMessage="找不到這個部門" />
  );
}

/** A person in a table: a link to their profile for roles that may open it, plain text otherwise. */
export function PersonLink({ employeeId, name, empNo }: { employeeId: string; name: string; empNo?: string }) {
  const me = useMe();
  const label = <>{name}{empNo && <Text span size="xs" c="dimmed" ff="monospace"> {empNo}</Text>}</>;
  return canAccess(me, { feature: 'employees', data: 'identity' })
    ? <AnchorLink to="/employees/$employeeId" params={{ employeeId }} fw={600}>{label}</AnchorLink>
    : <Text span fw={600}>{label}</Text>;
}

/**
 * A staff picker's option with the account's work email under the name (GET /api/staff), so two people with the
 * same name can be told apart. Pass it as a Select or Autocomplete renderOption.
 */
export function staffOptionRenderer(emails: ReadonlyMap<string, string>) {
  return function StaffOption({ option }: { option: { value: string; label?: string } }) {
    const email = emails.get(option.value);
    return (
      <Stack gap={0} style={{ minWidth: 0 }}>
        <Text size="sm">{option.label ?? option.value}</Text>
        {email && <Text size="xs" c="dimmed" style={{ overflowWrap: 'anywhere' }}>{email}</Text>}
      </Stack>
    );
  };
}

/** Forms fill the screen on phones. */
export function useModalSize(size: ModalProps['size'] = 'lg'): Pick<ModalProps, 'size' | 'fullScreen'> {
  const phone = useMediaQuery('(max-width: 48em)');
  return { size, fullScreen: !!phone };
}

/** Plain-language text for a failed save. */
export function saveProblem(err: unknown): string {
  if (err instanceof ApiRequestError) {
    if (err.code === 'validation_failed') return '有欄位格式不正確，請檢查後再送出。';
    if (err.code === 'unknown_assessment') return '找不到所選的環境危害評估，請重新選擇。';
    if (err.code === 'employee_not_found') return '找不到這位員工，可能已被刪除。';
    if (err.code === 'already_confirmed') return '員工已確認這份紀錄，不需要再產生連結。';
    if (err.code === 'not_a_manager') return '收件人必須是在職的部門主管帳號。';
    if (err.code === 'unknown_department') return '所選部門不屬於這個廠區，請重新選擇。';
    if (err.code === 'unknown_sign_off_role') return '簽核人員的類別必須是租戶設定的簽核角色。';
    if (err.code === 'no_signers') return '請先加入至少一位簽核人員再送出。';
    if (err.code === 'not_draft') return '這份紀錄已送出簽核，不能再修改或刪除。請重新整理。';
    if (err.code === 'not_in_sign_off') return '這份紀錄目前不在簽核中。請重新整理。';
    if (err.code === 'already_signed') return '這位簽核人員已經簽核，不需要重發連結。';
    if (err.code === 'not_suspected') return '只有疑似有危害的問卷可以列管。';
    if (err.code === 'interview_date_required') return '面談狀態為已面談時，請填面談日期。';
    if (err.code === 'unknown_staff') return '找不到這位醫師的帳號，可能已停用。';
    if ([403, 404, 503].includes(err.status)) return problemText(err);
  }
  return '暫時無法儲存，請稍後再試。';
}

export function Kv({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div>
      <Text size="xs" c="dimmed">{label}</Text>
      <Text size="sm" fw={500} component="div">{value}</Text>
    </div>
  );
}

export function DateField(props: TextInputProps) {
  return <TextInput type="date" {...props} />;
}

const employeeLabel = (e: Pick<Employee, 'empNo' | 'name'>) => `${e.empNo} ${e.name}`;

/**
 * Searchable employee field over GET /api/employees (my sites, name or employee number). `filter` narrows the
 * results, e.g. to female employees for a maternal notification.
 */
export function EmployeePicker({ value, onChange, filter, label, description, required, error }: {
  value: Employee | null; onChange: (e: Employee | null) => void; filter?: (e: Employee) => boolean;
  label: string; description?: string; required?: boolean; error?: ReactNode;
}) {
  const [search, setSearch] = useState(value ? employeeLabel(value) : '');
  const term = value && search === employeeLabel(value) ? '' : search.trim();
  const [debounced] = useDebouncedValue(term, 250);
  const found = useQuery({
    queryKey: ['employees', 'pick', debounced],
    queryFn: () => data(api.GET('/api/employees', { params: { query: { q: debounced, status: '在職', limit: 20 } } })),
    enabled: debounced.length > 0,
    staleTime: 30_000,
  });
  const items = (found.data?.items ?? []).filter(e => !filter || filter(e));
  const options = [...(value ? [value] : []), ...items.filter(e => e.id !== value?.id)];
  return (
    <Select label={label} description={description} required={required} error={error} searchable clearable
      placeholder="輸入姓名或工號搜尋" searchValue={search} onSearchChange={setSearch}
      data={options.map(e => ({ value: e.id, label: employeeLabel(e) }))}
      value={value?.id ?? null} onChange={id => onChange(options.find(e => e.id === id) ?? null)}
      filter={({ options: o }) => o}
      nothingFoundMessage={!debounced ? '輸入姓名或工號' : found.isFetching ? '搜尋中…' : found.isError ? problemText(found.error) : '找不到符合的在職員工'} />
  );
}
