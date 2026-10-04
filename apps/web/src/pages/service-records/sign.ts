/* The public signing link (GET/POST /api/sign/:token): reading its document and explaining failures. */
import { ApiRequestError, type Schemas } from '@yutis/api-client';

export type SignDocument = Schemas['AcknowledgementDto'];

export interface ServiceSignDocument {
  serviceOn: string | undefined;
  site: string | undefined;
  record: unknown;
  signer: { role: string; name: string };
}

const str = (v: unknown) => (typeof v === 'string' ? v : undefined);

/**
 * A 附表八 sign-off carries `{ serviceOn, site, record, signer }`. The same endpoint also opens employee confirmations
 * (their links live under /me/sign/), which have none of these: null then.
 */
export function readSignDocument(doc: SignDocument): ServiceSignDocument | null {
  const c = doc.content;
  const signer = (c.signer && typeof c.signer === 'object' ? c.signer : null) as Record<string, unknown> | null;
  if (!signer || !('record' in c)) return null;
  return { serviceOn: str(c.serviceOn), site: str(c.site), record: c.record, signer: { role: str(signer.role) ?? '', name: str(signer.name) ?? '' } };
}

export function signProblem(err: unknown): string {
  if (err instanceof ApiRequestError) {
    if (err.code === 'token_used') return '這個連結已經使用過，或已被新寄出的連結取代。如仍需簽核，請聯絡寄件的醫護人員重寄。';
    if (err.code === 'token_expired') return '這個連結已過期，請聯絡寄件的醫護人員重寄。';
    if (err.code === 'token_not_found' || err.code === 'unknown_tenant' || err.status === 404) return '找不到這個簽核連結，請確認網址是否完整。';
    if (err.code === 'validation_failed') return '意見最多 1000 字，請縮短後再送出。';
  }
  return '暫時無法處理，請檢查網路後再試一次。';
}
