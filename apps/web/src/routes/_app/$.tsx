import { createFileRoute } from '@tanstack/react-router';
import { ALL_NAV_ITEMS } from '../../nav';
import { PlaceholderPage } from '../../pages/PlaceholderPage';

/** Menu pages that are not built yet, and unknown URLs. */
export const Route = createFileRoute('/_app/$')({
  component: function CatchAll() {
    const { _splat = '' } = Route.useParams();
    const item = ALL_NAV_ITEMS.find(i => i.path === `/${_splat}`);
    return item ? <PlaceholderPage title={item.label} /> : <PlaceholderPage title="找不到這個頁面" missing />;
  },
});
