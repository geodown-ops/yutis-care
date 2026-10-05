/*
 * Email wording. Never put health content in a message: it may sit in mailboxes and provider logs for years. Say who
 * is asking and give the link; the content is behind the link.
 */
import { isEmployeeLang } from '@yutis/domain';
import type { Email } from './mail.js';

/** A new staff account: where to sign in with the company account. */
export function staffInvitationEmail(i: { to: string; userId: string; name: string; tenantName: string; url: string }): Email {
  return {
    to: i.to, template: 'staff_invitation', params: { userId: i.userId },
    subject: `${i.tenantName} 邀請您使用 Yutis Care 員工健康管理系統`,
    text: [
      `${i.name} 您好：`,
      '',
      `${i.tenantName} 已為您開立 Yutis Care 員工健康管理系統的後台帳號。請用公司帳號登入：`,
      i.url,
      '',
      '如果您不認識這個邀請，可以忽略這封信。',
    ].join('\n'),
  };
}

const SIGN_IN_LINK: Record<string, { subject: (tenant: string) => string; text: (name: string, site: string, url: string) => string[] }> = {
  // Wording by Yutis (Geodown, 2026-10-05).
  zh: {
    subject: tenant => `${tenant}單次登入授權`,
    text: (name, site, url) => [`${name} 您好：`, '', `這是 ${site} 一次性登入連結，登入後即失效，Yutis Care 與您共同維護個資安全。`, url],
  },
  en: {
    subject: tenant => `${tenant}: one-time sign-in`,
    text: (name, site, url) => [`Dear ${name},`, '', `This is a one-time sign-in link for ${site}. It stops working once you have signed in. Yutis Care works with you to keep personal data safe.`, url],
  },
  ja: {
    subject: tenant => `${tenant} ワンタイムログイン`,
    text: (name, site, url) => [`${name} 様`, '', `${site} のワンタイムログインリンクです。ログイン後は無効になります。Yutis Care は皆さまと共に個人情報を守ります。`, url],
  },
  vi: {
    subject: tenant => `${tenant}: đăng nhập một lần`,
    text: (name, site, url) => [`Kính gửi ${name},`, '', `Đây là liên kết đăng nhập một lần cho ${site}. Liên kết sẽ hết hiệu lực sau khi bạn đăng nhập. Yutis Care cùng bạn bảo vệ dữ liệu cá nhân.`, url],
  },
  th: {
    subject: tenant => `${tenant}: ลงชื่อเข้าใช้ครั้งเดียว`,
    text: (name, site, url) => [`เรียน ${name}`, '', `นี่คือลิงก์ลงชื่อเข้าใช้ครั้งเดียวสำหรับ ${site} ลิงก์จะใช้ไม่ได้หลังจากลงชื่อเข้าใช้แล้ว Yutis Care ร่วมกับคุณดูแลความปลอดภัยของข้อมูลส่วนบุคคล`, url],
  },
};

/**
 * A one-time sign-in link: from the login page, or sent by a tenant admin. `site` is the tenant's own host. Staff get
 * it in Chinese; employees in their portal language.
 */
export function signInLinkEmail(i: {
  to: string; recipient: { userId: string } | { employeeId: string }; name: string; tenantName: string; site: string; url: string; lang?: string;
}): Email {
  const t = SIGN_IN_LINK[i.lang && isEmployeeLang(i.lang) ? i.lang : 'zh']!;
  return {
    to: i.to, template: 'userId' in i.recipient ? 'staff_sign_in_link' : 'employee_sign_in_link', params: i.recipient,
    subject: t.subject(i.tenantName), text: t.text(i.name, i.site, i.url).join('\n'),
  };
}

/** A sign-off link for one signer (附表八, violence-prevention review). */
export function signatureEmail(s: {
  to: string; signatureId: string; signerName: string; role: string; tenantName: string; title: string; siteName: string; on: string; url: string; days: number;
}): Email {
  return {
    to: s.to, template: 'signature', params: { signatureId: s.signatureId },
    subject: `請簽核${s.title}（${s.siteName} ${s.on}）`,
    text: [
      `${s.signerName} 您好：`,
      '',
      `${s.tenantName} 的${s.title}（${s.siteName}，${s.on}）請您以「${s.role}」身分簽核：`,
      s.url,
      '',
      `連結 ${s.days} 天內有效。`,
    ].join('\n'),
  };
}

