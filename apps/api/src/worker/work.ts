/* What the worker does: build export files, and list rows past their retention date. Each runs one tenant at a time. */
import { exportFiles, retentionFindings, tenants, users, withTenant, type Db, type Tx } from '@yutis/db';
import { eq, sql } from 'drizzle-orm';
import { siteAccess } from '../auth/site-access.js';
import { CLINICAL_ROLES } from '../auth/permissions.js';
import type { TenantCrypto } from '../core/crypto.js';
import { computeReport, isReport, loadReportData, type ReportFilters } from '../reports/reports.js';
import { reportPdf, reportXlsx } from '../reports/render.js';

/** Export files can be downloaded for this long after they are built. */
export const EXPORT_TTL_HOURS = 24;

export interface ReportExportParams { kind: 'report'; report: string; type: string; filters: ReportFilters }

/** The report the requester would see on screen (their sites; de-identified unless clinical), as a file. */
export async function runExport(db: Db, crypto: TenantCrypto, tenantId: string, exportId: string): Promise<void> {
  await withTenant(db, tenantId, async tx => {
    const [job] = await tx.select().from(exportFiles).where(eq(exportFiles.id, exportId));
    if (!job || job.status === 'done') return;
    await tx.update(exportFiles).set({ status: 'running' }).where(eq(exportFiles.id, exportId));
  });
  try {
    await withTenant(db, tenantId, async tx => {
      const [job] = await tx.select().from(exportFiles).where(eq(exportFiles.id, exportId));
      const params = job!.params as ReportExportParams;
      const [user] = await tx.select().from(users).where(eq(users.id, job!.requestedBy));
      const [tenant] = await tx.select({ name: tenants.name }).from(tenants);
      if (!user?.active || !isReport(params.report, params.type)) throw new Error('Requester inactive or unknown report');
      const access = await siteAccess(tx, user.id);
      const data = await loadReportData(tx, [...access.assigned, ...access.breakGlass].map(s => s.id), params.filters);
      const report = computeReport(params.report, params.type, data, !(CLINICAL_ROLES as readonly string[]).includes(user.role));
      const meta = { tenantName: tenant!.name, exportedBy: user.name, exportedAt: new Date() };
      const file = job!.format === 'xlsx' ? await reportXlsx(report, meta) : await reportPdf(report, meta);
      await tx.update(exportFiles).set({
        status: 'done', fileName: `${report.title}.${job!.format}`, contentEnc: await crypto.encrypt(tenantId, file.toString('base64')),
        finishedAt: new Date(), expiresAt: new Date(Date.now() + EXPORT_TTL_HOURS * 3_600_000),
      }).where(eq(exportFiles.id, exportId));
    });
  } catch (error) {
    await withTenant(db, tenantId, tx => tx.update(exportFiles).set({ status: 'failed', error: 'Export failed', finishedAt: new Date() }).where(eq(exportFiles.id, exportId)));
    throw error;
  }
}

/** Tables with a statutory retention date, and the column naming whose data each row is. */
export const RETENTION_TABLES = [
  { table: 'health_exams', employee: 'employee_id' },
  { table: 'assist_records', employee: 'employee_id' },
  { table: 'ergo_surveys', employee: 'employee_id' },
  { table: 'workload_assessments', employee: 'employee_id' },
  { table: 'maternal_cases', employee: 'employee_id' },
  { table: 'violence_incidents', employee: 'victim_employee_id' },
] as const;

/** Record every row whose retain_until has passed, for manual review. Never deletes anything. Returns rows found. */
export async function scanRetention(tx: Tx, tenantId: string): Promise<number> {
  let found = 0;
  for (const { table, employee } of RETENTION_TABLES) {
    const { rows } = await tx.execute<{ id: string; employee_id: string | null; retain_until: string }>(
      sql`select id, ${sql.raw(employee)} as employee_id, retain_until::text from ${sql.raw(table)} where retain_until < (now() at time zone 'Asia/Taipei')::date`);
    if (!rows.length) continue;
    await tx.insert(retentionFindings)
      .values(rows.map(r => ({ tenantId, tableName: table, rowId: r.id, employeeId: r.employee_id, retainUntil: r.retain_until })))
      .onConflictDoNothing();
    found += rows.length;
  }
  return found;
}

/** The nightly scan over every active tenant. Needs the worker role (yutis_worker) to list tenants. */
export async function runRetentionScan(db: Db): Promise<Record<string, number>> {
  const { rows } = await db.execute<{ id: string }>(sql`select id from worker_tenant_ids()`);
  const result: Record<string, number> = {};
  for (const { id } of rows) result[id] = await withTenant(db, id, tx => scanRetention(tx, id));
  return result;
}
