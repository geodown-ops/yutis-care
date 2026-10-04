import { createFileRoute } from '@tanstack/react-router';
import { canRunErgo } from '../../pages/programs/ergo';
import { ErgoPage, NoProgrammeAccess } from '../../pages/programs/ErgoPage';
import { ergoDispatchesQuery } from '../../queries';
import { meQuery, useMe } from '../../session';

export interface ErgoSearch { dispatch?: string }

export const Route = createFileRoute('/_app/programs/ergo')({
  // The selected batch lives in the URL so it survives a reload and can be shared.
  validateSearch: (s: Record<string, unknown>): ErgoSearch => (typeof s.dispatch === 'string' && s.dispatch ? { dispatch: s.dispatch } : {}),
  loader: async ({ context: { queryClient } }) => {
    const me = await queryClient.ensureQueryData(meQuery);
    if (me.kind === 'staff' && canRunErgo(me)) await queryClient.ensureQueryData(ergoDispatchesQuery);
  },
  component: function Ergo() {
    const me = useMe();
    const { dispatch } = Route.useSearch();
    const navigate = Route.useNavigate();
    if (!canRunErgo(me)) {
      return <NoProgrammeAccess title="人因性危害預防">肌肉骨骼症狀問卷的作答與結果屬於健康資料，只有職護、職醫可以查看與處理。</NoProgrammeAccess>;
    }
    return <ErgoPage dispatchId={dispatch} onDispatch={id => void navigate({ search: id ? { dispatch: id } : {}, replace: true })} />;
  },
});
