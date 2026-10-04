import { createFileRoute } from '@tanstack/react-router';
import { SignPage } from '../pages/service-records/SignPage';

/** Emailed one-time sign-off link for 附表八 signers: public, outside the signed-in layout (no login, no menu). */
export const Route = createFileRoute('/sign/$token')({
  component: function Sign() {
    const { token } = Route.useParams();
    return <SignPage token={token} />;
  },
});
