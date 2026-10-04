import { describe, expect, it } from 'vitest';
import { nurseAccess } from './access';

const clinical = { features: ['nurse-home', 'employees', 'cases', 'programs', 'service-records', 'reports'], dataCategories: ['identity', 'work', 'health', 'medical'] } as const;

describe('nurse actions by role', () => {
  it('gives nurses and doctors every action', () => {
    expect(nurseAccess({ role: '職護', ...clinical, features: [...clinical.features], dataCategories: [...clinical.dataCategories] })).toEqual({ cases: true, records: true, exams: true });
    expect(nurseAccess({ role: '職醫', features: [...clinical.features], dataCategories: [...clinical.dataCategories] })).toEqual({ cases: true, records: true, exams: true });
  });

  it('gives HR none of them', () => {
    expect(nurseAccess({ role: '人資', features: ['employees', 'programs', 'service-records', 'reports'], dataCategories: ['identity', 'work'] }))
      .toEqual({ cases: false, records: false, exams: false });
  });
});