const ACKNOWLEDGEMENT: Record<string, { subject: string; text: (name: string, tenant: string, url: string, days: number) => string[] }> = {
  zh: {
    subject: '請確認健康服務紀錄',
    text: (name, tenant, url, days) => [`${name} 您好：`, '', `${tenant} 的勞工健康服務人員請您確認一份紀錄。請開啟以下連結查看並確認：`, url, '', `連結 ${days} 天內有效。`],
  },
  en: {
    subject: 'Please confirm your health service record',
    text: (name, tenant, url, days) => [`Dear ${name},`, '', `The occupational health staff at ${tenant} ask you to review and confirm a record. Open this link to view and confirm it:`, url, '', `The link is valid for ${days} days.`],
  },
  ja: {
    subject: '健康サービス記録のご確認のお願い',
    text: (name, tenant, url, days) => [`${name} 様`, '', `${tenant} の産業保健スタッフから、記録のご確認をお願いしています。次のリンクを開いて内容を確認してください：`, url, '', `リンクの有効期間は ${days} 日間です。`],
  },
  vi: {
    subject: 'Vui lòng xác nhận hồ sơ dịch vụ sức khỏe',
    text: (name, tenant, url, days) => [`Kính gửi ${name},`, '', `Nhân viên y tế lao động của ${tenant} đề nghị bạn xem và xác nhận một hồ sơ. Vui lòng mở liên kết sau để xem và xác nhận:`, url, '', `Liên kết có hiệu lực trong ${days} ngày.`],
  },
  th: {
    subject: 'โปรดยืนยันบันทึกบริการสุขภาพ',
    text: (name, tenant, url, days) => [`เรียน ${name}`, '', `เจ้าหน้าที่บริการอาชีวอนามัยของ ${tenant} ขอให้คุณตรวจสอบและยืนยันบันทึก โปรดเปิดลิงก์นี้เพื่อดูและยืนยัน:`, url, '', `ลิงก์นี้ใช้ได้ภายใน ${days} วัน`],
  },
};

/** The employee's confirmation link for an interview record, in the employee's portal language. */
export function acknowledgementEmail(a: { to: string; acknowledgementId: string; name: string; lang: string; tenantName: string; url: string; days: number }): Email {
  const t = ACKNOWLEDGEMENT[isEmployeeLang(a.lang) ? a.lang : 'zh']!;
  return {
    to: a.to, template: 'acknowledgement', params: { acknowledgementId: a.acknowledgementId },
    subject: t.subject, text: t.text(a.name, a.tenantName, a.url, a.days).join('\n'),
  };
}

const SURVEY_REMINDER: Record<string, { subject: string; text: (name: string, tenant: string, url: string) => string[] }> = {
  zh: {
    subject: '提醒：您有尚未填寫的問卷',
    text: (name, tenant, url) => [`${name} 您好：`, '', `${tenant} 的勞工健康服務人員提醒您，員工健康專區有尚未填寫的問卷。請登入填寫：`, url],
  },
  en: {
    subject: 'Reminder: you have a questionnaire to fill in',
    text: (name, tenant, url) => [`Dear ${name},`, '', `The occupational health staff at ${tenant} remind you that a questionnaire is waiting for you in the employee health portal. Please sign in to fill it in:`, url],
  },
  ja: {
    subject: '未回答の調査票のお知らせ',
    text: (name, tenant, url) => [`${name} 様`, '', `${tenant} の産業保健スタッフより、従業員健康ポータルに未回答の調査票があります。ログインしてご回答ください：`, url],
  },
  vi: {
    subject: 'Nhắc nhở: bạn có bảng câu hỏi chưa điền',
    text: (name, tenant, url) => [`Kính gửi ${name},`, '', `Nhân viên y tế lao động của ${tenant} nhắc bạn rằng có bảng câu hỏi đang chờ bạn trên cổng sức khỏe nhân viên. Vui lòng đăng nhập để điền:`, url],
  },
  th: {
    subject: 'แจ้งเตือน: คุณมีแบบสอบถามที่ยังไม่ได้กรอก',
    text: (name, tenant, url) => [`เรียน ${name}`, '', `เจ้าหน้าที่บริการอาชีวอนามัยของ ${tenant} ขอแจ้งว่าคุณมีแบบสอบถามที่ยังไม่ได้กรอกในพอร์ทัลสุขภาพพนักงาน โปรดเข้าสู่ระบบเพื่อกรอก:`, url],
  },
};

