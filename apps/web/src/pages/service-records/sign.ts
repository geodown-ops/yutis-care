/* The public signing link (GET/POST /api/sign/:token): which document it opens, and explaining failures. */
import { ApiRequestError, type Schemas } from '@yutis/api-client';

export type SignDocument = Schemas['SignDocumentDto'];
export type ServiceSignContent = Schemas['ServiceSignContentDto'];
export type ReviewSignContent = Schemas['ReviewSignContentDto'];

/** What the page shows for a link. */
export type SignView =
  /** A 附表八 service record to sign off. */
  | { kind: 'service'; content: ServiceSignContent }
  /** A 不法侵害預防措施查核及評估 to sign off. */
  | { kind: 'review'; content: ReviewSignContent }
  /** An employee confirming a record about them: that happens in the employee portal (/me/sign/). */
  | { kind: 'employee' }
  /** The record behind the link is gone. */
  | { kind: 'missing' };

/** `document` says which content a link carries; the check on the content's own fields keeps a mismatch out. */
export function signView(doc: Pick<SignDocument, 'kind' | 'document' | 'content'>): SignView {
  if (doc.kind === 'acknowledgement' || doc.document === 'employee_acknowledgements') return { kind: 'employee' };
  const c = doc.content;
  if (doc.document === 'service_records' && c && 'record' in c) return { kind: 'service', content: c };
  if (doc.document === 'violence_reviews' && c && 'items' in c) return { kind: 'review', content: c };
  return { kind: 'missing' };
}

/** Where an employee's confirmation link is opened. */
export const employeeSignPath = (token: string) => `/me/sign/${encodeURIComponent(token)}`;

export function signProblem(err: unknown): string {
  if (err instanceof ApiRequestError) {
    if (err.code === 'token_used') return '這個連結已經使用過，或已被新寄出的連結取代。如仍需簽核，請聯絡寄件的醫護人員重寄。';
    if (err.code === 'token_expired') return '這個連結已過期，請聯絡寄件的醫護人員重寄。';
    if (err.code === 'token_not_found' || err.code === 'unknown_tenant' || err.status === 404) return '找不到這個簽核連結，請確認網址是否完整。';
    if (err.code === 'validation_failed') return '意見最多 1000 字，請縮短後再送出。';
  }
  return '暫時無法處理，請檢查網路後再試一次。';
}
