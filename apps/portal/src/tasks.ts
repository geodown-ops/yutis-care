import type { Schemas } from '@yutis/api-client';

export type PortalTask = Schemas['TaskDto'];
export type TaskKind = PortalTask['kind'];
/** GET /api/portal/tasks/{kind}/{id}: whether it is done, and the saved draft of a questionnaire. */
export type TaskDetail = Schemas['TaskDetailDto'];

/** Each kind of task has its own flow under /tasks, where the tab bar is hidden. */
export const TASK_ROUTES = {
  nmq: '/tasks/nmq/$id',
  cbi: '/tasks/cbi/$id',
  overload: '/tasks/overload/$id',
  acknowledgement: '/tasks/acknowledgement/$id',
} as const satisfies Record<TaskKind, string>;

export function taskLink(task: Pick<PortalTask, 'kind' | 'id'>) {
  return { to: TASK_ROUTES[task.kind], params: { id: task.id } };
}

/** The card's button: a record is viewed, a questionnaire with a saved draft is continued, anything else started. */
export function taskAction(task: Pick<PortalTask, 'kind' | 'hasDraft'>): 'view' | 'continue' | 'start' {
  if (task.kind === 'acknowledgement') return 'view';
  return task.hasDraft ? 'continue' : 'start';
}

/** Rough time to fill in, shown on the card. Confirming a record has no estimate. */
export const TASK_MINUTES: Record<TaskKind, number | null> = { nmq: 3, cbi: 3, overload: 1, acknowledgement: null };

/**
 * The API writes titles in the account's language (an NMQ title adds the batch name staff typed). When this device
 * shows another language, or the account's is not known yet, the translated name of the kind of task is used instead.
 */
export function taskTitle(task: Pick<PortalTask, 'kind' | 'title'>, lang: string, accountLang: string | undefined, kindLabel: (kind: TaskKind) => string): string {
  return lang === accountLang ? task.title : kindLabel(task.kind);
}
