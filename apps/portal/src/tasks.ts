import type { Schemas } from '@yutis/api-client';

export type PortalTask = Schemas['TaskDto'];
export type TaskKind = PortalTask['kind'];

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

/** Rough time to fill in, shown on the card. Confirming a record has no estimate. */
export const TASK_MINUTES: Record<TaskKind, number | null> = { nmq: 3, cbi: 3, overload: 1, acknowledgement: null };

/**
 * The API writes titles in Chinese (an NMQ title includes the batch name staff typed). Other languages get the
 * translated name of the kind of task instead.
 */
export function taskTitle(task: Pick<PortalTask, 'kind' | 'title'>, lang: string, kindLabel: (kind: TaskKind) => string): string {
  return lang === 'zh' ? task.title : kindLabel(task.kind);
}
