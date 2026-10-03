/* Assistance records (協助紀錄): the fixed choices on the form, carried over from the prototype (data.js). */

/** 諮詢類型: which programme or finding the consultation is about. */
export const CONSULT_TYPES = [
  '健康檢查／體格檢查報告異常',
  '特殊健檢異常：危害類別與分級',
  '人因性危害預防計畫',
  '執行職務遭受不法侵害預防計畫',
  '異常工作負荷促發疾病預防計畫',
  '工作場所母性健康保護計畫',
  '未滿 18 歲及中高齡員工',
] as const;

/** 生活指導 */
export const LIFESTYLE_ADVICE = [
  '減重', '戒菸／酒／檳榔', '飲食建議', '充足睡眠、規律作息、紓解壓力', '建立運動習慣', '定期量血壓', '定期量腰圍',
  '保持正確姿勢與適當動作方式與力道', '避免久坐久站', '避免用眼過度', '定時喝水、避免憋尿',
] as const;

export const RECORD_RESULTS = ['追蹤', '結案'] as const;
