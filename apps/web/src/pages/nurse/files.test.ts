import { describe, expect, it } from 'vitest';
import { attachmentName } from './files';

describe('attachmentName', () => {
  it('reads the encoded UTF-8 name the API sends', () => {
    const header = `attachment; filename*=UTF-8''${encodeURIComponent('仁安診所健檢匯入範本.xlsx')}`;
    expect(attachmentName(header)).toBe('仁安診所健檢匯入範本.xlsx');
  });

  it('falls back to a plain file name', () => {
    expect(attachmentName('attachment; filename="report.pdf"')).toBe('report.pdf');
    expect(attachmentName('attachment; filename=report.xlsx')).toBe('report.xlsx');
  });

  it('returns null without a name', () => {
    expect(attachmentName(null)).toBeNull();
    expect(attachmentName('attachment')).toBeNull();
  });
});
