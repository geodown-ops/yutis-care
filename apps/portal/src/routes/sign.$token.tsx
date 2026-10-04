import { createFileRoute } from '@tanstack/react-router';
import { SignLinkPage } from '../SignLinkPage';

/** Emailed one-time confirmation links; no session needed, so it sits outside the _employee layout. */
export const Route = createFileRoute('/sign/$token')({
  component: function SignLink() {
    const { token } = Route.useParams();
    return <SignLinkPage token={token} />;
  },
});
