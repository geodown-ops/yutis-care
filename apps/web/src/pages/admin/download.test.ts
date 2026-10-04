import { describe, expect, it } from 'vitest';
import { fileNameFromDisposition } from './download';

describe('fileNameFromDisposition', () => {
  it('decodes the UTF-8 form the API sends', () => {
    const header = `attachment; filename*=UTF-8''${encodeURIComponent('組織架構匯入範本.xlsx')}`;
    expect(fileNameFromDisposition(header)).toBe('組織架構匯入範本.xlsx');
  });

  it('reads a plain file name, quoted or not', () => {
    expect(fileNameFromDisposition('attachment; filename="report 1.xlsx"')).toBe('report 1.xlsx');
    expect(fileNameFromDisposition('attachment; filename=report.xlsx')).toBe('report.xlsx');
  });

  it('prefers the UTF-8 form when both are given', () => {
    expect(fileNameFromDisposition(`attachment; filename="fallback.xlsx"; filename*=UTF-8''${encodeURIComponent('員工.xlsx')}`)).toBe('員工.xlsx');
  });

  it('falls back to the plain name when the encoded one is malformed', () => {
    expect(fileNameFromDisposition(`attachment; filename="a.xlsx"; filename*=UTF-8''%E7%B5`)).toBe('a.xlsx');
  });

  it('gives null without a file name', () => {
    expect(fileNameFromDisposition(null)).toBeNull();
    expect(fileNameFromDisposition('attachment')).toBeNull();
  });
});
