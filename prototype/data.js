'use strict';
/* Yutis Care prototype: domain constants and seed data.
   Every person, company, address and value here is a fictional example. */

const APP_VER = 2;
const STORE_KEY = 'yutis-care-prototype';

/* ---------- dates ---------- */
const pad = (n, w = 2) => String(n).padStart(w, '0');
const iso = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const parseD = s => { const [y, m, d] = String(s).slice(0, 10).split('-').map(Number); return new Date(y, m - 1, d); };
const D0 = (() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; })();
const TODAY = iso(D0);
const dIso = n => iso(addDays(D0, n));
const diffDays = (a, b) => Math.round((parseD(a) - parseD(b)) / 86400000);

function rng(seed) {
  return function () {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

/* ---------- organisation ---------- */
const ORG = {
  entities: [
    { id: 'L1', code: 'DM01', name: '示範製造股份有限公司' },
    { id: 'L2', code: 'DM02', name: '示範服務股份有限公司' },
  ],
  sites: [
    { id: 'S1', entity: 'L1', code: 'TY', name: '桃園廠', address: '桃園市示範區工業一路 100 號' },
    { id: 'S2', entity: 'L1', code: 'HC', name: '新竹廠', address: '新竹縣示範鄉科技路 25 號' },
    { id: 'S3', entity: 'L2', code: 'TP', name: '台北總部', address: '台北市示範區健康路 8 號 12 樓' },
  ],
  depts: [
    { id: 'D11', site: 'S1', name: '製造一課', mgr: '高明德', mgrEmail: 'mgr.d11@example.com', mgrTel: '03-355-1101' },
    { id: 'D12', site: 'S1', name: '製造二課', mgr: '簡志遠', mgrEmail: 'mgr.d12@example.com', mgrTel: '03-355-1201' },
    { id: 'D13', site: 'S1', name: '品保部', mgr: '溫雅惠', mgrEmail: 'mgr.d13@example.com', mgrTel: '03-355-1301' },
    { id: 'D21', site: 'S2', name: '研發部', mgr: '方建成', mgrEmail: 'mgr.d21@example.com', mgrTel: '03-588-2101' },
    { id: 'D22', site: 'S2', name: '物料倉儲課', mgr: '彭世昌', mgrEmail: 'mgr.d22@example.com', mgrTel: '03-588-2201' },
    { id: 'D31', site: 'S3', name: '行政部', mgr: '游淑娟', mgrEmail: 'mgr.d31@example.com', mgrTel: '02-2700-3101' },
    { id: 'D32', site: 'S3', name: '客服中心', mgr: '石家豪', mgrEmail: 'mgr.d32@example.com', mgrTel: '02-2700-3201' },
  ],
};

/* Seed for S.staff. The live list is S.staff, managed on 設定 › 醫護人員管理. */
const STAFF_SEED = [
  { id: 'U1', name: '張雅婷', role: '職護', email: 'nurse.chang@example.com', phone: '03-355-1888', sites: ['S1', 'S2', 'S3'], qual: '勞工健康服務護理人員訓練合格', active: true },
  { id: 'U2', name: '李佩珊', role: '職護', email: 'nurse.lee@example.com', phone: '02-2700-3888', sites: ['S3'], qual: '勞工健康服務護理人員訓練合格', active: true },
  { id: 'U3', name: '吳建宏', role: '職醫', email: 'dr.wu@example.com', phone: '03-355-1889', sites: ['S1', 'S2', 'S3'], qual: '職業醫學科專科醫師', active: true },
  { id: 'U4', name: '陳立民', role: '職安衛人員', email: 'safety.chen@example.com', phone: '03-355-1890', sites: ['S1', 'S2', 'S3'], qual: '職業安全衛生管理員', active: true },
  { id: 'U5', name: '王素珍', role: '人資', email: 'hr.wang@example.com', phone: '02-2700-3101', sites: ['S3'], qual: '', active: true },
  { id: 'U6', name: '黃淑惠', role: '職護', email: 'nurse.huang@example.com', phone: '03-588-2888', sites: ['S2'], qual: '勞工健康服務護理人員訓練合格', active: true },
  { id: 'U7', name: '周建邦', role: '職醫', email: 'dr.chou@example.com', phone: '', sites: ['S3'], qual: '家庭醫學科專科醫師（已完成勞工健康服務醫師訓練）', active: false },
];
const STAFF_ROLES = ['職護', '職醫', '職安衛人員', '人資'];
const CARE_ROLES = ['職護', '職醫'];
const ME = 'U1';

/* ---------- vocabularies ---------- */
const HC_ITEMS = [
  { key: 'SBP', code: 'B0111', name: '血壓－收縮壓', unit: 'mmHg', std: '90–130' },
  { key: 'DBP', code: 'B0112', name: '血壓－舒張壓', unit: 'mmHg', std: '60–85' },
  { key: 'BMI', code: 'B0104', name: 'BMI', unit: 'kg/m²', std: '18.5–24' },
  { key: 'waist', code: 'B0107', name: '腰圍', unit: 'cm', std: '男 <90；女 <80' },
  { key: 'GLU', code: 'B0201', name: '空腹血糖', unit: 'mg/dL', std: '70–100' },
  { key: 'TC', code: 'B0202', name: '總膽固醇', unit: 'mg/dL', std: '<200' },
  { key: 'TG', code: 'B0203', name: '三酸甘油脂', unit: 'mg/dL', std: '<150' },
  { key: 'HDL', code: 'B0204', name: '高密度脂蛋白膽固醇', unit: 'mg/dL', std: '男 ≥40；女 ≥50' },
  { key: 'LDL', code: 'B0205', name: '低密度脂蛋白膽固醇', unit: 'mg/dL', std: '<130' },
  { key: 'ALT', code: 'B0301', name: '血清丙胺酸轉胺酶（ALT）', unit: 'U/L', std: '<41' },
  { key: 'CR', code: 'B0302', name: '肌酸酐', unit: 'mg/dL', std: '男 0.7–1.3；女 0.6–1.1' },
  { key: 'HB', code: 'B0401', name: '血色素', unit: 'g/dL', std: '男 13–18；女 12–16' },
  { key: 'UPRO', code: 'B0501', name: '尿蛋白', unit: '', std: 'Negative（-）' },
];

/* Grading rules, version 1. src 'manual' = values seen in the vendor manual; 'demo' = illustrative values for this prototype. */
const RULES_V1 = [
  { code: 'B0111', name: '收縮壓', sex: '不限', unit: 'mmHg', src: 'manual', levels: [{ lv: 1, max: 140 }, { lv: 2, min: 140, max: 160 }, { lv: 3, min: 160, max: 180 }, { lv: 4, min: 180 }] },
  { code: 'B0112', name: '舒張壓', sex: '不限', unit: 'mmHg', src: 'manual', levels: [{ lv: 1, max: 90 }, { lv: 2, min: 90, max: 100 }, { lv: 3, min: 100, max: 110 }, { lv: 4, min: 110 }] },
  { code: 'B0104', name: 'BMI', sex: '不限', unit: 'kg/m²', src: 'manual', levels: [{ lv: 1, max: 24 }, { lv: 2, min: 24 }] },
  { code: 'B0107', name: '腰圍（女）', sex: '女', unit: 'cm', src: 'manual', levels: [{ lv: 1, max: 80 }, { lv: 2, min: 80 }] },
  { code: 'B0107', name: '腰圍（男）', sex: '男', unit: 'cm', src: 'manual', levels: [{ lv: 1, max: 90 }, { lv: 2, min: 90 }] },
  { code: 'B0201', name: '空腹血糖', sex: '不限', unit: 'mg/dL', src: 'demo', levels: [{ lv: 1, max: 100 }, { lv: 2, min: 100, max: 126 }, { lv: 3, min: 126, max: 200 }, { lv: 4, min: 200 }] },
  { code: 'B0202', name: '總膽固醇', sex: '不限', unit: 'mg/dL', src: 'demo', levels: [{ lv: 1, max: 200 }, { lv: 2, min: 200, max: 240 }, { lv: 3, min: 240, max: 280 }, { lv: 4, min: 280 }] },
  { code: 'B0203', name: '三酸甘油脂', sex: '不限', unit: 'mg/dL', src: 'demo', levels: [{ lv: 1, max: 150 }, { lv: 2, min: 150, max: 200 }, { lv: 3, min: 200, max: 500 }, { lv: 4, min: 500 }] },
  { code: 'B0204', name: '高密度脂蛋白（男）', sex: '男', unit: 'mg/dL', src: 'demo', levels: [{ lv: 1, min: 40 }, { lv: 2, max: 40 }] },
  { code: 'B0204', name: '高密度脂蛋白（女）', sex: '女', unit: 'mg/dL', src: 'demo', levels: [{ lv: 1, min: 50 }, { lv: 2, max: 50 }] },
  { code: 'B0205', name: '低密度脂蛋白', sex: '不限', unit: 'mg/dL', src: 'demo', levels: [{ lv: 1, max: 130 }, { lv: 2, min: 130, max: 160 }, { lv: 3, min: 160, max: 190 }, { lv: 4, min: 190 }] },
  { code: 'B0301', name: 'ALT', sex: '不限', unit: 'U/L', src: 'demo', levels: [{ lv: 1, max: 41 }, { lv: 2, min: 41, max: 80 }, { lv: 3, min: 80, max: 200 }, { lv: 4, min: 200 }] },
  { code: 'B0302', name: '肌酸酐（男）', sex: '男', unit: 'mg/dL', src: 'demo', levels: [{ lv: 1, max: 1.3 }, { lv: 2, min: 1.3, max: 2 }, { lv: 3, min: 2, max: 4 }, { lv: 4, min: 4 }] },
  { code: 'B0302', name: '肌酸酐（女）', sex: '女', unit: 'mg/dL', src: 'demo', levels: [{ lv: 1, max: 1.1 }, { lv: 2, min: 1.1, max: 2 }, { lv: 3, min: 2, max: 4 }, { lv: 4, min: 4 }] },
  { code: 'B0401', name: '血色素（男）', sex: '男', unit: 'g/dL', src: 'demo', levels: [{ lv: 1, min: 13 }, { lv: 2, min: 11, max: 13 }, { lv: 3, min: 9, max: 11 }, { lv: 4, max: 9 }] },
  { code: 'B0401', name: '血色素（女）', sex: '女', unit: 'g/dL', src: 'demo', levels: [{ lv: 1, min: 12 }, { lv: 2, min: 10, max: 12 }, { lv: 3, min: 8, max: 10 }, { lv: 4, max: 8 }] },
  { code: 'B0501', name: '尿蛋白', sex: '不限', unit: '', type: 'text', src: 'demo', levels: [{ lv: 1, values: ['-'] }, { lv: 2, values: ['±'] }, { lv: 3, values: ['+'] }, { lv: 4, values: ['++', '+++'] }] },
];

const CONSULT_TYPES = ['健康檢查／體格檢查報告異常', '特殊健檢異常：危害類別與分級', '人因性危害預防計畫', '執行職務遭受不法侵害預防計畫', '異常工作負荷促發疾病預防計畫', '工作場所母性健康保護計畫', '未滿 18 歲及中高齡員工'];
const LIFESTYLE = ['減重', '戒菸／酒／檳榔', '飲食建議', '充足睡眠、規律作息、紓解壓力', '建立運動習慣', '定期量血壓', '定期量腰圍', '保持正確姿勢與適當動作方式與力道', '避免久坐久站', '避免用眼過度', '定時喝水、避免憋尿'];
const ASSIST_CATS = ['健康面談諮詢紀錄', '一般諮詢', '電話關懷', '健康指導', '復工評估'];
const WORK_PATTERNS = ['不規律的工作', '經常出差的工作', '輪班或夜班工作', '作業環境（異常溫度、噪音、時差）', '伴隨精神緊張的工作'];
const SPECIAL_OPS = ['高溫作業', '噪音作業', '游離輻射作業', '粉塵作業', '有機溶劑作業', '鉛作業', '正己烷作業', '特定化學物質作業'];
const SIGN_ROLES = ['勞工健康服務醫師', '勞工健康服務護理人員', '勞工健康服務相關人員', '職業安全衛生人員', '人力資源管理人員', '勞工代表', '部門主管', '受評單位主管', '其他'];
const ERGO_MEASURES = ['調整工作檯高度', '提供搬運輔具', '工作輪調', '增加休息頻率', '轉介復健科', '肌力伸展衛教'];

/* Copenhagen Burnout Inventory, Taiwan workplace version (personal 6 items, work-related 7 items). */
const CBI = {
  freq: ['總是', '常常', '有時候', '不常', '從未或幾乎從未'],
  degree: ['很嚴重', '嚴重', '有一些', '輕微', '非常輕微'],
  personal: ['你常覺得疲勞嗎？', '你常覺得身體上體力透支嗎？', '你常覺得情緒上心力交瘁嗎？', '你常會覺得「我快要撐不下去了」嗎？', '你常覺得精疲力竭嗎？', '你常常覺得虛弱，好像快要生病了嗎？'],
  work: [
    { q: '你的工作會令人情緒上心力交瘁嗎？', s: 'degree' },
    { q: '你的工作會讓你覺得快要累垮了嗎？', s: 'degree' },
    { q: '你的工作會讓你覺得挫折嗎？', s: 'degree' },
    { q: '工作一整天之後，你覺得精疲力竭嗎？', s: 'freq' },
    { q: '上班之前只要想到又要工作一整天，你就覺得沒力嗎？', s: 'freq' },
    { q: '上班時你會覺得每一刻都很難熬嗎？', s: 'freq' },
    { q: '不工作的時候，你有足夠的精力陪朋友或家人嗎？', s: 'freq', rev: true },
  ],
};

const NMQ_PARTS = [
  { k: 'neck' }, { k: 'shoulder', side: true }, { k: 'upperBack' }, { k: 'lowerBack' },
  { k: 'elbow', side: true }, { k: 'wrist', side: true }, { k: 'hip', side: true }, { k: 'knee', side: true }, { k: 'ankle', side: true },
];
const NMQ_KEYS = NMQ_PARTS.flatMap(p => p.side ? [{ key: p.k + 'L', part: p.k, side: 'L' }, { key: p.k + 'R', part: p.k, side: 'R' }] : [{ key: p.k, part: p.k }]);

const LANGS = [['zh', '中文'], ['en', 'English'], ['ja', '日本語'], ['vi', 'Tiếng Việt'], ['th', 'ภาษาไทย']];
const I18N = {
  zh: { need: '請回答所有「是／否」題目。', title: '肌肉骨骼症狀調查表', personal: '個人資料', empNo: '工號', name: '姓名', site: '廠區', dept: '部門', basic: '基本資料', height: '身高', weight: '體重', hand: '慣用手', left: '左', right: '右', leftHand: '左手', rightHand: '右手',
    q1: '過去 1 年內，身體是否有長達 2 星期以上的疲勞、酸痛、發麻、刺痛等不舒服，或關節活動受到限制？', injury: '過去 1 年內，是否曾因工作受傷或請病假？', yes: '是', no: '否', partsTitle: '請依各部位的不適程度評分（0–5）',
    scale: ['不痛', '微痛', '中等疼痛', '劇烈疼痛', '非常劇烈疼痛', '極度劇烈疼痛'], parts: { neck: '頸', shoulder: '肩', upperBack: '上背', lowerBack: '下背', elbow: '手肘／前臂', wrist: '手／手腕', hip: '臀／大腿', knee: '膝', ankle: '腳踝／腳' },
    submit: '送出', done: '已送出，謝謝您的填寫。', page: '第 1／1 頁' },
  en: { need: 'Please answer every yes/no question.', title: 'Musculoskeletal Symptom Survey (NMQ)', personal: 'Personal information', empNo: 'Employee no.', name: 'Name', site: 'Site', dept: 'Department', basic: 'Basic information', height: 'Height', weight: 'Weight', hand: 'Dominant hand', left: 'Left', right: 'Right', leftHand: 'Left hand', rightHand: 'Right hand',
    q1: 'In the past year, have you had fatigue, aches, numbness or tingling lasting 2 weeks or more, or limited joint movement?', injury: 'In the past year, have you been injured at work or taken sick leave?', yes: 'Yes', no: 'No', partsTitle: 'Rate the discomfort in each body area (0–5)',
    scale: ['No pain', 'Slight', 'Moderate', 'Severe', 'Very severe', 'Unbearable'], parts: { neck: 'Neck', shoulder: 'Shoulder', upperBack: 'Upper back', lowerBack: 'Lower back', elbow: 'Elbow / forearm', wrist: 'Hand / wrist', hip: 'Hip / thigh', knee: 'Knee', ankle: 'Ankle / foot' },
    submit: 'Submit', done: 'Submitted. Thank you.', page: 'Page 1 of 1' },
  ja: { need: 'すべての「はい／いいえ」の質問に回答してください。', title: '筋骨格系症状調査票', personal: '個人情報', empNo: '社員番号', name: '氏名', site: '工場', dept: '部署', basic: '基本情報', height: '身長', weight: '体重', hand: '利き手', left: '左', right: '右', leftHand: '左手', rightHand: '右手',
    q1: '過去1年間に、2週間以上続く疲れ・痛み・しびれなどの不快感、または関節の動きの制限がありましたか？', injury: '過去1年間に、仕事中のけがや病気休暇がありましたか？', yes: 'はい', no: 'いいえ', partsTitle: '各部位の不快感の程度を選んでください（0–5）',
    scale: ['痛みなし', 'わずかな痛み', '中程度の痛み', '強い痛み', '非常に強い痛み', '耐えられない痛み'], parts: { neck: '首', shoulder: '肩', upperBack: '背中（上部）', lowerBack: '腰', elbow: '肘・前腕', wrist: '手・手首', hip: 'お尻・太もも', knee: '膝', ankle: '足首・足' },
    submit: '送信', done: '送信しました。ご協力ありがとうございます。', page: '1／1 ページ' },
  vi: { need: 'Vui lòng trả lời tất cả câu hỏi Có/Không.', title: 'Phiếu khảo sát triệu chứng cơ xương khớp', personal: 'Thông tin cá nhân', empNo: 'Mã nhân viên', name: 'Họ tên', site: 'Nhà máy', dept: 'Bộ phận', basic: 'Thông tin cơ bản', height: 'Chiều cao', weight: 'Cân nặng', hand: 'Tay thuận', left: 'Trái', right: 'Phải', leftHand: 'Tay trái', rightHand: 'Tay phải',
    q1: 'Trong 1 năm qua, bạn có bị mệt mỏi, đau nhức, tê hoặc châm chích kéo dài từ 2 tuần trở lên, hoặc bị hạn chế cử động khớp không?', injury: 'Trong 1 năm qua, bạn có bị tai nạn lao động hoặc nghỉ ốm không?', yes: 'Có', no: 'Không', partsTitle: 'Hãy chấm mức độ khó chịu ở từng bộ phận (0–5)',
    scale: ['Không đau', 'Đau nhẹ', 'Đau vừa', 'Đau nhiều', 'Rất đau', 'Đau không chịu nổi'], parts: { neck: 'Cổ', shoulder: 'Vai', upperBack: 'Lưng trên', lowerBack: 'Lưng dưới', elbow: 'Khuỷu tay / cẳng tay', wrist: 'Bàn tay / cổ tay', hip: 'Hông / đùi', knee: 'Đầu gối', ankle: 'Mắt cá / bàn chân' },
    submit: 'Gửi', done: 'Đã gửi. Cảm ơn bạn.', page: 'Trang 1/1' },
  th: { need: 'กรุณาตอบคำถาม ใช่/ไม่ใช่ ให้ครบทุกข้อ', title: 'แบบสำรวจอาการทางระบบกระดูกและกล้ามเนื้อ', personal: 'ข้อมูลส่วนตัว', empNo: 'รหัสพนักงาน', name: 'ชื่อ', site: 'โรงงาน', dept: 'แผนก', basic: 'ข้อมูลพื้นฐาน', height: 'ส่วนสูง', weight: 'น้ำหนัก', hand: 'มือข้างที่ถนัด', left: 'ซ้าย', right: 'ขวา', leftHand: 'มือซ้าย', rightHand: 'มือขวา',
    q1: 'ในช่วง 1 ปีที่ผ่านมา คุณมีอาการเมื่อยล้า ปวด ชา หรือเสียวแปลบต่อเนื่องตั้งแต่ 2 สัปดาห์ขึ้นไป หรือข้อต่อเคลื่อนไหวได้จำกัดหรือไม่', injury: 'ในช่วง 1 ปีที่ผ่านมา คุณเคยบาดเจ็บจากการทำงานหรือลาป่วยหรือไม่', yes: 'ใช่', no: 'ไม่ใช่', partsTitle: 'โปรดให้คะแนนความไม่สบายของแต่ละส่วนของร่างกาย (0–5)',
    scale: ['ไม่ปวด', 'ปวดเล็กน้อย', 'ปวดปานกลาง', 'ปวดมาก', 'ปวดรุนแรงมาก', 'ปวดจนทนไม่ได้'], parts: { neck: 'คอ', shoulder: 'ไหล่', upperBack: 'หลังส่วนบน', lowerBack: 'หลังส่วนล่าง', elbow: 'ข้อศอก / แขนท่อนล่าง', wrist: 'มือ / ข้อมือ', hip: 'สะโพก / ต้นขา', knee: 'เข่า', ankle: 'ข้อเท้า / เท้า' },
    submit: 'ส่ง', done: 'ส่งแล้ว ขอบคุณที่ให้ความร่วมมือ', page: 'หน้า 1/1' },
};

const MAT_HAZARDS = ['物理性危害', '化學性危害', '生物性危害', '人因性危害', '工作壓力／職場暴力', '其他'];
const MAT_LEVELS = ['第一級管理', '第二級管理', '第三級管理'];
const MAT_MEASURES = ['衛教指導', '健康狀況異常，需轉介專科醫師進一步評估或診斷，再由醫師適性評估', '醫師適性評估及工作安排建議（附表四）', '定期追蹤管理與評估', '其他'];
const MAT_EDU = ['從事作業之育齡期女性勞工，屬第二級或第三級管理者注意事項之指導', '妊娠期間注意事項之指導', '產後恢復或哺乳期間注意事項之指導'];
const MAT_AGREE = ['維持原工作', '調整職務', '調整工作時間', '變更工作場所', '其他'];
const MAT_SELF = ['孕吐或食慾不振', '下背痛', '水腫', '睡眠不足', '情緒低落或焦慮', '有慢性病（高血壓、糖尿病等）', '多胞胎或高危險妊娠', '曾流產或早產'];
const FIT_ADVICE = ['可繼續從事目前工作', '可繼續從事工作，但須考量下列條件限制', '不可繼續從事目前工作'];
const FIT_LIMITS = ['變更工作場所', '變更職務', '縮減工作時間', '限制夜班', '限制加班', '限制負重或搬運', '其他'];

const VIO_QUESTIONS = [
  { g: '外部不法侵害', q: '是否有組織外之人員（承包商、客戶、服務對象或親友等）因其行為無法預知，可能成為該區工作者之不法侵害來源？' },
  { g: '外部不法侵害', q: '是否有已知工作會接觸有暴力史之客戶？' },
  { g: '外部不法侵害', q: '勞工之工作性質是否為執行公共安全業務？' },
  { g: '外部不法侵害', q: '勞工之工作是否為單獨作業？' },
  { g: '外部不法侵害', q: '勞工是否需於夜間或深夜工作？' },
  { g: '外部不法侵害', q: '勞工是否需攜帶或處理現金、貴重物品？' },
  { g: '內部不法侵害', q: '組織內是否曾發生主管或同事利用職權或群體力量霸凌、騷擾之情事？' },
  { g: '內部不法侵害', q: '是否有勞工因工作或個人因素承受較大壓力，可能引發衝突？' },
  { g: '內部不法侵害', q: '是否曾發生性騷擾或性別歧視之申訴？' },
];
const VIO_TYPES = ['肢體', '心理', '語言', '性騷擾'];
const VIO_LIK = ['可能', '不太可能', '極不可能'];
const VIO_SEV = ['嚴重', '中', '輕'];
const VIO_CTRL = ['工程控制', '管理控制', '個人防護'];
const VIO_FACTORS = {
  '物理環境': ['噪音', '照明', '溫度', '濕度', '通風狀況', '建築結構', '出入口管制', '監視系統'],
  '工作場所設計': ['櫃台高度與深度', '緊急求助按鈕', '逃生通道', '等候區動線', '停車場與周邊照明'],
  '適性配工': ['面對大量顧客（如重大節日之前後、尖峰時段）', '單獨作業或夜間工作', '需在不同作業場所移動', '勞工舉報有遭受不法侵害威脅恐嚇者'],
  '工作設計': ['工作量與人力配置', '輪班排程', '客訴處理流程', '現金或貴重物品處理流程'],
};
const VIO_INC_TYPES = ['肢體暴力', '語言暴力', '心理暴力', '性騷擾', '其他'];
const VIO_FOLLOW = ['轉介心理諮商', '調整職務／工作地點', '報警處理', '提供法律協助', '加害者懲處或拒絕服務'];
const VIO_REVIEW = [
  { item: '辨識及評估危害', pts: ['組織', '個人因素', '工作環境', '工作流程'] },
  { item: '適當配置作業場所', pts: ['物理環境', '工作場所設計'] },
  { item: '依工作適性適當調整人力', pts: ['適性配工', '工作設計'] },
  { item: '建構行為規範', pts: ['組織政策規範', '個人行為規範'] },
  { item: '辦理危害預防及溝通技巧訓練', pts: ['教育訓練', '溝通技巧'] },
  { item: '建立事件處理程序', pts: ['通報流程', '申訴管道'] },
  { item: '執行成效之評估及改善', pts: ['成效評估', '持續改善'] },
];

const PHRASE_SEED = [
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
  { cat: '母性－化學性危害', text: '處理具生殖毒性之化學品（依 SDS 分類）。' },
];

/* ---------- employees ---------- */
// [name, sex, birth, dept, title, shift, hcCat, lang, hireOffsetOrDate]
const EMP_SEED = [
  ['陳怡君', '女', '1994-03-12', 'D13', '品管工程師', '常日班', 'A類', 'zh', '2019-07-01'],
  ['林志豪', '男', '1974-01-25', 'D11', '領班', '輪班', 'T1類', 'zh', '2002-04-08'],
  ['黃淑芬', '女', '1997-06-30', 'D31', '行政專員', '常日班', 'A類', 'zh', '2021-06-30'],
  ['張家瑋', '男', '1979-08-17', 'D21', '資深工程師', '常日班', 'A類', 'zh', '2010-03-01'],
  ['李宗翰', '男', '1986-11-02', 'D11', '作業員', '輪班', 'T1類', 'zh', '2015-05-18'],
  ['王美玲', '女', '1972-05-09', 'D22', '倉管員', '常日班', 'B類', 'zh', '2005-09-12'],
  ['吳俊傑', '男', '1990-02-14', 'D12', '技術員', '輪班', 'T2類', 'zh', '2016-08-01'],
  ['劉雅雯', '女', '1988-12-21', 'D32', '客服專員', '輪班', 'A類', 'zh', '2018-01-15'],
  ['蔡明宏', '男', '1968-07-03', 'D11', '課長', '常日班', 'B類', 'zh', '1995-10-02'],
  ['楊惠如', '女', '1983-04-18', 'D13', '品保專員', '常日班', 'A類', 'zh', '2012-02-20'],
  ['許文彬', '男', '1977-09-27', 'D22', '堆高機操作員', '輪班', 'T2類', 'zh', '2008-06-16'],
  ['鄭雅琪', '女', '1992-10-05', 'D21', '軟體工程師', '常日班', 'A類', 'zh', '2020-09-01'],
  ['謝承恩', '男', '1995-01-19', 'D12', '作業員', '輪班', 'T1類', 'zh', '2022-03-07'],
  ['郭佩君', '女', '1981-03-28', 'D31', '會計', '常日班', 'A類', 'zh', '2009-11-23'],
  ['洪建志', '男', '1970-12-11', 'D12', '設備維護員', '輪班', 'T1類', 'zh', '1999-07-19'],
  ['曾思穎', '女', '1999-08-08', 'D32', '客服專員', '輪班', 'A類', 'zh', '2023-04-10'],
  ['邱冠宇', '男', '1985-06-22', 'D21', '研發主任', '常日班', 'A類', 'zh', '2011-08-29'],
  ['廖婉婷', '女', '1990-11-30', 'D13', '檢驗員', '常日班', 'B類', 'zh', '2017-05-02'],
  ['賴柏翰', '男', '1993-02-03', 'D22', '物料員', '常日班', 'B類', 'zh', '2019-12-09'],
  ['周欣怡', '女', '1987-07-15', 'D31', '人資專員', '常日班', 'A類', 'zh', '2014-03-17'],
  ['徐國豪', '男', '1966-04-09', 'D11', '技術員', '輪班', 'T1類', 'zh', '1993-08-02'],
  ['蘇芷涵', '女', '1996-09-14', 'D21', '硬體工程師', '常日班', 'A類', 'zh', '2021-01-04'],
  ['葉俊宏', '男', '1982-03-01', 'D12', '作業員', '輪班', 'T2類', 'zh', '2007-10-15'],
  ['莊雅筑', '女', '1998-05-25', 'D32', '客服組長', '輪班', 'A類', 'zh', '2020-06-01'],
  ['呂育誠', '男', '1975-10-10', 'D22', '倉儲主任', '常日班', 'B類', 'zh', '2001-02-12'],
  ['江宜蓁', '女', '1991-01-07', 'D13', '品保工程師', '常日班', 'A類', 'zh', '2016-04-25'],
  ['何承翰', '男', '2009-05-20', 'D21', '暑期實習生', '常日班', 'A類', 'zh', -95],
  ['羅美惠', '女', '1964-02-16', 'D31', '總務', '常日班', 'B類', 'zh', '1990-05-07'],
  ['阮氏梅', '女', '1996-04-12', 'D11', '作業員', '輪班', 'T1類', 'vi', '2022-08-15'],
  ['頌猜‧旺沙', '男', '1989-09-09', 'D12', '作業員', '輪班', 'T1類', 'th', '2021-03-22'],
];
const empId = n => 'YC' + pad(n, 4);

const HC_OVERRIDE = {
  2: { SBP: 168, DBP: 112, BMI: 27.8, waist: 98, GLU: 108, TC: 238, TG: 262, HDL: 36, LDL: 165, ALT: 44, UPRO: '±' },
  4: { SBP: 128, DBP: 82, BMI: 25.6, waist: 91, LDL: 168, TC: 232, HDL: 46 },
  6: { HB: 11.4, GLU: 104, BMI: 24.6 },
  9: { SBP: 142, DBP: 88, BMI: 26.4, waist: 95, GLU: 148, TC: 214, HDL: 42, LDL: 128, TG: 188 },
  15: { SBP: 124, DBP: 78, BMI: 27.1, waist: 93, ALT: 96, TG: 312, HDL: 44, LDL: 125 },
  17: { SBP: 138, DBP: 86, BMI: 24.9, HDL: 48, LDL: 120, TG: 224 },
  21: { SBP: 184, DBP: 104, BMI: 25.2, HDL: 38, LDL: 158, TC: 226, GLU: 112 },
  25: { SBP: 150, DBP: 92, CR: 1.45 },
  28: { SBP: 136, DBP: 84, LDL: 162, TC: 248 },
};
const SMOKERS = [2, 5, 21, 23];
const HISTORY = { 2: '高血壓（服藥中）', 9: '糖尿病（飲食控制）', 21: '高血壓' };
const SYMPTOMS = { 2: '倦怠、下背痛', 9: '口渴、易疲倦', 15: '肩頸痠痛', 6: '頭暈' };
const SPECIAL_LV = { 11: 2, 23: 2, 2: 1 };

function baseValues(R, sex) {
  const m = sex === '男';
  const b = (a, c, dp = 0) => +(a + R() * (c - a)).toFixed(dp);
  return {
    SBP: b(104, 132), DBP: b(64, 84), BMI: b(19.2, 23.8, 1), waist: m ? b(76, 88) : b(66, 78), GLU: b(78, 98),
    TC: b(150, 196), TG: b(68, 145), HDL: m ? b(41, 58) : b(51, 72), LDL: b(78, 126), ALT: b(12, 36),
    CR: m ? b(0.8, 1.2, 2) : b(0.6, 0.98, 2), HB: m ? b(13.6, 16.2, 1) : b(12.3, 14.6, 1), UPRO: '-',
  };
}

function seedState() {
  const R = rng(20261002);
  const employees = EMP_SEED.map((x, i) => {
    const n = i + 1;
    const [name, sex, birth, dept, title, shift, hcCat, lang, hire] = x;
    const d = ORG.depts.find(z => z.id === dept);
    const s = ORG.sites.find(z => z.id === d.site);
    return {
      id: empId(n), empNo: 'E' + (10230 + n * 7), name, sex, birth, entity: s.entity, site: s.id, dept, title, shift, hcCat,
      grade: '一般', lang, hire: typeof hire === 'number' ? dIso(hire) : hire,
      phone: `09${pad(10 + (n * 37) % 89)}-${pad((n * 613) % 1000, 3)}-${pad((n * 271) % 1000, 3)}`,
      ext: String(2100 + n * 3), email: `${empId(n).toLowerCase()}@example.com`,
      idMasked: `${'ABFHKP'[n % 6]}${sex === '男' ? 1 : 2}●●●●●●${(n * 7) % 10}${(n * 3) % 10}`,
      status: '在職', active: true,
    };
  });

  const reports = [];
  employees.forEach((e, i) => {
    const n = i + 1;
    const values = Object.assign(baseValues(R, e.sex), HC_OVERRIDE[n] || {});
    const date = dIso(-(18 + (n * 7) % 92));
    const hours = [2, 4, 15, 17, 21].includes(n) ? 52 + (n % 5) : 40 + (n % 6);
    const special = e.hcCat.startsWith('T') ? { hazard: e.hcCat === 'T1類' ? '噪音作業' : '粉塵作業', level: SPECIAL_LV[n] || 1 } : null;
    reports.push({
      id: 'R' + pad(n, 3) + 'A', empId: e.id, date, clinic: ['仁安健康管理診所', '康誠醫院健檢中心'][n % 2], kind: special ? '年度健檢＋特殊健檢' : '年度健檢',
      values, special,
      life: { smoke: SMOKERS.includes(n), drink: n % 4 === 0, betel: false, sleep: 5.5 + (n % 4) * 0.5 },
      history: HISTORY[n] || '無', symptoms: SYMPTOMS[n] || '無',
      work: `目前從事${e.title}（${deptOf(e.dept).name}），${e.shift}，近 6 個月平均每週工時約 ${hours} 小時。`,
    });
    if (n % 3 === 0 && n !== 27) {
      const prev = {};
      for (const k in values) prev[k] = typeof values[k] === 'number' ? +(values[k] * (0.93 + R() * 0.06)).toFixed(k === 'BMI' || k === 'HB' ? 1 : k === 'CR' ? 2 : 0) : values[k];
      reports.push({ ...reports[reports.length - 1], id: 'R' + pad(n, 3) + 'B', date: iso(addDays(parseD(date), -364)), values: prev });
    }
  });

  /* Ergonomic (NMQ) survey batch */
  const ERGO = { 2: { lowerBack: 5, shoulderR: 3, neck: 2 }, 5: { wristR: 4, elbowR: 2 }, 6: { lowerBack: 3 }, 7: { neck: 1, shoulderL: 1 }, 11: { lowerBack: 3, kneeL: 2 }, 13: null, 15: { shoulderL: 4, shoulderR: 3, neck: 2 }, 19: null, 21: { neck: 1 }, 23: null, 25: { lowerBack: 2 }, 29: null, 30: { wristL: 3 } };
  const ergo = Object.entries(ERGO).map(([n, sc], k) => {
    n = +n;
    const nmq = sc ? Object.fromEntries(NMQ_KEYS.map(x => [x.key, sc[x.key] || 0])) : null;
    return {
      id: 'ER' + pad(n, 3), batch: 'B1', date: dIso(-35), empId: empId(n), sentAt: dIso(-35), status: sc ? '已填寫' : '未填寫',
      filledAt: sc ? dIso(-34 + (k % 6)) : null, filledBy: sc ? 'self' : null, lang: employees[n - 1].lang, injury: sc ? [2, 5].includes(n) : null,
      nmq, remind: sc ? 0 : 1, lastRemind: sc ? null : dIso(-21),
      track: n === 2 ? { measures: ['提供搬運輔具', '調整工作檯高度'], note: '已申請電動升降台車，預計下月到位；每兩週追蹤下背痛程度。', date: dIso(-10), status: '列管中' } : null,
    };
  });
  const injuries = [
    { id: 'IJ1', date: dIso(-80), empId: empId(2), part: '下背', desc: '搬運模具時扭傷下背部', leave: 3 },
    { id: 'IJ2', date: dIso(-50), empId: empId(5), part: '右手腕', desc: '重複性鎖螺絲作業後手腕痠痛', leave: 0 },
  ];

  /* Overwork: CBI scores + overtime + work patterns */
  const WL = {
    2: { pf: 66.7, wf: 71.4, m1: 62, avg6: 58, pt: [0, 2, 3, 4] }, 4: { pf: 54.2, wf: 57.1, m1: 105, avg6: 76, pt: [4] },
    7: { pf: 37.5, wf: 35.7, m1: 22, avg6: 18, pt: [2] }, 8: { pf: 45.8, wf: 42.9, m1: 8, avg6: 10, pt: [2, 4] },
    9: { pf: 41.7, wf: 39.3, m1: 30, avg6: 28, pt: [4] }, 11: { pf: 33.3, wf: 32.1, m1: 36, avg6: 30, pt: [2] },
    12: { pf: 50.0, wf: 46.4, m1: 40, avg6: 38, pt: [] }, 13: { pf: null, m1: null },
    15: { pf: 75.0, wf: 64.3, m1: 28, avg6: 25, pt: [2] }, 17: { pf: 58.3, wf: 53.6, m1: 96, avg6: 85, pt: [1, 4] },
    21: { pf: 45.8, wf: 50.0, m1: 20, avg6: 22, pt: [2, 3] }, 23: { pf: 29.2, wf: 28.6, m1: 18, avg6: 15, pt: [2] },
    24: { pf: 52.1, wf: 47.6, m1: 10, avg6: 12, pt: [2, 4] }, 29: { pf: null, m1: 12, avg6: 14, pt: [2] },
  };
  const workload = Object.entries(WL).map(([n, w]) => {
    n = +n;
    const a = {
      id: 'WL' + pad(n, 3), date: dIso(-28), empId: empId(n), sentAt: dIso(-28),
      pf: w.pf, wf: w.pf == null ? null : w.wf, cbi: null, fatigueAt: w.pf == null ? null : dIso(-27 + n % 5),
      m1: w.m1, avg6: w.m1 == null ? null : w.avg6, patterns: w.m1 == null ? [] : w.pt.map(k => WORK_PATTERNS[k]), overloadAt: w.m1 == null ? null : dIso(-27 + n % 4),
      interview: null,
    };
    if (n === 2) a.interview = { status: '已面談', date: dIso(-14), doctor: 'U3', fatigue: '中度', mind: '有', diag: '需進行醫療', guide: '需醫療指導', work: '工作限制', special: '血壓控制不佳，建議心臟內科就診並暫停夜班。', needMeasure: '是', adjustHours: '縮短工時', changeWork: '調整為常日班', period: '3 個月', nextInterview: '是', nextDate: dIso(16), seeDoctor: '心臟內科', note: '', measureDoctor: 'U3', measureDate: dIso(-14), signSent: dIso(-13) };
    return a;
  });

  /* Maternal protection */
  const signer = (role, name, email, sent, conf, comment = '') => ({ role, name, email, sentFirst: sent, sentLast: sent, confirmed: conf, comment });
  const matEnv = [
    { id: 'ME1', date: dIso(-120), entity: 'L1', site: 'S1', dept: 'D13', area: '品保大樓 2F 化學檢驗室', shiftType: '常日班',
      hazards: { '物理性危害': { v: '無', note: '' }, '化學性危害': { v: '有', note: '樣品前處理使用甲苯、二甲苯。' }, '生物性危害': { v: '無', note: '' }, '人因性危害': { v: '可能有影響', note: '長時間站立操作。' }, '工作壓力／職場暴力': { v: '無', note: '' }, '其他': { v: '無', note: '' } },
      result: '第三級管理', attach: '檢驗室作業環境監測報告.pdf',
      signers: [signer('職業安全衛生人員', '陳立民', 'safety.chen@example.com', dIso(-119), dIso(-118)), signer('勞工健康服務醫師', '吳建宏', 'dr.wu@example.com', dIso(-119), dIso(-117)), signer('勞工健康服務護理人員', '張雅婷', 'nurse.chang@example.com', dIso(-119), dIso(-119)), signer('受評單位主管', '溫雅惠', 'mgr.d13@example.com', dIso(-119), dIso(-116), '已規劃孕期員工改至品保辦公室作業。')] },
    { id: 'ME2', date: dIso(-90), entity: 'L2', site: 'S3', dept: 'D31', area: '總部 12F 行政辦公區', shiftType: '常日班',
      hazards: Object.fromEntries(MAT_HAZARDS.map(h => [h, { v: '無', note: '' }])), result: '第一級管理', attach: '',
      signers: [signer('職業安全衛生人員', '陳立民', 'safety.chen@example.com', dIso(-89), dIso(-88)), signer('受評單位主管', '游淑娟', 'mgr.d31@example.com', dIso(-89), null)] },
  ];
  const matCases = [
    { id: 'MC1', empId: empId(1), type: '妊娠', notifyDate: dIso(-62), due: dIso(138), birthDate: '', shift: '常日班', tel: '03-355-1305', mgr: '溫雅惠', mgrTel: '03-355-1301', mgrEmail: 'mgr.d13@example.com', email: employees[0].email,
      env: { envId: 'ME1', items: ['暴露於有機溶劑（如甲苯、二甲苯）作業環境。'], level: '第三級管理' },
      self: { items: ['孕吐或食慾不振', '睡眠不足'], note: '晨間孕吐明顯，午後改善。' },
      interview: { date: dIso(-5), by: 'U1', envLevel: '第三級管理', health: '無，大致正常', measures: ['衛教指導', '醫師適性評估及工作安排建議（附表四）'], measureNote: '', edu: '妊娠期間注意事項之指導', proposed: ['變更工作場所'] },
      fit: { doctor: 'U3', advice: '可繼續從事工作，但須考量下列條件限制', limits: ['變更工作場所', '限制加班'], from: dIso(-5), to: dIso(138), note: '產前改至品保辦公室文書作業，避免接觸有機溶劑。' },
      status: '待員工確認', emailAt: dIso(-2), confirmAt: null, agreed: [] },
    { id: 'MC2', empId: empId(3), type: '產後一年內', notifyDate: dIso(-100), due: '', birthDate: dIso(-118), shift: '常日班', tel: '02-2700-3115', mgr: '游淑娟', mgrTel: '02-2700-3101', mgrEmail: 'mgr.d31@example.com', email: employees[2].email,
      env: { envId: 'ME2', items: [], level: '第一級管理' }, self: { items: ['睡眠不足'], note: '哺乳中，需集乳時間。' },
      interview: { date: dIso(-95), by: 'U2', envLevel: '第一級管理', health: '無，大致正常', measures: ['衛教指導'], measureNote: '', edu: '產後恢復或哺乳期間注意事項之指導', proposed: ['維持原工作'] },
      fit: { doctor: 'U3', advice: '可繼續從事目前工作', limits: [], from: '', to: '', note: '提供哺集乳室與每日 2 次集乳時間。' },
      status: '已確認', emailAt: dIso(-94), confirmAt: dIso(-92) + ' 10:12', agreed: ['維持原工作'] },
  ];

  /* Workplace violence prevention */
  const vioRisk = [{
    id: 'VR1', date: dIso(-75), site: 'S3', dept: 'D32', place: '客服中心 1F 服務櫃台', pattern: '輪班（早班、晚班）', headcount: 18, assessor: '陳立民', reviewer: '石家豪',
    rows: { 0: { yes: '是', types: ['語言', '心理'], lik: '可能', sev: '中', ctrl: ['管理控制'], add: '增設櫃台緊急求助按鈕；訂定客訴升級處理流程。' }, 1: { yes: '否' }, 2: { yes: '否' },
      3: { yes: '是', types: ['肢體'], lik: '不太可能', sev: '嚴重', ctrl: ['工程控制'], add: '晚班至少兩人值勤。' }, 4: { yes: '是', types: ['語言'], lik: '可能', sev: '輕', ctrl: ['管理控制'], add: '' },
      5: { yes: '否' }, 6: { yes: '否' }, 7: { yes: '是', types: ['心理', '語言'], lik: '不太可能', sev: '中', ctrl: ['管理控制'], add: '提供員工協助方案（EAP）。' }, 8: { yes: '否' } },
  }];
  const vioCheck = [
    { id: 'VC1', kind: '物理環境', date: dIso(-70), site: 'S3', dept: 'D32', place: '客服中心服務櫃台', content: '臨櫃客戶服務',
      rows: { 0: { cur: '尖峰時段櫃台區噪音約 65 dB。', imp: '保持最低限噪音（宜控制於 60 分貝以下），避免刺激勞工、訪客之情緒或形成緊張態勢。', sug: '' }, 1: { cur: '照明充足。', imp: '', sug: '' }, 7: { cur: '櫃台上方有監視器，等候區無。', imp: '', sug: '等候區增設監視器。' } } },
    { id: 'VC2', kind: '適性配工', date: dIso(-60), site: 'S2', dept: 'D22', place: '倉儲區', content: '夜間收貨與盤點',
      rows: { 1: { cur: '夜班 1 人留守收貨。', n: 1, imp: '夜間單獨作業者配置無線電或定時回報機制。', sug: '配置保全人員。' } } },
  ];
  const vioIncidents = [{
    id: 'VI1', date: dIso(-20), time: '14:35', entity: 'L2', site: 'S3', place: '客服中心 1F 服務櫃台',
    victim: { name: '劉雅雯', sex: '女', kind: '內部人員', unit: '客服中心' }, actor: { name: '男性客戶（約 50 歲）', sex: '男', kind: '外部人員', unit: '' },
    relation: '客服人員與客戶', cause: '客戶因退費程序不滿，於櫃台大聲辱罵並拍打桌面約 10 分鐘，經主管介入後離開。', type: '語言暴力',
    handling: '主管當日關懷並安排心理諮商一次；隔週調整至電話客服。', follow: ['轉介心理諮商', '調整職務／工作地點'], received: dIso(-20) + ' 15:10', receiver: '張雅婷',
  }];
  const vioReview = [{
    id: 'VV1', date: dIso(-15), site: 'S3', dept: 'D32',
    items: { 0: { pts: ['工作環境', '工作流程'], result: '已完成客服櫃台危害辨識，高風險 2 項。', fix: '增設緊急求助按鈕（已完成）。' }, 1: { pts: ['物理環境'], result: '櫃台噪音改善中。', fix: '尖峰時段增開櫃台分流。' }, 5: { pts: ['通報流程'], result: '本季通報 1 件，已於 1 小時內受理。', fix: '' } },
    signers: [signer('職業安全衛生人員', '陳立民', 'safety.chen@example.com', dIso(-14), dIso(-13)), signer('部門主管', '石家豪', 'mgr.d32@example.com', dIso(-14), null)],
  }];

  /* Labour health service record (Form 8) */
  const svc = [
    { id: 'SV1', date: dIso(-7), from: '09:00', to: '12:00', executor: 'U3', site: 'S1', unit: '示範製造股份有限公司', deptName: '製造一課、製造二課',
      adminM: 6, adminF: 4, opM: 58, opF: 21, general: 31, special: [{ cat: '噪音作業', n: 46 }, { cat: '有機溶劑作業', n: 12 }],
      sec2: '工作型態與時間：行政人員常日班；製造課三班二輪。\n人員及危害特性概述：高溫、噪音、粉塵、有機溶劑、人因性危害、長時間夜間工作。',
      sec3: '9.1 勞工體格（健康）檢查結果之分析與評估、健康管理及資料保存。\n本次完成 12 名健檢異常者面談，其中 2 名血壓第 4 級已轉介心臟內科。\n9.3 辦理健康檢查結果異常者之追蹤管理及健康指導。',
      sec4: '建議製造一課評估夜班人員輪調頻率，並於下次臨場前提供近 3 個月加班統計。', sec5: '前次建議之搬運輔具已採購 2 台，持續追蹤使用情形。',
      signers: [signer('勞工健康服務醫師', '吳建宏', 'dr.wu@example.com', dIso(-6), dIso(-6)), signer('勞工健康服務護理人員', '張雅婷', 'nurse.chang@example.com', dIso(-6), dIso(-6)), signer('職業安全衛生人員', '陳立民', 'safety.chen@example.com', dIso(-6), dIso(-5), '噪音量測記錄已提供'), signer('部門主管', '高明德', 'mgr.d11@example.com', dIso(-6), null)] },
    { id: 'SV2', date: dIso(-37), from: '13:30', to: '16:30', executor: 'U1', site: 'S3', unit: '示範服務股份有限公司', deptName: '客服中心',
      adminM: 4, adminF: 9, opM: 0, opF: 0, general: 13, special: [],
      sec2: '客服中心早晚兩班制，尖峰時段每人每小時處理 12–15 通來電。', sec3: '9.6 勞工之健康教育、衛生指導、身心健康保護、健康促進等措施之策劃及實施。\n辦理情緒勞務紓壓講座，參加 11 人。',
      sec4: '建議尖峰時段增加輪休 10 分鐘。', sec5: '',
      signers: [signer('勞工健康服務護理人員', '張雅婷', 'nurse.chang@example.com', dIso(-36), dIso(-36)), signer('部門主管', '石家豪', 'mgr.d32@example.com', dIso(-36), dIso(-33), '謝謝協助健康促進')] },
    { id: 'SV3', date: dIso(-67), from: '09:00', to: '11:30', executor: 'U3', site: 'S2', unit: '示範製造股份有限公司', deptName: '研發部、物料倉儲課',
      adminM: 22, adminF: 11, opM: 14, opF: 3, general: 36, special: [{ cat: '粉塵作業', n: 8 }],
      sec2: '研發部常日班；倉儲課兩班制，含夜間收貨。', sec3: '9.2 協助雇主選配勞工從事適當之工作。\n完成 3 名新進堆高機操作員之適性評估。', sec4: '', sec5: '',
      signers: [signer('勞工健康服務醫師', '吳建宏', 'dr.wu@example.com', dIso(-66), dIso(-66)), signer('部門主管', '彭世昌', 'mgr.d22@example.com', dIso(-66), dIso(-64))] },
  ];

  /* Case management */
  const cases = {
    [empId(2)]: { openDate: dIso(-25), nurse: 'U1', status: '處理中', noticeDate: dIso(-20), plannedDate: dIso(-14), replyDate: dIso(-19), agree: '同意', closedDate: null },
    [empId(9)]: { openDate: dIso(-6), nurse: 'U2', status: '起單', noticeDate: dIso(-3), plannedDate: dIso(4), replyDate: null, agree: null, closedDate: null },
    [empId(15)]: { openDate: dIso(-10), nurse: 'U1', status: '處理中', noticeDate: null, plannedDate: null, replyDate: null, agree: null, closedDate: null },
    [empId(1)]: { openDate: dIso(-60), nurse: 'U1', status: '處理中', noticeDate: null, plannedDate: null, replyDate: null, agree: null, closedDate: null },
    [empId(3)]: { openDate: dIso(-100), nurse: 'U2', status: '結案', noticeDate: null, plannedDate: null, replyDate: null, agree: null, closedDate: dIso(-90) },
    [empId(6)]: { openDate: dIso(-8), nurse: 'U1', status: '起單', noticeDate: null, plannedDate: null, replyDate: null, agree: null, closedDate: null },
    [empId(5)]: { openDate: dIso(-30), nurse: 'U1', status: '處理中', noticeDate: null, plannedDate: null, replyDate: null, agree: null, closedDate: null },
  };
  const rec = (o) => Object.assign({ id: '', empId: '', cat: '健康面談諮詢紀錄', date: TODAY, time: '10:00', types: [], typeOther: '', explain: '', lifestyle: [], lifeOther: '', handling: '', note: '', helpers: [{ staff: 'U1', min: 20 }], files: [], result: '追蹤', follow: null, draft: false, followDone: false, tipSent: false, updatedBy: 'U1', updatedAt: TODAY }, o);
  const records = [
    rec({ id: 'AR1', empId: empId(2), date: dIso(-14), time: '10:30', types: ['健康檢查／體格檢查報告異常', '異常工作負荷促發疾病預防計畫', '人因性危害預防計畫'],
      explain: '血壓 168/112 mmHg 屬第 4 級，LDL 165 mg/dL 屬第 3 級。說明高血壓與夜班、長工時之關聯。\n天天 5+5 蔬果：每天攝取 5 種蔬菜及 5 種水果，增加鉀離子攝取以協助控制血壓。',
      lifestyle: ['減重', '戒菸／酒／檳榔', '定期量血壓'], handling: '已轉介心臟內科，並與主管討論暫停夜班 3 個月。', helpers: [{ staff: 'U1', min: 30 }, { staff: 'U3', min: 20 }],
      follow: { date: dIso(3), time: '09:30', staff: 'U1', cat: '健康面談諮詢紀錄' }, tipSent: true, updatedAt: dIso(-14) }),
    rec({ id: 'AR2', empId: empId(5), cat: '電話關懷', date: dIso(-16), time: '15:00', types: ['人因性危害預防計畫'], explain: '右手腕疼痛 4 分，建議使用電動起子並調整工作檯高度。', lifestyle: ['保持正確姿勢與適當動作方式與力道'],
      handling: '已提供衛教單張，約定兩週後電話關懷追蹤。', follow: { date: dIso(-2), time: '14:00', staff: 'U1', cat: '電話關懷' }, updatedAt: dIso(-16) }),
    rec({ id: 'AR3', empId: empId(15), date: dIso(-1), time: '11:00', types: ['健康檢查／體格檢查報告異常'], explain: 'ALT 96 U/L、三酸甘油脂 312 mg/dL。', handling: '', result: '', draft: true, updatedAt: dIso(-1) }),
    rec({ id: 'AR4', empId: empId(1), cat: '健康指導', date: dIso(-5), time: '13:30', types: ['工作場所母性健康保護計畫'], explain: '說明妊娠期間避免接觸有機溶劑，並完成母性健康保護面談。', lifestyle: ['充足睡眠、規律作息、紓解壓力'],
      handling: '已與單位主管溝通工作調整建議，主管同意配合。', follow: { date: dIso(10), time: '10:00', staff: 'U1', cat: '健康指導' }, tipSent: true, updatedAt: dIso(-5) }),
    rec({ id: 'AR5', empId: empId(3), cat: '健康指導', date: dIso(-95), time: '10:00', types: ['工作場所母性健康保護計畫'], explain: '產後哺乳期間注意事項指導。', handling: '提供哺集乳室使用說明。', helpers: [{ staff: 'U2', min: 25 }], result: '結案', follow: null, updatedBy: 'U2', updatedAt: dIso(-90) }),
    rec({ id: 'AR6', empId: empId(6), cat: '一般諮詢', date: dIso(-4), time: '16:00', types: ['人因性危害預防計畫', '健康檢查／體格檢查報告異常'], explain: '下背痛 3 分；血色素 11.4 g/dL 偏低。', lifestyle: ['飲食建議', '避免久坐久站'],
      handling: '建議家醫科檢查貧血原因。', helpers: [{ staff: 'U2', min: 15 }], follow: { date: dIso(1), time: '10:30', staff: 'U2', cat: '一般諮詢' }, updatedBy: 'U2', updatedAt: dIso(-4) }),
  ];

  const state = {
    ver: APP_VER, seededOn: TODAY, employees, reports, ergo, injuries, workload, matEnv, matCases, vioRisk, vioCheck, vioIncidents, vioReview, svc,
    staff: JSON.parse(JSON.stringify(STAFF_SEED)), cases, records, evStatus: {}, rules: JSON.parse(JSON.stringify(RULES_V1)), phrases: PHRASE_SEED.map((p, i) => ({ id: 'P' + (i + 1), ...p })),
    notices: [],
  };
  return state;
}

function deptOf(id) { return ORG.depts.find(d => d.id === id) || { name: '' }; }
