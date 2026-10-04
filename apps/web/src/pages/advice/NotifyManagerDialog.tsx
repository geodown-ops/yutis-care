import { Alert, Button, Group, Modal, Select, Stack, Text, Textarea } from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import { useMutation } from '@tanstack/react-query';
import { data, type Schemas } from '@yutis/api-client';
import { useState } from 'react';
import { api } from '../../api';
import { saveProblem } from '../programs/maternalViolenceCommon';
import { defaultManager, interviewNoticeText, managerOptions, NOTICE_MAX, type ManagerOption, type NoticeInterview } from './advice';

export interface NotifyManagerProps {
  opened: boolean;
  onClose: () => void;
  employee: { id: string; name: string; empNo: string; departmentId?: string | null };
  /** A workload interview ('interviews') or a maternal interview ('maternal_interviews'). */
  subjectTable: 'interviews' | 'maternal_interviews';
  interview: NoticeInterview;
  /** GET /api/programs/managers (API PR #15). */
  managers: readonly ManagerOption[];
  onSent?: (notice: Schemas['NoticeDto']) => void;
}

/**
 * 通知主管: sends the work-arrangement advice (only that text) to a 部門主管, via POST /api/programs/notices.
 * Self-contained and not mounted yet: it needs the managers list and interview ids from API PR #15. Mount it next to
 * a saved interview (the maternal case detail, the workload interview) and on the employee profile's 工作安排建議.
 * Render it only for clinical staff (職護、職醫); the API refuses everyone else.
 */
export function NotifyManagerDialog(props: NotifyManagerProps) {
  const phone = useMediaQuery('(max-width: 48em)');
  return (
    <Modal opened={props.opened} onClose={props.onClose} title="通知部門主管" size="md" fullScreen={!!phone}>
      {/* Remount per opening so the form starts from the current interview. */}
      {props.opened && <NotifyForm {...props} />}
    </Modal>
  );
}

function NotifyForm({ onClose, employee, subjectTable, interview, managers, onSent }: NotifyManagerProps) {
  const [managerId, setManagerId] = useState<string | null>(() => defaultManager(managers, employee.departmentId));
  const [advice, setAdvice] = useState(() => interviewNoticeText(interview));
  const [tried, setTried] = useState(false);
  const send = useMutation({
    mutationFn: () => data(api.POST('/api/programs/notices', {
      body: { employeeId: employee.id, managerUserId: managerId!, subjectTable, subjectId: interview.id, advice: advice.trim() },
    })),
    onSuccess: n => { onSent?.(n); onClose(); },
  });
  const submit = () => { setTried(true); if (managerId && advice.trim()) send.mutate(); };

  return (
    <Stack gap="md">
      <Text size="sm">{employee.name}（{employee.empNo}）的工作安排建議。</Text>
      <Select label="部門主管" required placeholder={managers.length ? '選擇主管' : '目前沒有部門主管帳號'} searchable
        data={managerOptions(managers, employee.departmentId)} value={managerId} onChange={setManagerId}
        error={tried && !managerId ? '請選擇要通知的主管' : undefined} nothingFoundMessage="找不到這位主管" />
      <Textarea label="建議內容" required autosize minRows={4} maxLength={NOTICE_MAX} value={advice} onChange={e => setAdvice(e.currentTarget.value)}
        description={`${advice.length}／${NOTICE_MAX} 字`} error={tried && !advice.trim() ? '請填寫要給主管的建議' : undefined} />
      <Alert color="gray" variant="light" p="sm">
        <Text size="sm">主管只會看到這段文字，看不到面談紀錄、診斷或健康數值。請勿寫入醫療內容。</Text>
      </Alert>
      {send.isError && <Text size="sm" c="var(--yutis-bad)">{saveProblem(send.error)}</Text>}
      <Group justify="flex-end">
        <Button variant="default" onClick={onClose}>取消</Button>
        <Button loading={send.isPending} onClick={submit}>送出通知</Button>
      </Group>
    </Stack>
  );
}
