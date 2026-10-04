import {
  ActionIcon, Alert, Box, Button, Checkbox, Chip, Drawer, Grid, Group, Input, Modal, NumberInput, Radio, ScrollArea, Select, SimpleGrid, Skeleton, Stack, Text,
  Textarea, TextInput, UnstyledButton,
} from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import { IconPlus, IconX } from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import { ASSIST_CATEGORIES, CONSULT_TYPES, LIFESTYLE_ADVICE } from '@yutis/domain';
import { useId, useState, type ReactNode } from 'react';
import type { EmployeeCase } from '../../cases';
import { employeeCaseQuery } from '../../queries';
import { useMe } from '../../session';
import { nurseAccess } from './access';
import { actionErrorText, phrasesQuery, staffQuery, useSaveRecord } from './queries';
import {
  caseContext, caseFollowOn, followOnLabel, newRecordForm, recordBody, recordProblems, recordToForm, withPhrase,
  type Advice, type CareRecord, type ConsultType, type RecordForm, type RecordResult,
} from './records';
import { CARE_ROLES, staffOptions, type StaffMember } from './staff';

export interface RecordFormTarget {
  employeeId: string;
  employeeName: string;
  /** Edit this record; otherwise write a new one. */
  record?: CareRecord;
  /** The follow-up this record answers (from 近期追蹤): marked done when the record is saved. */
  completes?: string;
}

/** 新增／編輯協助紀錄, with the phrase library beside the form (prototype openRecord). */
export function RecordFormModal({ target, onClose }: { target: RecordFormTarget | null; onClose: () => void }) {
  const wide = useMediaQuery('(min-width: 62em)', true);
  const phone = !useMediaQuery('(min-width: 36em)', true);
  return (
    <Modal opened={!!target} onClose={onClose} size={wide ? 1080 : 'lg'} fullScreen={phone}
      title={target ? `${target.record ? '編輯' : '新增'}協助紀錄 · ${target.employeeName}` : ''} scrollAreaComponent={ScrollArea.Autosize}>
      {target && <RecordFormLoader key={target.record?.id ?? `${target.employeeId}/${target.completes ?? ''}`} target={target} wide={wide} onDone={onClose} />}
    </Modal>
  );
}

function RecordFormLoader({ target, wide, onDone }: { target: RecordFormTarget; wide: boolean; onDone: () => void }) {
  const me = useMe();
  const access = nurseAccess(me);
  const kase = useQuery({ ...employeeCaseQuery(target.employeeId), enabled: access.cases });
  const staff = useQuery(staffQuery(CARE_ROLES));
  if ((access.cases && kase.isPending) || staff.isPending) return <Skeleton h={420} />;
  const initial = target.record ? recordToForm(target.record, me.id) : newRecordForm({ now: new Date(), meId: me.id, events: kase.data?.events });
  // Without the list (it failed to load) the form still offers the people already on the record.
  return <RecordFormBody target={target} initial={initial} kase={kase.data} staff={staff.data} wide={wide} onDone={onDone} />;
}

type TextKey = 'explain' | 'handling' | 'note';
const TEXT_LABEL: Record<TextKey, string> = { explain: '報告解說／健康諮詢', handling: '處理狀況', note: '備註' };

