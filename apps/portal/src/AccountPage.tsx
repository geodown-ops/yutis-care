import { Button, Card, Divider, Group, Modal, Skeleton, Stack, Text } from '@mantine/core';
import { IconLogout } from '@tabler/icons-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { data, type Schemas } from '@yutis/api-client';
import { Fragment, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, clearSession, consentsQuery, profileQuery } from './api';
import { forgetUnsaved } from './drafts';
import { formatDate } from './dates';
import { LanguageSelect } from './LanguageSelect';
import { ErrorNote, LoadError, Page, Section } from './Page';

type Consent = Schemas['ConsentDto'];

/** 我的: who I am in the employee master, language, my notice and consent records, sign out. */
export function AccountPage() {
  const { t } = useTranslation();
  const profile = useQuery(profileQuery);
  const consents = useQuery(consentsQuery);

  return (
    <Page title={t('tabs.account')}>
      {profile.isPending && <Skeleton h={150} radius="lg" />}
      {profile.isError && <LoadError onRetry={() => void profile.refetch()} />}
      {profile.isSuccess && (
        <Card padding="md">
          <Text fz={20} fw={700}>{profile.data.name}</Text>
          <Stack gap={0} mt="xs">
            {([['empNo', profile.data.empNo], ['site', profile.data.site], ['department', profile.data.department]] as const).map(([key, value], i) => (
              <Fragment key={key}>
                {i > 0 && <Divider color="var(--yutis-line)" />}
                <Group justify="space-between" wrap="nowrap" py={8}>
                  <Text size="sm" c="dimmed">{t(`account.${key}`)}</Text>
                  <Text size="sm" fw={600} ta="right">{value}</Text>
                </Group>
              </Fragment>
            ))}
          </Stack>
        </Card>
      )}

      <Card padding="md">
        <Group justify="space-between" wrap="nowrap">
          <Text fw={600}>{t('account.language')}</Text>
          <LanguageSelect />
        </Group>
      </Card>

      <Section title={t('account.consents')}>
        {consents.isPending && <Skeleton h={80} radius="lg" />}
        {consents.isError && <LoadError onRetry={() => void consents.refetch()} />}
        {consents.isSuccess && consents.data.length === 0 && <Card padding="md"><Text size="sm" c="dimmed">{t('account.consentsEmpty')}</Text></Card>}
        {consents.data?.map(c => <ConsentCard key={c.id} consent={c} />)}
      </Section>

      <SignOutButton />
    </Page>
  );
}

function ConsentCard({ consent: c }: { consent: Consent }) {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const [asking, setAsking] = useState(false);
  const withdraw = useMutation({
    mutationFn: () => data(api.POST('/api/portal/consents/{id}/withdraw', { params: { path: { id: c.id } } })),
    onSuccess: () => { setAsking(false); return queryClient.invalidateQueries({ queryKey: consentsQuery.queryKey }); },
  });
  const lang = i18n.language;

  return (
    <Card padding="md">
      <Text fw={600}>{c.purpose}</Text>
      <Text size="sm" c="dimmed">
        {[t(`account.kinds.${c.kind}`), t('account.version', { version: c.documentVersion }), formatDate(c.givenAt, lang)].join(' · ')}
      </Text>
      {c.withdrawnAt && <Text size="sm" mt={4} c="var(--yutis-warn)">{t('account.withdrawnAt', { date: formatDate(c.withdrawnAt, lang) })}</Text>}
      {c.kind === 'consent' && !c.withdrawnAt && (
        <Button variant="default" size="xs" mt="sm" style={{ alignSelf: 'flex-start' }} onClick={() => setAsking(true)}>{t('account.withdraw')}</Button>
      )}
      <Modal opened={asking} onClose={() => setAsking(false)} title={<Text fw={700}>{t('account.withdrawTitle')}</Text>} centered radius="lg"
        styles={{ content: { background: 'var(--yutis-surface)' }, header: { background: 'var(--yutis-surface)' } }}>
        <Stack gap="md">
          <Text size="sm" fw={600}>{c.purpose}</Text>
          <Text size="sm" c="dimmed">{t('account.withdrawBody')}</Text>
          {withdraw.isError && <ErrorNote>{t('account.withdrawFailed')}</ErrorNote>}
          <Group grow>
            <Button variant="default" onClick={() => setAsking(false)}>{t('account.cancel')}</Button>
            <Button color="var(--yutis-bad)" loading={withdraw.isPending} onClick={() => withdraw.mutate()}>{t('account.withdraw')}</Button>
          </Group>
        </Stack>
      </Modal>
    </Card>
  );
}

/** Ends the session (POST /api/auth/sign-out), forgets everything cached, and goes to /login. */
export function SignOutButton({ label }: { label?: string }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const signOut = useMutation({
    mutationFn: () => data(api.POST('/api/auth/sign-out')),
    onSettled: async () => {
      // Signed out on the server or not, this device should not keep showing the last person's data.
      clearSession(queryClient);
      forgetUnsaved();
      await navigate({ to: '/login' });
    },
  });
  return (
    <Button variant="default" size="md" leftSection={<IconLogout size={18} />} loading={signOut.isPending} onClick={() => signOut.mutate()}>
      {label ?? t('account.signOut')}
    </Button>
  );
}
