/* Records an employee is asked to confirm (員工確認), shared by the portal and the emailed one-time links. */
import { ApiProperty } from '@nestjs/swagger';
import { employeeAcknowledgements, employees, maternalInterviews, type Tx } from '@yutis/db';
import { eq } from 'drizzle-orm';
import { acknowledgementTitle } from '../portal/titles.js';

export class AcknowledgementContentDto {
  @ApiProperty({ type: String, format: 'date', description: '面談日期' }) interviewedOn!: string;
  @ApiProperty({ type: String, nullable: true, description: '適性評估（工作安排建議）' }) fitAdvice!: string | null;
  @ApiProperty({ type: [String], description: '工作限制' }) limits!: string[];
  @ApiProperty({ type: String, nullable: true, description: '雙方同意的工作調整' }) agreedArrangement!: string | null;
}

export class AcknowledgementDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ example: '母性健康保護面談紀錄', description: '依員工的員工端語言' }) title!: string;
  @ApiProperty({ type: AcknowledgementContentDto, nullable: true, description: '要確認的內容（不含醫護內部紀錄）；找不到原始紀錄時為 null' })
  content!: AcknowledgementContentDto | null;
  @ApiProperty({ type: String, format: 'date-time', nullable: true }) confirmedAt!: Date | null;
  @ApiProperty({ type: String, nullable: true }) comment!: string | null;
}

/** What the employee sees for one acknowledgement: the agreed arrangement, never the staff's own notes. */
export async function acknowledgementDocument(tx: Tx, ack: typeof employeeAcknowledgements.$inferSelect): Promise<AcknowledgementDto> {
  const [employee] = await tx.select({ lang: employees.lang }).from(employees).where(eq(employees.id, ack.employeeId));
  let content: AcknowledgementContentDto | null = null;
  if (ack.subjectTable === 'maternal_interviews') {
    const [iv] = await tx.select().from(maternalInterviews).where(eq(maternalInterviews.id, ack.subjectId));
    content = iv ? { interviewedOn: iv.interviewedOn, fitAdvice: iv.fitAdvice, limits: iv.limits, agreedArrangement: iv.agreedArrangement } : null;
  }
  return { id: ack.id, title: acknowledgementTitle(ack.subjectTable, employee?.lang ?? 'zh'), content, confirmedAt: ack.confirmedAt, comment: ack.comment };
}