function RecordFormBody({ target, initial, kase, staff, wide, onDone }: {
  target: RecordFormTarget; initial: RecordForm; kase: Pick<EmployeeCase, 'case' | 'events' | 'status'> | undefined;
  staff: StaffMember[] | undefined; wide: boolean; onDone: () => void;
}) {
  const me = useMe();
  const [f, setF] = useState(initial);
  const set = <K extends keyof RecordForm>(k: K, v: RecordForm[K]) => setF(x => ({ ...x, [k]: v }));
  const [field, setField] = useState<TextKey>('explain');
  const [phrasesFor, setPhrasesFor] = useState<TextKey | null>(null);
  const [problems, setProblems] = useState<string[]>([]);
  const [later, setLater] = useState<string[] | null>(null);
  // Editing a saved record should not move the case unless asked; a new record or a draft being finished does.
  const [applyCase, setApplyCase] = useState(!target.record || target.record.draft);
  const save = useSaveRecord();

  // Clinical staff, plus anyone already on the record who has since been deactivated.
  const people = staffOptions(staff, me.id, [...f.helpers.map(h => ({ id: h.userId, name: h.userId === me.id ? me.name : null })), { id: f.followUpUserId }]);
  const categories = ASSIST_CATEGORIES.includes(f.category as never) ? [...ASSIST_CATEGORIES] : [f.category, ...ASSIST_CATEGORIES];
  const followOn = kase ? caseFollowOn(kase, f.result) : null;

  const insert = (key: TextKey, text: string) => setF(x => ({ ...x, [key]: withPhrase(x[key], text) }));
  const submit = (draft: boolean) => {
    const p = recordProblems(f, draft);
    setProblems(p);
    if (p.length) return;
    save.mutate(
      { employeeId: target.employeeId, id: target.record?.id, body: recordBody(f, draft), followOn: applyCase ? followOn : null, completes: target.completes },
      { onSuccess: r => (r.later.length ? setLater(r.later) : onDone()) },
    );
  };

  if (later) {
    return (
      <Stack gap="md">
        <Alert color="yellow" variant="light" title="紀錄已儲存">
          <Stack gap={4}>{later.map(l => <Text key={l} size="sm">{l}</Text>)}</Stack>
        </Alert>
        <Text size="sm" c="dimmed">請到個案頁籤再試一次。</Text>
        <Group justify="flex-end"><Button onClick={onDone}>關閉</Button></Group>
      </Stack>
    );
  }

  const text = (key: TextKey, minRows: number) => (
    <TextBlock label={TEXT_LABEL[key]} value={f[key]} minRows={minRows} active={wide && field === key}
      onChange={v => set(key, v)} onFocus={() => setField(key)} onPhrases={wide ? undefined : () => setPhrasesFor(key)} />
  );

  const form = (
    <Stack gap="lg">
      <Text size="sm" c="dimmed">
        {[kase && caseContext(kase), target.completes && '由近期追蹤建立，儲存後原本的追蹤會標示為完成'].filter(Boolean).join(' · ')}
      </Text>
      <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="sm">
        <Select label="協助類別" required data={categories} value={f.category} onChange={v => v && set('category', v)} allowDeselect={false} />
        <TextInput type="date" label="發生日期" required value={f.date} onChange={e => set('date', e.currentTarget.value)} />
        <TextInput type="time" label="發生時間" value={f.time} onChange={e => set('time', e.currentTarget.value)} />
      </SimpleGrid>

      <Checkbox.Group label="諮詢類型" withAsterisk value={f.consultTypes} onChange={v => set('consultTypes', v as ConsultType[])}>
        <SimpleGrid cols={{ base: 1, sm: 2 }} spacing={8} mt={6}>{CONSULT_TYPES.map(t => <Checkbox key={t} value={t} label={t} />)}</SimpleGrid>
      </Checkbox.Group>

      {text('explain', 4)}

      <Checkbox.Group label="生活指導" value={f.lifestyleAdvice} onChange={v => set('lifestyleAdvice', v as Advice[])}>
        <SimpleGrid cols={{ base: 1, sm: 2 }} spacing={8} mt={6}>{LIFESTYLE_ADVICE.map(t => <Checkbox key={t} value={t} label={t} />)}</SimpleGrid>
      </Checkbox.Group>

      {text('handling', 3)}
      {text('note', 2)}

      <div>
        <Input.Label mb={6}>協助人員與費時</Input.Label>
        <Stack gap={8}>
          {f.helpers.map((h, i) => (
            <Group key={i} gap="sm" wrap="nowrap" align="flex-end">
              <Select aria-label={`協助人員 ${i + 1}`} data={people} value={h.userId || null} allowDeselect={false} style={{ flex: 1 }}
                onChange={v => v && set('helpers', f.helpers.map((x, j) => (j === i ? { ...x, userId: v } : x)))} />
              <NumberInput aria-label={`協助人員 ${i + 1} 費時（分鐘）`} w={110} min={0} max={1440} allowDecimal={false} suffix=" 分" value={h.minutes}
                onChange={v => set('helpers', f.helpers.map((x, j) => (j === i ? { ...x, minutes: typeof v === 'number' ? v : Number(v) || 0 } : x)))} />
              <ActionIcon variant="subtle" color="gray" size="lg" aria-label="移除協助人員" onClick={() => set('helpers', f.helpers.filter((_, j) => j !== i))}><IconX size={16} /></ActionIcon>
            </Group>
          ))}
          {f.helpers.length < people.length && (
            <Button variant="subtle" size="xs" leftSection={<IconPlus size={14} />} style={{ alignSelf: 'flex-start' }}
              onClick={() => set('helpers', [...f.helpers, { userId: people.find(p => !f.helpers.some(h => h.userId === p.value))?.value ?? '', minutes: 10 }])}>
              協助人員
            </Button>
          )}
        </Stack>
      </div>

      <div>
        <Radio.Group label="協助紀錄結果" value={f.result} onChange={v => set('result', v as RecordResult)}>
          <Group gap="lg" mt={6}><Radio value="追蹤" label="追蹤" /><Radio value="結案" label="結案" /></Group>
        </Radio.Group>
        {f.result === '追蹤' && (
          <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm" mt="sm">
            <TextInput type="date" label="下次追蹤日期" required value={f.followUpOn} onChange={e => set('followUpOn', e.currentTarget.value)} />
            <Select label="負責追蹤人員" data={people} value={f.followUpUserId || null} allowDeselect={false} onChange={v => v && set('followUpUserId', v)} />
          </SimpleGrid>
        )}
        <Text size="xs" c="dimmed" mt={6}>選「追蹤」會出現在負責人員首頁的近期追蹤；按「暫存」先存成草稿，之後再編輯。</Text>
        {followOn && (
          <Checkbox mt="sm" checked={applyCase} onChange={e => setApplyCase(e.currentTarget.checked)} label={followOnLabel(followOn)}
            description="只在按「儲存」時執行，暫存不會變更個案。" />
        )}
      </div>

      {problems.length > 0 && <Alert color="red" variant="light"><Stack gap={2}>{problems.map(p => <Text key={p} size="sm">{p}</Text>)}</Stack></Alert>}
      {save.isError && <Alert color="red" variant="light">{actionErrorText(save.error)}</Alert>}

      <Group justify="flex-end" gap="sm">
        <Button variant="default" onClick={onDone}>取消</Button>
        <Button variant="light" color="yutis" loading={save.isPending && save.variables?.body.draft} disabled={save.isPending} onClick={() => submit(true)}>暫存</Button>
        <Button loading={save.isPending && !save.variables?.body.draft} disabled={save.isPending} onClick={() => submit(false)}>儲存</Button>
      </Group>
    </Stack>
  );

  if (!wide) {
    return (
      <>
        {form}
        <Drawer opened={!!phrasesFor} onClose={() => setPhrasesFor(null)} position="bottom" size="70%" title={phrasesFor ? `片語 · 帶入${TEXT_LABEL[phrasesFor]}` : ''}>
          <PhrasePanel onPick={t => { if (phrasesFor) insert(phrasesFor, t); setPhrasesFor(null); }} />
        </Drawer>
      </>
    );
  }
  return (
    <Grid gap="xl">
      <Grid.Col span={8}>{form}</Grid.Col>
      <Grid.Col span={4}>
        <Box style={{ position: 'sticky', top: 0 }}>
          <Text fw={600} mb={4}>片語</Text>
          <Text size="xs" c="dimmed" mb="sm">點片語會加到「{TEXT_LABEL[field]}」。先點表單中的文字欄位可切換。</Text>
          <PhrasePanel onPick={t => insert(field, t)} />
        </Box>
      </Grid.Col>
    </Grid>
  );
}

