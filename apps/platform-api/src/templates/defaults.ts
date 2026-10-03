/*
 * Platform default templates (預設範本), copied into every new tenant at onboarding. Grading rules come from
 * @yutis/domain; the phrase library and sign-off roles are carried over from the prototype (prototype/data.js).
 * Sync them into default_templates with POST /platform-api/templates/sync (or the dev seed); tenants then edit their copies.
 */
import { RULES_V1 } from '@yutis/domain';

export interface DefaultPhrase { cat: string; text: string; kind?: '改善' | '建議' }

export const DEFAULT_PHRASES: readonly DefaultPhrase[] = [
  { cat: '健康諮詢', text: '抗壓飲食：多蔬果、多雜糧、少脂肪、少調味、8 杯水、8 分飽、不暴食、不偏食。' },
  { cat: '健康諮詢', text: '三低一高飲食：低油、低糖、低鹽、高纖，減少加工食品攝取。' },
  { cat: '健康諮詢', text: '天天 5+5 蔬果：每天攝取 5 種蔬菜及 5 種水果，增加鉀離子攝取以協助控制血壓。' },
  { cat: '健康諮詢', text: '血壓偏高者請每日早晚各量一次血壓並記錄，兩週後回健康中心複量。' },
  { cat: '健康諮詢_運動', text: '每週累積 150 分鐘中等強度運動，如快走、騎自行車，每次至少 10 分鐘。' },
  { cat: '健康諮詢_運動', text: '久坐工作者每 50 分鐘起身活動 5–10 分鐘，伸展肩頸與下背。' },
  { cat: '處理狀況', text: '已說明健檢異常項目意義，員工了解並同意於一個月內至家醫科複檢。' },
  { cat: '處理狀況', text: '已提供衛教單張，約定兩週後電話關懷追蹤。' },
  { cat: '處理狀況', text: '已與單位主管溝通工作調整建議，主管同意配合。' },
  { cat: '臨場健康服務', text: '9.1 勞工體格（健康）檢查結果之分析與評估、健康管理及資料保存。' },
  { cat: '臨場健康服務', text: '9.2 協助雇主選配勞工從事適當之工作。' },
  { cat: '臨場健康服務', text: '9.3 辦理健康檢查結果異常者之追蹤管理及健康指導。' },
  { cat: '臨場健康服務', text: '9.4 辦理未滿十八歲勞工、有母性健康危害之虞之勞工、職業傷病勞工與職業健康相關高風險勞工之評估及個案管理。' },
  { cat: '臨場健康服務', text: '9.6 勞工之健康教育、衛生指導、身心健康保護、健康促進等措施之策劃及實施。' },
  { cat: '不法侵害－措施', kind: '改善', text: '保持最低限噪音（宜控制於 60 分貝以下），避免刺激勞工、訪客之情緒或形成緊張態勢。' },
  { cat: '不法侵害－措施', kind: '改善', text: '櫃台及接待區設置緊急求助按鈕，並與警衛室連線。' },
  { cat: '不法侵害－措施', kind: '改善', text: '夜間單獨作業者配置無線電或定時回報機制。' },
  { cat: '不法侵害－措施', kind: '建議', text: '配置保全人員。' },
  { cat: '不法侵害－措施', kind: '建議', text: '提供勞工自我防衛工具。' },
  { cat: '不法侵害－措施', kind: '建議', text: '宿舍或交通接駁服務。' },
  { cat: '母性－物理性危害', text: '工作用階梯寬度小於 30 公分。' },
  { cat: '母性－物理性危害', text: '作業場所可能有墜落物品或移動性物品造成衝擊。' },
  { cat: '母性－物理性危害', text: '暴露於噪音作業環境（TWA ≥ 85 dB）。' },
  { cat: '母性－物理性危害', text: '暴露於高溫作業環境（依高溫作業勞工作息時間標準之定義）。' },
  { cat: '母性－物理性危害', text: '從事鑿岩機、鏈鋸、鉚釘機等振動作業。' },
  { cat: '母性－化學性危害', text: '暴露於有機溶劑（如甲苯、二甲苯）作業環境。' },
  { cat: '母性－化學性危害', text: '處理具生殖毒性之化學品（依 SDS 分類）。' }
];

export const DEFAULT_SIGN_OFF_ROLES: readonly string[] = [
  '勞工健康服務醫師',
  '勞工健康服務護理人員',
  '勞工健康服務相關人員',
  '職業安全衛生人員',
  '人力資源管理人員',
  '勞工代表',
  '部門主管',
  '受評單位主管',
  '其他'
];

/** Questionnaire form versions new tenants start on; recorded with every answer (form_version). */
export const DEFAULT_SURVEY_VERSIONS = {
  nmq: 'nmq-v1',
  cbi: 'cbi-tw-v1',
  workload: 'workload-v1',
  maternal: 'maternal-v1',
  violence: 'violence-v1',
} as const;

export const DEFAULT_TEMPLATES = {
  grading_rules: RULES_V1,
  phrases: DEFAULT_PHRASES,
  sign_off_roles: DEFAULT_SIGN_OFF_ROLES,
  survey_versions: DEFAULT_SURVEY_VERSIONS,
} as const;
