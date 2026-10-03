/* Records an employee is asked to confirm (員工確認), shared by the portal and the emailed one-time links. */
import { ApiProperty } from '@nestjs/swagger';
import { employeeAcknowledgements, maternalInterviews, type Tx } from '@yutis/db';
import { eq } from 'drizzle-orm';

export class AcknowledgementDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ example: '母性健康保護面談紀錄' }) title!: string;
  @ApiProperty({ type: 'object', additionalProperties: true, description: '要確認的內容（不含醫護內部紀錄）' }) content!: Record<string, unknown>;
  @ApiProperty({ type: String, format: 'date-time', nullable: true }) confirmedAt!: Date | null;
  @ApiProperty({ type: String, nullable: true }) comment!: string | null;
}

/** What the employee sees for one acknowledgement: the agreed arrangement, never the staff's own notes. */
export async function acknowledgementDocument(tx: Tx, ack: typeof employeeAcknowledgements.$inferSelect): Promise<AcknowledgementDto> {
  let title = '紀錄確認';
  let content: Record<string, unknown> = {};
  if (ack.subjectTable === 'maternal_interviews') {
    const [iv] = await tx.select().from(maternalInterviews).where(eq(maternalInterviews.id, ack.subjectId));
    title = '母性健康保護面談紀錄';
    content = iv ? { interviewedOn: iv.interviewedOn, fitAdvice: iv.fitAdvice, limits: iv.limits, agreedArrangement: iv.agreedArrangement } : {};
  }
  return { id: ack.id, title, content, confirmedAt: ack.confirmedAt, comment: ack.comment };
}
