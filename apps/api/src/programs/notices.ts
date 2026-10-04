/*
 * Where a work-arrangement notice to a department manager stands, for the interviews it came from: who it went to,
 * when, and whether the manager has opened it. Shown alongside workload and maternal interviews so a notice can be
 * sent (or chased) any time after the interview, not only right after saving it.
 */
import { ApiProperty } from '@nestjs/swagger';
import { managerNotices, users } from '@yutis/db';
import { and, asc, eq, inArray } from 'drizzle-orm';
import type { RequestContext } from '../core/context.js';

export class NoticeStatusDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ format: 'uuid' }) managerUserId!: string;
  @ApiProperty() managerName!: string;
  @ApiProperty({ type: String, format: 'date-time' }) sentAt!: Date;
  @ApiProperty({ type: String, format: 'date-time', nullable: true, description: '主管開啟通知的時間；尚未讀取時為 null' }) readAt!: Date | null;
}

/** Notices sent about each of `subjectIds` (interviews or maternal_interviews), oldest first. */
export async function noticesBySubject(
  ctx: RequestContext, subjectTable: 'interviews' | 'maternal_interviews', subjectIds: string[],
): Promise<Map<string, NoticeStatusDto[]>> {
  const result = new Map<string, NoticeStatusDto[]>();
  if (!subjectIds.length) return result;
  const rows = await ctx.tx.select({ n: managerNotices, managerName: users.name }).from(managerNotices)
    .innerJoin(users, eq(users.id, managerNotices.managerUserId))
    .where(and(eq(managerNotices.subjectTable, subjectTable), inArray(managerNotices.subjectId, subjectIds)))
    .orderBy(asc(managerNotices.createdAt));
  for (const { n, managerName } of rows) {
    const list = result.get(n.subjectId) ?? [];
    list.push({ id: n.id, managerUserId: n.managerUserId, managerName, sentAt: n.createdAt, readAt: n.readAt });
    result.set(n.subjectId, list);
  }
  return result;
}
