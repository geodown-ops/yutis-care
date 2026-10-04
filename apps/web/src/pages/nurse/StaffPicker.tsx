/* How staff pickers show each person: name and role, with the work email under it so same-name people differ. */
import { Stack, Text, type ComboboxItem, type ComboboxLikeRenderOptionInput, type SelectProps } from '@mantine/core';
import { staffFilter, type StaffOption } from './staff';

export function renderStaffOption({ option }: ComboboxLikeRenderOptionInput<ComboboxItem>) {
  const o = option as StaffOption;
  return (
    <Stack gap={0}>
      <Text size="sm">{o.title ?? o.label}</Text>
      {o.email && <Text size="xs" c="dimmed">{o.email}</Text>}
    </Stack>
  );
}

/** Spread into a Select of staffOptions(): the email under each name, and searching by email too. */
export const staffSelectProps = { renderOption: renderStaffOption, filter: staffFilter } satisfies Pick<SelectProps, 'renderOption' | 'filter'>;
