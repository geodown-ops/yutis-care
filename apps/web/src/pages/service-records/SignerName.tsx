/* A signer's name: free text, with back-office staff suggested by name or email (picking one fills the email too). */
import { Combobox, Group, Text, TextInput, useCombobox } from '@mantine/core';
import { signerSuggestions, type StaffMember } from './records';

export function SignerNameInput({ value, staff, label, onChange, onPick }: {
  value: string; staff: readonly StaffMember[] | undefined; label: string; onChange: (name: string) => void; onPick: (s: StaffMember) => void;
}) {
  const combobox = useCombobox({ onDropdownClose: () => combobox.resetSelectedOption() });
  const matches = signerSuggestions(staff ?? [], value);
  return (
    <Combobox store={combobox} withinPortal onOptionSubmit={id => {
      const s = matches.find(m => m.id === id);
      if (s) onPick(s);
      combobox.closeDropdown();
    }}>
      <Combobox.Target>
        <TextInput aria-label={label} placeholder="姓名（可依姓名或 Email 找人員）" maxLength={100} value={value} autoComplete="off"
          onChange={e => { onChange(e.currentTarget.value); combobox.openDropdown(); combobox.updateSelectedOptionIndex(); }}
          onClick={() => combobox.openDropdown()} onFocus={() => combobox.openDropdown()} onBlur={() => combobox.closeDropdown()} />
      </Combobox.Target>
      <Combobox.Dropdown hidden={matches.length === 0}>
        <Combobox.Options mah={260} style={{ overflowY: 'auto' }}>
          {matches.map(s => (
            <Combobox.Option value={s.id} key={s.id}>
              <Group gap={6} wrap="nowrap"><Text size="sm">{s.name}</Text><Text size="xs" c="dimmed">{s.role}</Text></Group>
              <Text size="xs" c="dimmed">{s.email}</Text>
            </Combobox.Option>
          ))}
        </Combobox.Options>
      </Combobox.Dropdown>
    </Combobox>
  );
}
