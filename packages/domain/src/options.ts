/*
 * Choices the programme forms offer (人因、異常工作負荷、母性), as in the prototype. Forms show them as checkboxes or
 * selects; the API still accepts other wording where a form lets people type their own.
 */

/** 工作區分 after a workload interview. */
export const WORKLOAD_FITNESS = ['一般工作', '工作限制', '需休假'] as const;
/** 調整或縮短工作時間 */
export const ADJUST_HOURS = ['縮短工時', '限制加班', '禁止加班', '調整上下班時間'] as const;
/** 變更工作 */
export const CHANGE_WORK = ['調整為常日班', '變更作業內容', '變更工作場所', '暫停出差'] as const;
/** 人因性危害改善措施 */
export const ERGO_MEASURES = ['調整工作檯高度', '提供搬運輔具', '工作輪調', '增加休息頻率', '轉介復健科', '肌力伸展衛教'] as const;
/** 特別危害健康作業類別 */
export const SPECIAL_OPERATIONS = ['高溫作業', '噪音作業', '游離輻射作業', '粉塵作業', '有機溶劑作業', '鉛作業', '正己烷作業', '特定化學物質作業'] as const;
/** 作業型態 of a workplace (maternal environment assessment). */
export const SHIFT_TYPES = ['常日班', '輪班', '其他'] as const;
