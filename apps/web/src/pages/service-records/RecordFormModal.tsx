import { ActionIcon, Autocomplete, Box, Button, Grid, Group, Input, Menu, Modal, NumberInput, Select, SimpleGrid, Stack, Text, Textarea, TextInput } from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import { IconPlus, IconQuote, IconX } from '@tabler/icons-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { canAccess } from '../../nav';
import { useMe, useTenant } from '../../session';
import { staffQuery } from '../nurse/queries';
import { SERVICE_ROLES, staffOptions } from '../nurse/staff';
import { createRecord, orgQuery, PHRASE_CATEGORIES, serviceRecordsQuery, servicePhrasesQuery, signOffRolesQuery, submitRecord, updateRecord } from './queries';
import { SectionTitle } from './parts';
import {
  departmentNames, formErrors, linksAreEmailed, roleOptions, SECTIONS, serviceProblem, toBody, unitForSite,
  type Headcount, type ServiceForm, type ServiceRecord, type SignLink,
} from './records';

export type FormMode = 'new' | 'edit' | 'copy';

const TITLE: Record<FormMode, string> = { new: '新增勞工健康服務執行紀錄表', edit: '編輯勞工健康服務執行紀錄表', copy: '複製勞工健康服務執行紀錄表' };

/** Create or edit a draft; "送出簽核" saves first, then sends the sign-off links. */
export function RecordFormModal({ mode, recordId, initial, executorName, categorySuggestions, onClose, onSubmitted }: {
  mode: FormMode;
  recordId?: string;
  initial: ServiceForm;
  /** The executor's name as the record has it (they may no longer be in the staff list). */
  executorName?: string | null;
  categorySuggestions: string[];
  onClose: () => void;
  onSubmitted: (links: SignLink[]) => void;
}) {
  const me = useMe();
  const emailed = linksAreEmailed(useTenant());
  const qc = useQueryClient();
  const phone = useMediaQuery('(max-width: 48em)');
  const [f, setF] = useState<ServiceForm>(initial);
  const [tried, setTried] = useState(false);
  const [confirming, setConfirming] = useState(false);
  // Once saved, later saves update that record (e.g. when submitting fails after the save went through).
  const [savedId, setSavedId] = useState(recordId);
  const roles = useQuery(signOffRolesQuery);
  const staff = useQuery(staffQuery(SERVICE_ROLES));
  const org = useQuery(orgQuery);
  const errors = formErrors(f, roles.data);
  const valid = Object.keys(errors).length === 0;
  const shown = tried ? errors : {};
  const sites = [...me.sites, ...me.breakGlassSites.filter(b => !me.sites.some(s => s.id === b.id))];
  const clinical = canAccess(me, { feature: 'employees', data: 'medical' });
  const phrases = useQuery({ ...servicePhrasesQuery, enabled: clinical });
  const executors = staffOptions(staff.data, me.id, [{ id: f.executorUserId, name: executorName ?? (f.executorUserId === me.id ? me.name : null) }]);
  const signerRoles = roleOptions(roles.data ?? [], f.signers.map(s => s.role));
  const departments = departmentNames(org.data ?? [], [f.siteId]);

  const set = <K extends keyof ServiceForm>(k: K, v: ServiceForm[K]) => setF(prev => ({ ...prev, [k]: v }));
  const setCount = (k: keyof Headcount, v: string | number) => setF(prev => ({ ...prev, headcount: { ...prev.headcount, [k]: typeof v === 'number' ? v : 0 } }));

  const save = useMutation({
    mutationFn: async (andSubmit: boolean) => {
      const body = toBody(f);
      const saved: ServiceRecord = savedId ? await updateRecord(savedId, body) : await createRecord(body);
      setSavedId(saved.id);
      return andSubmit ? submitRecord(saved.id) : null;
    },
    onSettled: () => qc.invalidateQueries({ queryKey: serviceRecordsQuery.queryKey }),
    onSuccess: links => { if (links) onSubmitted(links); else onClose(); },
  });

  const run = (andSubmit: boolean) => {
    setTried(true);
    if (!valid) { setConfirming(false); return; }
    if (andSubmit && !confirming) { setConfirming(true); return; }
    save.mutate(andSubmit);
  };
  const signerCount = toBody(f).signers.length;

  return (
    <Modal opened onClose={onClose} title={TITLE[mode]} size={1000} fullScreen={phone} closeOnClickOutside={false} closeOnEscape={false}>
      <Stack gap="xl">
        <Grid gap="md">
          <Grid.Col span={{ base: 12, sm: 6, md: 3 }}>
            <TextInput type="date" label="執行日期" required value={f.serviceOn} error={shown.serviceOn} onChange={e => set('serviceOn', e.currentTarget.value)} />
          </Grid.Col>
          <Grid.Col span={{ base: 12, sm: 6, md: 4 }}>
            <Group gap={8} wrap="nowrap" align="flex-start">
              <TextInput type="time" label="開始時間" required value={f.from} error={shown.from} onChange={e => set('from', e.currentTarget.value)} style={{ flex: 1 }} />
              <TextInput type="time" label="結束時間" required value={f.to} error={shown.to} onChange={e => set('to', e.currentTarget.value)} style={{ flex: 1 }} />
            </Group>
          </Grid.Col>
          <Grid.Col span={{ base: 12, sm: 6, md: 2 }}>
            <Select label="地點" required data={sites.map(s => ({ value: s.id, label: s.name }))} value={f.siteId || null} error={shown.siteId}
              onChange={v => setF(prev => ({ ...prev, siteId: v ?? '', unit: v && org.data ? unitForSite(org.data, prev, v) : prev.unit }))} allowDeselect={false} />
          </Grid.Col>
          <Grid.Col span={{ base: 12, sm: 6, md: 3 }}>
            <Select label="執行人員" required data={executors} value={f.executorUserId || null} allowDeselect={false} searchable
              error={shown.executorUserId ?? (staff.isError ? '暫時無法載入人員名單' : undefined)} disabled={staff.isPending}
              onChange={v => v && set('executorUserId', v)} />
          </Grid.Col>
        </Grid>

        <div>
          <SectionTitle>一、作業場所基本資料</SectionTitle>
          <Stack gap="md" mt="sm">
            <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
              <TextInput label="事業單位" description="預設為地點所屬的公司" maxLength={100} value={f.unit} onChange={e => set('unit', e.currentTarget.value)} />
              <Autocomplete label="部門名稱" description="可選擇這個地點的部門，或自行輸入" maxLength={100} data={departments} value={f.departmentName}
                onChange={v => set('departmentName', v)} />
            </SimpleGrid>
            <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="md">
              <CountPair label="行政人員" m={f.headcount.adminM} f={f.headcount.adminF} onM={v => setCount('adminM', v)} onF={v => setCount('adminF', v)} />
              <CountPair label="現場操作人員" m={f.headcount.opM} f={f.headcount.opF} onM={v => setCount('opM', v)} onF={v => setCount('opF', v)} />
              <Count label="一般作業人數" value={f.headcount.general} onChange={v => setCount('general', v)} />
            </SimpleGrid>
            <Input.Wrapper label="特別危害健康作業類別與人數">
              <Stack gap={8} mt={4}>
                {f.special.map((s, i) => (
                  <Group key={i} gap={8} wrap="nowrap" align="flex-start">
                    <Autocomplete aria-label="作業類別" placeholder="作業類別，例如噪音作業" data={categorySuggestions} maxLength={50} value={s.category} style={{ flex: 1 }}
                      onChange={v => set('special', f.special.map((x, j) => (j === i ? { ...x, category: v } : x)))} />
                    <NumberInput aria-label="人數" min={0} max={100000} allowDecimal={false} allowNegative={false} w={110} suffix=" 人" value={s.count}
                      onChange={v => set('special', f.special.map((x, j) => (j === i ? { ...x, count: typeof v === 'number' ? v : 0 } : x)))} />
                    <ActionIcon variant="subtle" color="gray" size={36} aria-label="移除這個作業類別" onClick={() => set('special', f.special.filter((_, j) => j !== i))}><IconX size={16} /></ActionIcon>
                  </Group>
                ))}
                {shown.special && <Text size="xs" c="var(--yutis-bad)">{shown.special}</Text>}
                <div><Button variant="default" size="xs" leftSection={<IconPlus size={14} />} onClick={() => set('special', [...f.special, { category: '', count: 0 }])}>新增作業類別</Button></div>
              </Stack>
            </Input.Wrapper>
          </Stack>
        </div>

        {SECTIONS.map(([key, title]) => (
          <div key={key}>
            <SectionTitle right={key === 'services' && clinical && (phrases.data?.length ?? 0) > 0 && (
                <Menu position="bottom-end" width={360} withinPortal>
                  <Menu.Target><Button variant="subtle" size="compact-xs" leftSection={<IconQuote size={14} />}>插入片語</Button></Menu.Target>
                  <Menu.Dropdown mah={320} style={{ overflowY: 'auto' }}>
                    {PHRASE_CATEGORIES.map(cat => {
                      const list = phrases.data!.filter(p => p.category === cat);
                      return list.length === 0 ? null : [
                        <Menu.Label key={cat}>{cat}</Menu.Label>,
                        ...list.map(p => <Menu.Item key={p.id} onClick={() => set('services', f.services ? `${f.services.replace(/\n*$/, '')}\n${p.text}` : p.text)}><Text size="sm">{p.text}</Text></Menu.Item>),
                      ];
                    })}
                  </Menu.Dropdown>
                </Menu>
              )}>{title}</SectionTitle>
            <Textarea aria-label={title} autosize minRows={key === 'services' ? 5 : 3} maxRows={14} maxLength={10000} mt="xs" value={f[key]} onChange={e => set(key, e.currentTarget.value)} />
          </div>
        ))}

        <div>
          <SectionTitle>六、簽核人員</SectionTitle>
          <Text size="xs" c="dimmed" mt={4} mb="sm">
            {emailed ? '送出後，系統會寄一次性的簽核連結到每位簽核人員的 Email。' : '送出後會為每位簽核人員產生一次性的簽核連結（這個環境不會實際寄出 Email）。'}
            人員類別依租戶設定的簽核角色。
          </Text>
          {roles.isError && <Text size="xs" c="var(--yutis-bad)" mb="sm">暫時無法載入簽核角色，請稍後再試。</Text>}
          <Stack gap={8}>
            {f.signers.map((s, i) => {
              const patch = (p: Partial<typeof s>) => set('signers', f.signers.map((x, j) => (j === i ? { ...x, ...p } : x)));
              return (
                <Group key={i} gap={8} wrap="nowrap" align="flex-start" p={8} style={{ background: 'var(--yutis-surface2)', borderRadius: 'var(--mantine-radius-md)' }}>
                  <SimpleGrid cols={{ base: 1, sm: 3 }} spacing={8} style={{ flex: 1 }}>
                    <Select aria-label={`第 ${i + 1} 位簽核人員類別`} placeholder="選擇人員類別" data={signerRoles} value={s.role || null} allowDeselect={false}
                      disabled={roles.isPending} onChange={v => patch({ role: v ?? '' })} />
                    <TextInput aria-label={`第 ${i + 1} 位簽核人員姓名`} placeholder="姓名" maxLength={100} value={s.name} onChange={e => patch({ name: e.currentTarget.value })} />
                    <TextInput aria-label={`第 ${i + 1} 位簽核人員 Email`} placeholder="Email" type="email" value={s.email} onChange={e => patch({ email: e.currentTarget.value })} />
                  </SimpleGrid>
                  <ActionIcon variant="subtle" color="gray" size={36} aria-label={`移除第 ${i + 1} 位簽核人員`} onClick={() => set('signers', f.signers.filter((_, j) => j !== i))}><IconX size={16} /></ActionIcon>
                </Group>
              );
            })}
            {shown.signers && <Text size="xs" c="var(--yutis-bad)">{shown.signers}</Text>}
            <div>
              <Button variant="default" size="xs" leftSection={<IconPlus size={14} />} disabled={f.signers.length >= 10}
                onClick={() => set('signers', [...f.signers, { role: '', name: '', email: '' }])}>新增簽核人員</Button>
            </div>
          </Stack>
        </div>

        <Box pt="md" style={{ borderTop: '1px solid var(--yutis-line)' }}>
          {save.isError && <Text size="sm" c="var(--yutis-bad)" mb="sm" role="alert">{serviceProblem(save.error)}{savedId && !recordId ? '（草稿已儲存）' : ''}</Text>}
          {tried && !valid && <Text size="sm" c="var(--yutis-bad)" mb="sm" role="alert">請先修正標示的欄位。</Text>}
          {confirming ? (
            <Group justify="space-between" gap="sm">
              <Text size="sm" fw={500}>送出後就不能再修改，系統會{emailed ? '寄簽核連結給' : '產生簽核連結給'} {signerCount} 位簽核人員。確定送出？</Text>
              <Group gap="sm">
                <Button variant="default" onClick={() => setConfirming(false)} disabled={save.isPending}>返回修改</Button>
                <Button onClick={() => run(true)} loading={save.isPending}>確定送出</Button>
              </Group>
            </Group>
          ) : (
            <Group justify="flex-end" gap="sm">
              <Button variant="subtle" color="gray" onClick={onClose} disabled={save.isPending}>取消</Button>
              <Button variant="default" onClick={() => run(false)} loading={save.isPending && save.variables === false}>儲存草稿</Button>
              <Button onClick={() => run(true)} disabled={save.isPending}>送出簽核</Button>
            </Group>
          )}
        </Box>
      </Stack>
    </Modal>
  );
}

function Count({ label, value, onChange }: { label: string; value: number; onChange: (v: string | number) => void }) {
  return <NumberInput label={label} min={0} max={100000} allowDecimal={false} allowNegative={false} suffix=" 人" value={value} onChange={onChange} />;
}

function CountPair({ label, m, f, onM, onF }: { label: string; m: number; f: number; onM: (v: string | number) => void; onF: (v: string | number) => void }) {
  return (
    <Input.Wrapper label={label}>
      <Group gap={8} wrap="nowrap">
        <NumberInput aria-label={`${label}男`} leftSection={<Text size="xs" c="dimmed">男</Text>} suffix=" 人" min={0} max={100000} allowDecimal={false} allowNegative={false} value={m} onChange={onM} style={{ flex: 1 }} />
        <NumberInput aria-label={`${label}女`} leftSection={<Text size="xs" c="dimmed">女</Text>} suffix=" 人" min={0} max={100000} allowDecimal={false} allowNegative={false} value={f} onChange={onF} style={{ flex: 1 }} />
      </Group>
    </Input.Wrapper>
  );
}
