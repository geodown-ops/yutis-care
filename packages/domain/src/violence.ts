/* Workplace violence prevention (執行職務遭受不法侵害預防): likelihood × severity → risk level. */

export const VIO_LIKELIHOOD = ['可能', '不太可能', '極不可能'] as const;
export const VIO_SEVERITY = ['嚴重', '中', '輕'] as const;
export type VioLikelihood = (typeof VIO_LIKELIHOOD)[number];
export type VioSeverity = (typeof VIO_SEVERITY)[number];
export type VioRisk = '高度風險' | '中度風險' | '低度風險';

export function violenceRisk(lik: VioLikelihood | '' | null | undefined, sev: VioSeverity | '' | null | undefined): VioRisk | null {
  if (!lik || !sev) return null;
  const s = (3 - VIO_LIKELIHOOD.indexOf(lik)) * (3 - VIO_SEVERITY.indexOf(sev));
  return s >= 6 ? '高度風險' : s >= 3 ? '中度風險' : '低度風險';
}