/** A nudge to fill in a questionnaire (NMQ, 過勞量表…), in the employee's portal language; it never says which one. */
export function surveyReminderEmail(r: { to: string; employeeId: string; subjectTable: string; subjectId: string; name: string; lang: string; tenantName: string; url: string }): Email {
  const t = SURVEY_REMINDER[isEmployeeLang(r.lang) ? r.lang : 'zh']!;
  return {
    to: r.to, template: 'survey_reminder', params: { employeeId: r.employeeId, subjectTable: r.subjectTable, subjectId: r.subjectId },
    subject: t.subject, text: t.text(r.name, r.tenantName, r.url).join('\n'),
  };
}

const INTERVIEW_SCHEDULED: Record<string, { subject: string; text: (name: string, tenant: string, on: string, url: string) => string[] }> = {
  zh: {
    subject: '健康面談通知',
    text: (name, tenant, on, url) => [`${name} 您好：`, '', `${tenant} 的勞工健康服務人員為您安排了健康面談，日期：${on}。`, '如需更改時間，請與勞工健康服務人員聯繫。', '', `員工健康專區：${url}`],
  },
  en: {
    subject: 'Health consultation scheduled',
    text: (name, tenant, on, url) => [`Dear ${name},`, '', `The occupational health staff at ${tenant} have scheduled a health consultation with you on ${on}.`, 'If you need to change the date, please contact the occupational health staff.', '', `Employee health portal: ${url}`],
  },
  ja: {
    subject: '健康面談のお知らせ',
    text: (name, tenant, on, url) => [`${name} 様`, '', `${tenant} の産業保健スタッフが ${on} に健康面談を予定しました。`, '日程の変更が必要な場合は、産業保健スタッフにご連絡ください。', '', `従業員健康ポータル：${url}`],
  },
  vi: {
    subject: 'Thông báo lịch phỏng vấn sức khỏe',
    text: (name, tenant, on, url) => [`Kính gửi ${name},`, '', `Nhân viên y tế lao động của ${tenant} đã sắp xếp một buổi phỏng vấn sức khỏe với bạn vào ngày ${on}.`, 'Nếu cần đổi ngày, vui lòng liên hệ nhân viên y tế lao động.', '', `Cổng sức khỏe nhân viên: ${url}`],
  },
  th: {
    subject: 'แจ้งนัดหมายสัมภาษณ์สุขภาพ',
    text: (name, tenant, on, url) => [`เรียน ${name}`, '', `เจ้าหน้าที่บริการอาชีวอนามัยของ ${tenant} ได้นัดหมายสัมภาษณ์สุขภาพกับคุณในวันที่ ${on}`, 'หากต้องการเปลี่ยนวันนัด โปรดติดต่อเจ้าหน้าที่บริการอาชีวอนามัย', '', `พอร์ทัลสุขภาพพนักงาน: ${url}`],
  },
};

/** The date of a scheduled interview, in the employee's portal language; it never says which programme it is for. */
export function interviewScheduledEmail(i: { to: string; employeeId: string; interviewId: string; name: string; lang: string; tenantName: string; on: string; url: string }): Email {
  const t = INTERVIEW_SCHEDULED[isEmployeeLang(i.lang) ? i.lang : 'zh']!;
  return {
    to: i.to, template: 'interview_scheduled', params: { employeeId: i.employeeId, interviewId: i.interviewId, on: i.on },
    subject: t.subject, text: t.text(i.name, i.tenantName, i.on, i.url).join('\n'),
  };
}
