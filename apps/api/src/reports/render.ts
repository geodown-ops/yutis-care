/* Report files: Excel (exceljs) or PDF (pdfkit, Noto Sans TC). Every file carries who exported it and when (浮水印). */
import { createRequire } from 'node:module';
import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';
import type { Report } from './reports.js';

const require = createRequire(import.meta.url);
const FONT = require.resolve('@expo-google-fonts/noto-sans-tc/400Regular/NotoSansTC_400Regular.ttf');

export interface ExportMeta { tenantName: string; exportedBy: string; exportedAt: Date }

const stamp = (m: ExportMeta) => `${m.tenantName}｜匯出人：${m.exportedBy}｜匯出時間：${m.exportedAt.toLocaleString('zh-TW', { timeZone: 'Asia/Taipei', hour12: false })}`;
const show = (v: unknown) => (v === null ? '<5' : String(v));

export async function reportXlsx(report: Report, meta: ExportMeta): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = meta.exportedBy;
  workbook.created = meta.exportedAt;
  const sheet = workbook.addWorksheet(report.title.slice(0, 31));
  sheet.addRow([report.title]).font = { bold: true, size: 14 };
  sheet.addRow([stamp(meta)]).font = { italic: true, color: { argb: 'FF666666' } };
  sheet.addRow([]);
  for (const s of report.summary) sheet.addRow([s.label, show(s.value)]);
  sheet.addRow([]);
  sheet.addRow(report.columns).font = { bold: true };
  for (const r of report.rows) sheet.addRow(r.map(c => (c === null ? '<5' : c)));
  if (report.suppressed) sheet.addRow(['「<5」：人數少於 5 人的格子不顯示，避免識別個人。']);
  sheet.columns.forEach((c, i) => { c.width = i === 0 ? 28 : 16; });
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

export function reportPdf(report: Report, meta: ExportMeta): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 48, info: { Title: report.title, Author: meta.exportedBy } });
    const chunks: Buffer[] = [];
    doc.on('data', c => chunks.push(c as Buffer));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    doc.font(FONT);
    doc.fontSize(16).text(report.title);
    doc.moveDown(0.3).fontSize(9).fillColor('#666666').text(stamp(meta));
    doc.moveDown().fillColor('#232629').fontSize(11);
    for (const s of report.summary) doc.text(`${s.label}：${show(s.value)}`);
    doc.moveDown();
    const width = (doc.page.width - 96) / report.columns.length;
    const row = (cells: unknown[], bold = false) => {
      const y = doc.y;
      cells.forEach((c, i) => doc.fontSize(bold ? 10.5 : 10).text(show(c), 48 + i * width, y, { width: width - 6 }));
      doc.moveDown(0.4);
      doc.x = 48;
    };
    row(report.columns, true);
    for (const r of report.rows) row(r);
    if (report.suppressed) doc.moveDown().fontSize(9).text('「<5」：人數少於 5 人的格子不顯示，避免識別個人。');
    doc.end();
  });
}