function TextBlock({ label, value, minRows, active, onChange, onFocus, onPhrases }: {
  label: string; value: string; minRows: number; active: boolean; onChange: (v: string) => void; onFocus: () => void; onPhrases?: () => void;
}) {
  const id = useId();
  return (
    <div>
      <Group justify="space-between" mb={4} wrap="nowrap">
        <Input.Label htmlFor={id}>{label}</Input.Label>
        {onPhrases && <Button size="compact-xs" variant="subtle" color="yutis" onClick={onPhrases}>片語</Button>}
      </Group>
      <Textarea id={id} autosize minRows={minRows} maxLength={5000} value={value} onChange={e => onChange(e.currentTarget.value)} onFocus={onFocus}
        styles={active ? { input: { borderColor: 'var(--yutis-brand)' } } : undefined} />
    </div>
  );
}

/** Record phrases first (prototype: 健康諮詢、健康諮詢_運動、處理狀況), then the rest of the library. */
const RECORD_CATEGORIES = ['健康諮詢', '健康諮詢_運動', '處理狀況'];

function PhrasePanel({ onPick }: { onPick: (text: string) => void }) {
  const phrases = useQuery(phrasesQuery);
  const all = [...new Set((phrases.data ?? []).map(p => p.category))];
  const cats = [...RECORD_CATEGORIES.filter(c => all.includes(c)), ...all.filter(c => !RECORD_CATEGORIES.includes(c))];
  const [cat, setCat] = useState<string | null>(null);
  const current = cat ?? cats[0] ?? null;
  if (phrases.isPending) return <Skeleton h={160} />;
  if (phrases.isError) return <Text size="sm" c="dimmed">暫時無法載入片語。</Text>;
  if (!cats.length) return <Text size="sm" c="dimmed">片語庫是空的，可請租戶管理員新增。</Text>;
  return (
    <Stack gap="sm">
      <Chip.Group value={current} onChange={v => setCat(v as string)}>
        <Group gap={6}>{cats.map(c => <Chip key={c} value={c} size="xs">{c}</Chip>)}</Group>
      </Chip.Group>
      <Stack gap={6}>
        {phrases.data.filter(p => p.category === current).map(p => (
          <PhraseButton key={p.id} onClick={() => onPick(p.text)}>
            {p.kind && <Text span size="xs" c="dimmed">{p.kind} · </Text>}{p.text}
          </PhraseButton>
        ))}
      </Stack>
    </Stack>
  );
}

function PhraseButton({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  return (
    <UnstyledButton onClick={onClick} p="sm" fz="sm" lh={1.5}
      style={{ background: 'var(--yutis-surface2)', borderRadius: 'var(--mantine-radius-md)', textAlign: 'left' }}>
      {children}
    </UnstyledButton>
  );
}
