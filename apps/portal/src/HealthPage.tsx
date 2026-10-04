import { Badge, Button, Card, Divider, Group, Skeleton, Stack, Text } from '@mantine/core';
import { IconDownload } from '@tabler/icons-react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { GradeBadge } from '@yutis/ui';
import { Fragment } from 'react';
import { useTranslation } from 'react-i18next';
import { api, healthQuery } from './api';
import { formatDate } from './dates';
import { burnoutLevel, examViews, surveyViews, workloadViews, type ExamView, type SurveyView, type WorkloadView } from './health';
import { ErrorNote, LoadError, Page, Section } from './Page';

const TONE = ['ok', 'warn', 'bad'] as const;

/** 我的健康: the employee's own health checks, NMQ and overwork results (個資法第 3 條), and a copy to download. */
export function HealthPage() {
  const { t } = useTranslation();
  const health = useQuery(healthQuery);
  const download = useMutation({ mutationFn: downloadExport });

  return (
    <Page title={t('health.title')}>
      <Card padding="md">
        <Stack gap="sm">
          <Text size="sm" c="dimmed">{t('health.intro')}</Text>
          <Button variant="default" leftSection={<IconDownload size={18} />} loading={download.isPending} onClick={() => download.mutate()}>
            {t('health.download')}
          </Button>
          {download.isError && <ErrorNote>{t('health.downloadFailed')}</ErrorNote>}
        </Stack>
      </Card>

      {health.isPending && <><Skeleton h={220} radius="lg" /><Skeleton h={120} radius="lg" /></>}
      {health.isError && <LoadError onRetry={() => void health.refetch()} />}
      {health.isSuccess && (
        <>
          <Section title={t('health.exams')}>
            {examViews(health.data.exams).map((e, i) => <ExamCard key={`${e.examDate}-${i}`} exam={e} />)}
            {health.data.exams.length === 0 && <Empty text={t('health.examsEmpty')} />}
            {health.data.exams.length > 0 && <GradeLegend />}
          </Section>
          <Section title={t('health.surveys')}>
            {surveyViews(health.data.surveys).map((s, i) => <SurveyCard key={i} survey={s} />)}
            {health.data.surveys.length === 0 && <Empty text={t('health.surveysEmpty')} />}
          </Section>
          <Section title={t('health.workload')}>
            {workloadViews(health.data.workload).map((w, i) => <WorkloadCard key={i} item={w} />)}
            {health.data.workload.length === 0 && <Empty text={t('health.workloadEmpty')} />}
          </Section>
        </>
      )}
    </Page>
  );
}

/** GET /api/portal/health/export is a JSON file (Content-Disposition: attachment); fetch it so a lapsed session is caught like any other call. */
async function downloadExport() {
  const { data: blob, response } = await api.GET('/api/portal/health/export', { parseAs: 'blob' });
  const name = /filename="?([^";]+)"?/.exec(response.headers.get('content-disposition') ?? '')?.[1] ?? 'my-health-data.json';
  const url = URL.createObjectURL(blob!);
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function Empty({ text }: { text: string }) {
  return <Card padding="md"><Text c="dimmed" size="sm">{text}</Text></Card>;
}

function ExamCard({ exam }: { exam: ExamView }) {
  const { t, i18n } = useTranslation();
  return (
    <Card padding="md">
      <Group justify="space-between" wrap="nowrap" align="flex-start" gap="sm">
        <Text fw={700}>{formatDate(exam.examDate, i18n.language)}</Text>
        {exam.gradeMax && (
          <Group gap={6} wrap="nowrap" style={{ flexShrink: 0 }}>
            <Text size="xs" c="dimmed" style={{ whiteSpace: 'nowrap' }}>{t('health.highest')}</Text>
            <GradeBadge grade={exam.gradeMax} />
          </Group>
        )}
      </Group>
      <Text size="sm" c="dimmed">{[exam.kind, exam.clinic].filter(Boolean).join(' · ')}</Text>
      <Stack gap={0} mt="sm">
        {exam.items.map((item, i) => (
          <Fragment key={item.code}>
            {i > 0 && <Divider color="var(--yutis-line)" />}
            <Group justify="space-between" wrap="nowrap" py={8} gap="sm">
              <Text size="sm" style={{ minWidth: 0 }}>{t(`health.items.${item.code}`, { defaultValue: item.name })}</Text>
              <Group gap={8} wrap="nowrap" style={{ flexShrink: 0 }}>
                <Text size="sm" fw={600}>{item.value ?? '—'}{item.unit && <Text span size="xs" c="dimmed" fw={400}> {item.unit}</Text>}</Text>
                <GradeBadge grade={item.grade} />
              </Group>
            </Group>
          </Fragment>
        ))}
      </Stack>
    </Card>
  );
}

