import { Card, Group, Stack, Table, Text, TextInput, Title } from '@mantine/core';
import { IconSearch } from '@tabler/icons-react';
import { ageAt, type Grade } from '@yutis/domain';
import { GradeBadge } from '@yutis/ui';
import { EMPLOYEES, TODAY, gradeOf } from '../demo';
import { AnchorLink } from '../links';

/** `showHealth` is false for HR: they see identity and work arrangements only. */
export function EmployeesPage({ q, onSearch, showHealth }: { q: string; onSearch: (q: string) => void; showHealth: boolean }) {
  const rows = EMPLOYEES.filter(e => !q || e.name.includes(q) || e.id.toLowerCase().includes(q.toLowerCase()));

  return (
    <Stack gap="lg">
      <Group justify="space-between">
        <Title order={2}>員工資料</Title>
        <TextInput
          aria-label="以姓名或工號搜尋"
          placeholder="姓名或工號"
          leftSection={<IconSearch size={16} />}
          value={q}
          onChange={e => onSearch(e.currentTarget.value)}
          w={240}
        />
      </Group>
      <Card>
        <Table.ScrollContainer minWidth={640}>
          <Table verticalSpacing="sm" highlightOnHover>
            <Table.Thead>
              <Table.Tr><Table.Th>工號</Table.Th><Table.Th>姓名</Table.Th><Table.Th>部門</Table.Th><Table.Th>職稱</Table.Th><Table.Th>班別</Table.Th><Table.Th ta="right">年齡</Table.Th>{showHealth && <Table.Th>健檢最高級別</Table.Th>}</Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {rows.map(e => (
                <Table.Tr key={e.id}>
                  <Table.Td ff="monospace">{e.id}</Table.Td>
                  <Table.Td><AnchorLink to="/employees/$employeeId" params={{ employeeId: e.id }}>{e.name}</AnchorLink></Table.Td>
                  <Table.Td>{e.dept}</Table.Td>
                  <Table.Td>{e.title}</Table.Td>
                  <Table.Td>{e.shift}</Table.Td>
                  <Table.Td ta="right">{ageAt(e.birth, TODAY)}</Table.Td>
                  {showHealth && <Table.Td><GradeBadge grade={(gradeOf(e).max || null) as Grade | null} /></Table.Td>}
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
        {rows.length === 0 && <Text c="dimmed" ta="center" py="lg">找不到「{q}」，請確認姓名或工號。</Text>}
      </Card>
    </Stack>
  );
}
