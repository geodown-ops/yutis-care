/* Shared by the maternal and violence programme pages: who may do what, sites, people and form bits. */
import { Badge, Select, Text, TextInput, type ModalProps, type TextInputProps } from '@mantine/core';
import { useDebouncedValue, useMediaQuery } from '@mantine/hooks';
import { useQuery } from '@tanstack/react-query';
import { ApiRequestError, data, type Schemas } from '@yutis/api-client';
import { useState, type ReactNode } from 'react';
import { api } from '../../api';
import { AnchorLink } from '../../links';
import { canAccess, type Access } from '../../nav';
import { useMe } from '../../session';
import { problemText } from '../states';

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

export function ToneBadge({ tone, children }: { tone: Tone; children: ReactNode }) {
  return <Badge styles={{ root: { background: `var(--yutis-${tone}-weak)`, color: `var(--yutis-${tone})`, textTransform: 'none', fontWeight: 600 } }}>{children}</Badge>;
}

/** A person in a table: a link to their profile for roles that may open it, plain text otherwise. */
export function PersonLink({ employeeId, name, empNo }: { employeeId: string; name: string; empNo?: string }) {
  const me = useMe();
  const label = <>{name}{empNo && <Text span size="xs" c="dimmed" ff="monospace"> {empNo}</Text>}</>;
  return canAccess(me, { feature: 'employees', data: 'identity' })
    ? <AnchorLink to="/employees/$employeeId" params={{ employeeId }} fw={600}>{label}</AnchorLink>
    : <Text span fw={600}>{label}</Text>;
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
    if (err.code === 'already_confirmed') return '員工已確認這份紀錄，不需要再寄連結。';
    if (err.code === 'not_a_manager') return '收件人必須是在職的部門主管帳號。';
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
