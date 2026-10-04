import { createFileRoute } from '@tanstack/react-router';
import { SignPage } from '../pages/service-records/SignPage';

/**
 * Emailed one-time sign-off link (附表八, 不法侵害預防措施查核): public, outside the signed-in layout (no login, no menu).
 * An employee's confirmation link that lands here goes on to the employee portal.
 */
export const Route = createFileRoute('/sign/$token')({
  component: function Sign() {
    const { token } = Route.useParams();
    return <SignPage token={token} />;
  },
});