/** The grade badges' meaning in the reader's language (the badge's own tooltip is Chinese). */
function GradeLegend() {
  const { t } = useTranslation();
  const grades = t('health.grades', { returnObjects: true }) as string[];
  return (
    <Group gap="md" px={4} aria-label={t('health.gradeLegend')}>
      {grades.map((label, i) => (
        <Group key={i} gap={6} wrap="nowrap">
          <GradeBadge grade={(i + 1) as 1 | 2 | 3 | 4} />
          <Text size="xs" c="dimmed">{label}</Text>
        </Group>
      ))}
    </Group>
  );
}

function SurveyCard({ survey }: { survey: SurveyView }) {
  const { t, i18n } = useTranslation();
  return (
    <Card padding="md">
      <Text fw={700}>{survey.dispatch}</Text>
      {survey.filledAt && <Text size="sm" c="dimmed">{formatDate(survey.filledAt, i18n.language)}</Text>}
      {survey.maxScore != null && <Text mt="sm">{t('health.maxScore', { score: survey.maxScore })}</Text>}
      {survey.suspectedHazard != null && (
        <Text size="sm" mt={4} c={survey.suspectedHazard ? 'var(--yutis-warn)' : 'dimmed'}>
          {t(survey.suspectedHazard ? 'health.suspected' : 'health.notSuspected')}
        </Text>
      )}
    </Card>
  );
}

function ToneBadge({ level, children }: { level: 0 | 1 | 2; children: string }) {
  const tone = TONE[level];
  return <Badge styles={{ root: { background: `var(--yutis-${tone}-weak)`, color: `var(--yutis-${tone})`, textTransform: 'none', fontWeight: 600 } }}>{children}</Badge>;
}

function WorkloadCard({ item }: { item: WorkloadView }) {
  const { t, i18n } = useTranslation();
  const level = t('health.burnout', { returnObjects: true }) as string[];
  const score = (kind: 'personal' | 'work', v: number | null) => (
    <Group justify="space-between" wrap="nowrap" py={6}>
      <Text size="sm">{t(`health.${kind}`)}</Text>
      {v == null
        ? <Text size="sm" c="dimmed">{t('health.notFilled')}</Text>
        : <Group gap={8} wrap="nowrap"><Text size="sm" fw={600}>{t('health.score', { score: v })}</Text><ToneBadge level={burnoutLevel(kind, v)}>{level[burnoutLevel(kind, v)]!}</ToneBadge></Group>}
    </Group>
  );
  return (
    <Card padding="md">
      <Text fw={700}>{t('health.assessedOn', { date: formatDate(item.sentOn, i18n.language) })}</Text>
      <Stack gap={0} mt={6}>
        {score('personal', item.personalBurnout)}
        <Divider color="var(--yutis-line)" />
        {score('work', item.workBurnout)}
      </Stack>
      <Card mt="sm" padding="sm" radius="md" bg="var(--yutis-surface2)">
        {item.riskLevel == null
          ? <Text size="sm" c="dimmed">{t('health.incomplete')}</Text>
          : (
            <Group gap={8} wrap="nowrap" align="center">
              <ToneBadge level={item.riskLevel}>{(t('health.risk', { returnObjects: true }) as string[])[item.riskLevel]!}</ToneBadge>
              <Text size="sm">{(t('health.advice', { returnObjects: true }) as string[])[item.riskLevel]}</Text>
            </Group>
          )}
      </Card>
    </Card>
  );
}
