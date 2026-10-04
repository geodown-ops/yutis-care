/*
 * What an acknowledgement asks the employee to confirm. openapi.json declares AcknowledgementDto.content as a free
 * object; for maternal-health interviews the API sends the four fields below (acknowledgementDocument()). Anything
 * else it sends later is still shown, so the person never confirms content they could not see.
 */
export const ACK_FIELDS = ['interviewedOn', 'fitAdvice', 'limits', 'agreedArrangement'] as const;

export interface AckField {
  key: string;
  /** A calendar date or timestamp, to be formatted for the reader. */
  date: boolean;
  /** Text, a list, or nothing written. */
  value: string | string[] | null;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}(T[\d:.]+(Z|[+-]\d{2}:?\d{2})?)?$/;

function readValue(v: unknown): AckField['value'] | undefined {
  if (v == null) return null;
  if (typeof v === 'string') return v.trim() || null;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  if (Array.isArray(v)) {
    const list = v.filter(x => typeof x === 'string' || typeof x === 'number').map(String).map(s => s.trim()).filter(Boolean);
    return list.length ? list : null;
  }
  return undefined; // nested objects are not part of any record we confirm
}

/** The known fields first, in the order the paper form lists them, then any others. */
export function ackFields(content: Record<string, unknown>): AckField[] {
  const known: readonly string[] = ACK_FIELDS;
  const keys = [...ACK_FIELDS.filter(k => k in content), ...Object.keys(content).filter(k => !known.includes(k))];
  return keys.flatMap(key => {
    const value = readValue(content[key]);
    if (value === undefined) return [];
    return [{ key, value, date: typeof value === 'string' && ISO_DATE.test(value) }];
  });
}
