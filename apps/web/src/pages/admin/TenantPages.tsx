/* Company profile and sign-in settings: read-only, from GET /api/tenant. Changes go through the platform operator (Yutis). */
import { Box, Card, Group, Image, Stack, Table, Text } from '@mantine/core';
import type { LoginMethod } from '@yutis/api-client';
import type { ReactNode } from 'react';
import { AnchorLink } from '../../links';
import { useTenant } from '../../session';
import { AdminTitle, InfoNote, ToneBadge } from './ui';

function Rows({ rows }: { rows: [string, ReactNode][] }) {
  return (
    <Table verticalSpacing="sm">
      <Table.Tbody>
        {rows.map(([label, value]) => (
          <Table.Tr key={label}><Table.Td c="dimmed" w={140} style={{ verticalAlign: 'top' }}>{label}</Table.Td><Table.Td>{value}</Table.Td></Table.Tr>
        ))}
      </Table.Tbody>
    </Table>
  );
}

const Mono = ({ children }: { children: ReactNode }) => <Text span ff="monospace" size="sm" style={{ wordBreak: 'break-all' }}>{children}</Text>;

/** 公司資料與品牌 */
export function CompanyPage() {
  const tenant = useTenant();
  const origin = window.location.origin;
  return (
    <Stack gap="lg" maw={880}>
      <AdminTitle title="公司資料與品牌" description="顯示在後台、員工端與登入頁的公司名稱、網址與標誌。" />
      <Card>
        <Rows rows={[
          ['公司名稱', <Text fw={600} key="n">{tenant.name}</Text>],
          ['子網域', <Mono key="s">{tenant.subdomain}</Mono>],
          ['後台網址', <Mono key="b">{origin}/</Mono>],
          ['員工端網址', <Mono key="e">{origin}/me/</Mono>],
          ['公司標誌', tenant.logoUrl
            ? <Box key="l" p="sm" w="fit-content" style={{ background: 'var(--yutis-surface2)', borderRadius: 'var(--mantine-radius-md)' }}><Image src={tenant.logoUrl} alt={`${tenant.name} 標誌`} h={48} w="auto" fit="contain" /></Box>
            : <Text key="l" c="dimmed" size="sm">尚未設定</Text>],
        ]} />
      </Card>
      <InfoNote>公司名稱、網址與標誌由 Yutis 平台設定，這裡只能查看。需要修改時，請聯絡 Yutis 客服。</InfoNote>
    </Stack>
  );
}

const METHODS: { method: LoginMethod; label: string; hint: string }[] = [
  { method: 'sso', label: '公司帳號（SSO）', hint: '以公司的 Google、Microsoft 或 SAML 帳號登入。' },
  { method: 'email_otp', label: 'Email 登入連結', hint: '寄送一次性登入連結到 Email，不需要密碼。' },
  { method: 'password', label: 'Email 與密碼', hint: '以 Email 和密碼登入。' },
  { method: 'sms', label: '手機簡訊驗證碼', hint: '以手機號碼收簡訊驗證碼登入。' },
  { method: 'dev', label: '開發與示範登入', hint: '不需要密碼，只在本機開發與示範站開啟。' },
];

/** 登入設定 */
export function LoginSettingsPage() {
  const tenant = useTenant();
  const enabled = new Set(tenant.loginMethods);
  const idp = tenant.identityPlatform;
  // Dev sign-in is only worth mentioning where it is on.
  const methods = METHODS.filter(m => m.method !== 'dev' || enabled.has('dev'));
  return (
    <Stack gap="lg" maw={880}>
      <AdminTitle title="登入設定" description={<>登入頁提供的登入方式。只有在<AnchorLink to="/admin/accounts" size="sm">帳號與權限</AnchorLink>邀請的人員能登入後台；員工以員工主檔的 Email 或手機登入員工端。</>} />
      <Card>
        <Text fw={600} size="lg" mb="xs">登入方式</Text>
        <Table verticalSpacing="sm">
          <Table.Tbody>
            {methods.map(m => (
              <Table.Tr key={m.method}>
                <Table.Td>
                  <Text fw={600} size="sm">{m.label}</Text>
                  <Text size="xs" c="dimmed">{m.hint}</Text>
                </Table.Td>
                <Table.Td w={100} ta="right">{enabled.has(m.method) ? <ToneBadge tone="ok">已啟用</ToneBadge> : <ToneBadge tone="muted">未啟用</ToneBadge>}</Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </Card>
      <Card>
        <Text fw={600} size="lg" mb="xs">公司帳號（SSO）</Text>
        {!idp ? (
          <Text size="sm" c="dimmed">這個網址沒有使用 Identity Platform 登入服務（本機開發或示範站）。</Text>
        ) : (
          <Rows rows={[
            ['SSO 提供者', idp.providers.length
              ? <Stack key="p" gap={6}>{idp.providers.map(p => <Group key={p.id} gap="xs"><Text size="sm" fw={600}>{p.label}</Text><Mono>{p.id}</Mono></Group>)}</Stack>
              : <Text key="p" size="sm" c="dimmed">尚未設定</Text>],
            ['登入服務租戶 ID', <Mono key="t">{idp.tenantId}</Mono>],
          ]} />
        )}
      </Card>
      <InfoNote>登入方式與 SSO 由 Yutis 平台設定，這裡只能查看。需要新增公司帳號登入或變更登入方式時，請聯絡 Yutis 客服。</InfoNote>
    </Stack>
  );
}
