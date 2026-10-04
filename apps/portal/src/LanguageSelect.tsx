import { NativeSelect } from '@mantine/core';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { data } from '@yutis/api-client';
import { useTranslation } from 'react-i18next';
import { api, meQuery, profileQuery, tasksQuery } from './api';
import { LANGS, setLang, type Lang } from './i18n';

/**
 * Native select: opens the phone's own picker, which reads better than a custom menu on small screens. The choice is
 * kept on this device, and for a signed-in employee also on their account (PUT /api/portal/profile), which decides the
 * language of task titles and of the records they confirm, on every device.
 */
export function LanguageSelect() {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const save = useMutation({
    mutationFn: (lang: Lang) => data(api.PUT('/api/portal/profile', { body: { lang } })),
    onSuccess: profile => {
      queryClient.setQueryData(profileQuery.queryKey, profile);
      queryClient.setQueryData(meQuery.queryKey, me => (me?.kind === 'employee' ? { ...me, kind: 'employee' as const, lang: profile.lang } : me));
      // Titles come back in the new language.
      void queryClient.invalidateQueries({ queryKey: tasksQuery.queryKey });
      void queryClient.invalidateQueries({ queryKey: ['portal', 'acknowledgements'] });
    },
  });
  const change = (lang: Lang) => {
    setLang(lang);
    // Not on the sign-in page or an emailed link, where nobody may be signed in.
    if (queryClient.getQueryData(meQuery.queryKey)?.kind === 'employee') save.mutate(lang);
  };
  return (
    <NativeSelect size="xs" w={128} aria-label={t('language')} value={i18n.language}
      data={Object.entries(LANGS).map(([value, label]) => ({ value, label }))}
      onChange={e => change(e.currentTarget.value as Lang)} />
  );
}
