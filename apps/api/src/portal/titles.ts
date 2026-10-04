/*
 * Task titles in the employee's portal language (員工端語言). The name staff gave a survey dispatch is shown as typed.
 * Unknown languages fall back to Traditional Chinese.
 */
import { isEmployeeLang, type EmployeeLang } from '@yutis/domain';

type TitleKey = 'nmq' | 'cbi' | 'overload' | 'maternal_interview' | 'workload_interview' | 'acknowledgement';

const TITLES: Record<EmployeeLang, Record<TitleKey, string>> = {
  zh: {
    nmq: '肌肉骨骼症狀調查', cbi: '過勞量表', overload: '工時與工作型態調查',
    maternal_interview: '母性健康保護面談紀錄', workload_interview: '異常工作負荷面談結果', acknowledgement: '紀錄確認',
  },
  en: {
    nmq: 'Musculoskeletal symptom survey', cbi: 'Burnout questionnaire', overload: 'Working hours and work pattern survey',
    maternal_interview: 'Maternal health protection interview record', workload_interview: 'Workload interview outcome', acknowledgement: 'Record to confirm',
  },
  ja: {
    nmq: '筋骨格系症状調査', cbi: '燃え尽き（疲労）調査票', overload: '労働時間・勤務形態調査',
    maternal_interview: '母性健康保護面談記録', workload_interview: '過重労働面談の結果', acknowledgement: '記録の確認',
  },
  vi: {
    nmq: 'Khảo sát triệu chứng cơ xương khớp', cbi: 'Bảng câu hỏi về tình trạng kiệt sức', overload: 'Khảo sát giờ làm việc và hình thức làm việc',
    maternal_interview: 'Biên bản phỏng vấn bảo vệ sức khỏe thai sản', workload_interview: 'Kết quả phỏng vấn về quá tải công việc', acknowledgement: 'Xác nhận biên bản',
  },
  th: {
    nmq: 'แบบสำรวจอาการทางระบบกระดูกและกล้ามเนื้อ', cbi: 'แบบประเมินภาวะหมดไฟ', overload: 'แบบสำรวจชั่วโมงทำงานและลักษณะงาน',
    maternal_interview: 'บันทึกการสัมภาษณ์เพื่อคุ้มครองสุขภาพมารดา', workload_interview: 'ผลการสัมภาษณ์เรื่องภาระงานเกิน', acknowledgement: 'ยืนยันบันทึก',
  },
};

const langOf = (lang: string): EmployeeLang => (isEmployeeLang(lang) ? lang : 'zh');

export const taskTitle = (key: TitleKey, lang: string) => TITLES[langOf(lang)][key];

/** e.g. 肌肉骨骼症狀調查：2026 上半年 / Musculoskeletal symptom survey: 2026 上半年 */
export function nmqTitle(dispatchName: string, lang: string): string {
  const l = langOf(lang);
  return `${TITLES[l].nmq}${l === 'zh' || l === 'ja' ? '：' : ': '}${dispatchName}`;
}

const ACK_TITLES: Record<string, TitleKey> = { maternal_interviews: 'maternal_interview', interviews: 'workload_interview' };
export const acknowledgementTitle = (subjectTable: string, lang: string) => taskTitle(ACK_TITLES[subjectTable] ?? 'acknowledgement', lang);
