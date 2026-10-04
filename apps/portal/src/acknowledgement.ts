/*
 * What an acknowledgement asks the employee to confirm (AcknowledgementContentDto, built by the API's
 * acknowledgementDocument()), in the order the paper form lists it. Each field has a reader below, so a field the API
 * adds later fails typecheck here until it is shown: the person never confirms content they could not see.
 */
import type { Schemas } from '@yutis/api-client';

export type AckContent = Schemas['AcknowledgementContentDto'];
export type AckFieldKey = keyof AckContent;

export interface AckField {
  key: AckFieldKey;
  /** A calendar date, to be formatted for the reader. */
  date: boolean;
  /** Text, a list, or nothing written. */
  value: string | string[] | null;
}

const text = (v: string | null) => v?.trim() || null;

/** In the paper form's order. */
const READ: { [K in AckFieldKey]: (c: AckContent) => Omit<AckField, 'key'> } = {
  interviewedOn: c => ({ date: true, value: c.interviewedOn }),
  fitAdvice: c => ({ date: false, value: text(c.fitAdvice) }),
  limits: c => {
    const list = c.limits.map(s => s.trim()).filter(Boolean);
    return { date: false, value: list.length ? list : null };
  },
  agreedArrangement: c => ({ date: false, value: text(c.agreedArrangement) }),
};

export const ACK_FIELDS = Object.keys(READ) as AckFieldKey[];

export function ackFields(content: AckContent): AckField[] {
  return ACK_FIELDS.map(key => ({ key, ...READ[key](content) }));
}
