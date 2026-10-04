import { createFileRoute } from '@tanstack/react-router';
import { AccountPage } from '../../AccountPage';

export const Route = createFileRoute('/_employee/account')({ component: AccountPage });
