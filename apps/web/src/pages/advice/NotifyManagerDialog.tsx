import { Alert, Button, Group, Modal, Select, Skeleton, Stack, Text, Textarea } from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import { useMutation, useQuery } from '@tanstack/react-query';
import { data } from '@yutis/api-client';
import { useState } from 'react';
import { api } from '../../api';
import { employeeQuery } from '../../queries';
import { saveProblem, staffOptionRenderer } from '../programs/maternalViolenceCommon';
import { problemText } from '../states';
import { defaultManager, managerOptions, NOTICE_MAX, sentNoticeStatus, type Manager, type NoticeStatus, type NoticeSubject } from './advice';
import { managersQuery } from './queries';

export interface NotifyManagerProps {
  opened: boolean;
  onClose: () => void;
  employee: { id: string; name: string };
  subjectTable: NoticeSubject;
  /** The interview the notice is about. */
  subjectId: string;
  /** Prefilled advice text (maternalNoticeText / workloadNoticeText). */
  advice: string;
  onSent?: (notice: NoticeStatus) => void;
}

/**
 * 通知主管: sends the work-arrangement advice (only that text) to a 部門主管, via POST /api/programs/notices. The
 * employee's own department manager is preselected. Render it only for clinical staff (職護、職醫); the API refuses
 * everyone else.
 */
export function NotifyManagerDialog(props: NotifyManagerProps) {
  const phone = useMediaQuery('(max-width: 48em)');
  return (
    <Modal opened={props.opened} onClose={props.onClose} title="通知部門主管" size="md" fullScreen={!!phone}>
      {/* Remount per opening so the form starts from the current interview. */}
      {props.opened && <NotifyLoader {...props} />}
    </Modal>
  );
}

function NotifyLoader(props: NotifyManagerProps) {
  const managers = useQuery(managersQuery);
  // The employee's department picks the default recipient; without it nobody is preselected.
  const employee = useQuery({ ...employeeQuery(props.employee.id), staleTime: 5 * 60_000 });
  if (managers.isError) return <Text size="sm" c="var(--yutis-bad)">{problemText(managers.error)}</Text>;
  if (managers.isPending || employee.isPending) return <Skeleton h={260} />;
  return <NotifyForm {...props} managers={managers.data} departmentId={employee.data?.department.id ?? null} empNo={employee.data?.empNo} />;
}

function NotifyForm({ onClose, employee, subjectTable, subjectId, advice: prefill, onSent, managers, departmentId, empNo }: NotifyManagerProps & {
  managers: Manager[]; departmentId: string | null; empNo?: string;
}) {
  const [managerId, setManagerId] = useState<string | null>(() => defaultManager(managers, departmentId));
  // The email under each name tells two managers with the same name apart; the notice goes to that address.
  const renderManager = staffOptionRenderer(new Map(managers.map(m => [m.id, m.email])));
  const [advice, setAdvice] = useState(prefill);
  const [tried, setTried] = useState(false);
  const send = useMutation({
    mutationFn: () => data(api.POST('/api/programs/notices', {
      body: { employeeId: employee.id, managerUserId: managerId!, subjectTable, subjectId, advice: advice.trim() },
    })),
    onSuccess: n => { onSent?.(sentNoticeStatus(n, managers.find(m => m.id === managerId)!)); onClose(); },
  });
  const submit = () => { setTried(true); if (managerId && advice.trim()) send.mutate(); };

  return (
    <Stack gap="md">
      <Text size="sm">{employee.name}{empNo ? `（${empNo}）` : ''}的工作安排建議。</Text>
      <Select label="部門主管" required allowDeselect={false} placeholder={managers.length ? '選擇主管' : '目前沒有部門主管帳號'} searchable
        data={managerOptions(managers, departmentId)} value={managerId} onChange={setManagerId} renderOption={renderManager}
        error={tried && !managerId ? '請選擇要通知的主管' : undefined} nothingFoundMessage="找不到這位主管" />
      <Textarea label="建議內容" required autosize minRows={4} maxLength={NOTICE_MAX} value={advice} onChange={e => setAdvice(e.currentTarget.value)}
        description={`${advice.length}／${NOTICE_MAX} 字`} error={tried && !advice.trim() ? '請填寫要給主管的建議' : undefined} />
      <Alert color="gray" variant="light" p="sm">
        <Text size="sm">主管只會看到這段文字，看不到面談紀錄、診斷或健康數值。請勿寫入醫療內容。</Text>
      </Alert>
      {send.isError && <Text size="sm" c="var(--yutis-bad)" role="alert">{saveProblem(send.error)}</Text>}
      <Group justify="flex-end">
        <Button variant="default" onClick={onClose}>取消</Button>
        <Button loading={send.isPending} onClick={submit}>送出通知</Button>
      </Group>
    </Stack>
  );
}
