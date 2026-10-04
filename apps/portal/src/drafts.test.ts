import { NMQ_KEYS, WORK_PATTERNS } from '@yutis/domain';
import { afterEach, describe, expect, it } from 'vitest';
import {
  decodeDraft, dropUnsaved, encodeDraft, forgetUnsaved, keepUnsaved, restoreDraft, settleUnsaved, unsavedFor,
} from './drafts';
import { NMQ_DRAFT, nmqSteps } from './nmq-flow';
import { CBI_DRAFT, CBI_STEPS, OVERLOAD_DRAFT } from './workload-flow';

const allScores = Object.fromEntries(NMQ_KEYS.map(k => [k.key, 1]));

describe('questionnaire drafts', () => {
  it('reads back what it saved, at the step the person was on', () => {
    const answers = { any: true, injury: false, scores: { neck: 2, shoulderL: 0 } };
    const raw = JSON.parse(JSON.stringify(encodeDraft({ step: 3, answers }))) as Record<string, unknown>;
    expect(decodeDraft(raw, NMQ_DRAFT)).toEqual({ step: 3, answers });
  });

  it('never resumes past a question that has no answer', () => {
    // Saved on step 9, but only the yes/no questions and the neck are answered: carry on at the next body part.
    expect(decodeDraft(encodeDraft({ step: 9, answers: { any: true, injury: true, scores: { neck: 3 } } }), NMQ_DRAFT)?.step).toBe(2);
    expect(decodeDraft(encodeDraft({ step: 4, answers: { any: null, injury: true, scores: {} } }), NMQ_DRAFT)?.step).toBe(0);
    // Everything answered: the last step, where it is sent.
    expect(decodeDraft(encodeDraft({ step: 99, answers: { any: false, injury: false, scores: allScores } }), NMQ_DRAFT)?.step).toBe(nmqSteps() - 1);
  });

  it('ignores drafts it cannot read and drops answers that are out of range', () => {
    expect(decodeDraft(null, NMQ_DRAFT)).toBeNull();
    expect(decodeDraft({ step: 1, answers: {} }, NMQ_DRAFT)).toBeNull();
    expect(decodeDraft({ v: 2, step: 1, answers: {} }, NMQ_DRAFT)).toBeNull();
    expect(decodeDraft({ v: 1, step: 0, answers: 'x' }, NMQ_DRAFT)).toBeNull();
    const nmq = decodeDraft({ v: 1, step: -2, answers: { any: 'yes', injury: false, scores: { neck: 6, wristR: 2, nose: 1 } } }, NMQ_DRAFT);
    expect(nmq).toEqual({ step: 0, answers: { any: null, injury: false, scores: { wristR: 2 } } });

    const cbi = decodeDraft({ v: 1, step: 2, answers: { p: [1, 9, 2], w: 'no' } }, CBI_DRAFT)!;
    expect(cbi.answers.p).toEqual([1, null, 2, null, null, null]);
    expect(cbi.answers.w).toHaveLength(7);
    expect(cbi.step).toBe(1);

    const hours = decodeDraft({ v: 1, step: 2, answers: { overtime1m: 50, overtime6mAvg: 900, workPatterns: [WORK_PATTERNS[3], 'other', WORK_PATTERNS[0]] } }, OVERLOAD_DRAFT)!;
    expect(hours.answers).toEqual({ overtime1m: 50, overtime6mAvg: null, workPatterns: [WORK_PATTERNS[0], WORK_PATTERNS[3]] });
    expect(hours.step).toBe(1);
  });

  it('carries on at the last CBI item once all 13 are answered', () => {
    const full = { p: Array(6).fill(2), w: Array(7).fill(3) };
    expect(decodeDraft(encodeDraft({ step: 12, answers: full }), CBI_DRAFT)?.step).toBe(CBI_STEPS.length - 1);
  });
});

describe('unsaved answers', () => {
  afterEach(() => forgetUnsaved());
  const json = (step: number) => JSON.stringify(encodeDraft({ step, answers: { any: true, injury: true, scores: {} } }));

  it('restores answers a lapsed session could not save, only to the same person', () => {
    keepUnsaved('nmq', 's1', 'emp-a', json(1));
    expect(unsavedFor('nmq', 's1', 'emp-a')).toMatchObject({ step: 1 });
    expect(unsavedFor('nmq', 's1', 'emp-b')).toBeNull();
    expect(unsavedFor('cbi', 's1', 'emp-a')).toBeNull();
    // Someone else signs in: the answers are gone.
    forgetUnsaved('emp-b');
    expect(unsavedFor('nmq', 's1', 'emp-a')).toBeNull();
  });

  it('forgets a copy once it is saved, but not a newer one', () => {
    keepUnsaved('nmq', 's1', 'emp-a', json(1));
    keepUnsaved('nmq', 's1', 'emp-a', json(2));
    settleUnsaved('nmq', 's1', json(1));
    expect(unsavedFor('nmq', 's1', 'emp-a')).toMatchObject({ step: 2 });
    settleUnsaved('nmq', 's1', json(2));
    expect(unsavedFor('nmq', 's1', 'emp-a')).toBeNull();
    keepUnsaved('nmq', 's1', 'emp-a', json(1));
    dropUnsaved('nmq', 's1');
    expect(unsavedFor('nmq', 's1', 'emp-a')).toBeNull();
  });

  it('prefers unsaved answers over the saved draft', () => {
    const saved = encodeDraft({ step: 0, answers: { any: false, injury: false, scores: {} } });
    const memory = encodeDraft({ step: 1, answers: { any: true, injury: false, scores: {} } });
    expect(restoreDraft(saved, memory, NMQ_DRAFT)).toMatchObject({ from: 'memory', draft: { step: 1, answers: { any: true } } });
    expect(restoreDraft(saved, null, NMQ_DRAFT)).toMatchObject({ from: 'saved', draft: { step: 0, answers: { any: false } } });
    expect(restoreDraft(null, null, NMQ_DRAFT)).toBeNull();
  });
});
