/*
 * Reading the Excel files tenant admins upload (organisation, employee master). Uploads are sent as the raw .xlsx body
 * (Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet). Every import is validated
 * first and writes nothing if any row is wrong; `?dryRun=true` returns the same report without writing.
 */
import { BadRequestException, UnprocessableEntityException } from '@nestjs/common';
import { ApiProperty } from '@nestjs/swagger';
import ExcelJS from 'exceljs';
import type { FastifyReply } from 'fastify';

export const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
export const MAX_IMPORT_BYTES = 10 * 1024 * 1024;

/** One data row: header → trimmed text ('' when empty); dates as YYYY-MM-DD. `row` is the Excel row number. */
export interface SheetRow { row: number; values: Record<string, string> }

export class ImportIssueDto {
  @ApiProperty({ required: false, example: '員工' }) sheet?: string;
  @ApiProperty({ description: 'Excel 列號', example: 7 }) row!: number;
  @ApiProperty({ required: false, example: '出生日期' }) column?: string;
  @ApiProperty({ example: '日期格式應為 YYYY-MM-DD' }) message!: string;
}

export interface ImportIssue { sheet?: string; row: number; column?: string; message: string }

export async function readWorkbook(body: unknown): Promise<ExcelJS.Workbook> {
  if (!Buffer.isBuffer(body) || body.length === 0) {
    throw new BadRequestException({ code: 'invalid_file', message: `Upload the .xlsx file as the request body (Content-Type: ${XLSX_MIME})` });
  }
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(body as unknown as ArrayBuffer);
  } catch {
    throw new BadRequestException({ code: 'invalid_file', message: 'Not a readable .xlsx file' });
  }
  return workbook;
}

const pad = (n: number) => String(n).padStart(2, '0');

function cellText(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return `${value.getUTCFullYear()}-${pad(value.getUTCMonth() + 1)}-${pad(value.getUTCDate())}`;
  if (typeof value === 'object') {
    if ('result' in value) return cellText(value.result as ExcelJS.CellValue);
    if ('text' in value && typeof value.text === 'string') return value.text.trim();
    if ('richText' in value) return value.richText.map(r => r.text).join('').trim();
    return '';
  }
  return String(value).trim();
}

/**
 * Rows of a sheet keyed by the header row (row 1). Checks the required headers are present; fully empty rows are skipped.
 */
export function readSheet(sheet: ExcelJS.Worksheet, required: readonly string[]): { rows: SheetRow[]; issues: ImportIssue[] } {
  const headers: string[] = [];
  sheet.getRow(1).eachCell({ includeEmpty: true }, (cell, col) => { headers[col] = cellText(cell.value); });
  const missing = required.filter(h => !headers.includes(h));
  if (missing.length) return { rows: [], issues: [{ sheet: sheet.name, row: 1, message: `缺少欄位：${missing.join('、')}` }] };
  const rows: SheetRow[] = [];
  sheet.eachRow((r, n) => {
    if (n === 1) return;
    const values: Record<string, string> = {};
    headers.forEach((h, col) => { if (h) values[h] = cellText(r.getCell(col).value); });
    if (Object.values(values).some(v => v !== '')) rows.push({ row: n, values });
  });
  return { rows, issues: [] };
}

export function findSheet(workbook: ExcelJS.Workbook, name: string): ExcelJS.Worksheet | undefined {
  return workbook.worksheets.find(w => w.name.trim() === name);
}

/** 422 with the report when a non-dry-run import has problems: nothing was written. */
export function refuseIfInvalid<T extends { issues: ImportIssue[] }>(report: T, dryRun: boolean): void {
  if (!dryRun && report.issues.length) {
    throw new UnprocessableEntityException({ code: 'import_invalid', message: `${report.issues.length} problem(s) in the file; nothing was imported`, report });
  }
}

export const isIsoDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`)) && new Date(`${s}T00:00:00Z`).toISOString().startsWith(s);
export const isEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);

export interface TemplateSheet { name: string; required: readonly string[]; optional?: readonly string[] }

/** An empty import file: one sheet per entry, the header row only, required headers bold with a 必填 note. */
export async function templateWorkbook(sheets: TemplateSheet[]): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  for (const s of sheets) {
    const sheet = workbook.addWorksheet(s.name, { views: [{ state: 'frozen', ySplit: 1 }] });
    const headers = [...s.required, ...s.optional ?? []];
    sheet.columns = headers.map(h => ({ header: h, width: Math.max(12, h.length * 2 + 4) }));
    headers.forEach((h, i) => {
      if (!s.required.includes(h)) return;
      const cell = sheet.getRow(1).getCell(i + 1);
      cell.font = { bold: true };
      cell.note = '必填';
    });
  }
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

/** Sends an .xlsx file as a download. */
export function sendXlsx(reply: FastifyReply, fileName: string, file: Buffer): Buffer {
  reply.header('Content-Type', XLSX_MIME).header('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`);
  return file;
}
