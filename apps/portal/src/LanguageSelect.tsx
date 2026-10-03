import { NativeSelect } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { LANGS, setLang, type Lang } from './i18n';

/** Native select: opens the phone's own picker, which reads better than a custom menu on small screens. */
export function LanguageSelect() {
  const { t, i18n } = useTranslation();
  return (
    <NativeSelect size="xs" w={128} aria-label={t('language')} value={i18n.language}
      data={Object.entries(LANGS).map(([value, label]) => ({ value, label }))}
      onChange={e => setLang(e.currentTarget.value as Lang)} />
  );
}
