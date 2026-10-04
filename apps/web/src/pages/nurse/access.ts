import type { StaffMe } from '@yutis/api-client';
import { canAccess } from '../../nav';

/**
 * Which nurse actions to show, mirroring the API guards: cases (cases + health), assistance records and phrases
 * (employees + medical), exam import (employees + health). Hiding is a convenience; the API enforces it.
 */
export const nurseAccess = (me: Pick<StaffMe, 'role' | 'features' | 'dataCategories'>) => ({
  cases: canAccess(me, { feature: 'cases', data: 'health' }),
  records: canAccess(me, { feature: 'employees', data: 'medical' }),
  exams: canAccess(me, { feature: 'employees', data: 'health' }),
});
