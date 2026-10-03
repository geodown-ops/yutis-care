import { Card, Stack, Text, Title } from '@mantine/core';
import { createFileRoute } from '@tanstack/react-router';
import { TENANTS } from '../demo';

export const Route = createFileRoute('/tenants/$tenantId')({
  component: function TenantDetail() {
    const { tenantId } = Route.useParams();
    const t = TENANTS.find(x => x.id === tenantId);
    return (
      <Stack gap="lg" maw={720}>
        <Title order={2}>{t?.name ?? '找不到這個租戶'}</Title>
        <Card><Text c="dimmed">租戶詳情（方案與人數上限、啟用模組、SSO 設定狀態、用量統計、租戶管理員名單）會在平台 API 完成後製作。</Text></Card>
      </Stack>
    );
  },
});
