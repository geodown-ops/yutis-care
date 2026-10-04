/* Work-arrangement advice after a workload interview (工作區分、採取措施建議): what HR and managers may see. */
import { z } from 'zod';

export const WorkAdvice = z.object({
  /** 工作區分, e.g. 一般工作、工作限制、需休假 */
  fitness: z.string().trim().max(50),
  restrictions: z.array(z.string().trim().min(1).max(100)).max(20).default([]),
  suggestion: z.string().trim().max(1000).default(''),
  /** 採取措施建議: 調整或縮短工作時間, 變更工作, 措施期間 */
  adjustHours: z.string().trim().max(50).default(''),
  changeWork: z.string().trim().max(50).default(''),
  period: z.string().trim().max(50).default(''),
}).strict();
export type WorkAdviceInput = z.infer<typeof WorkAdvice>;
/** Advice saved before the 採取措施建議 fields existed has none of them. */
export const workAdviceOf = (stored: unknown): WorkAdviceInput | null =>
  stored ? { restrictions: [], suggestion: '', adjustHours: '', changeWork: '', period: '', ...(stored as Partial<WorkAdviceInput>), fitness: (stored as WorkAdviceInput).fitness ?? '' } : null;
