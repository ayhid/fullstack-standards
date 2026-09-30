/**
 * RTK Query's cache keys are the endpoint plus its args; invalidation goes
 * through tags. This file is the tag factory, the counterpart of `queryKeys`:
 * no endpoint types a tag string by hand.
 *
 *   all       the resource root — invalidating it refetches every list,
 *             detail and scoped query of the resource
 *   list      provided by every list endpoint of the resource
 *   detail    provided per entity, by details and by list rows
 *
 * One type per resource, singular. A list providing `'Task'` and a mutation
 * invalidating `'Tasks'` never meet.
 */

export const tagTypes = ['Customer', 'Project', 'Task'] as const;

export type TagType = (typeof tagTypes)[number];

function resource<T extends TagType>(type: T) {
  return {
    all: type,
    list: { type, id: 'LIST' },
    detail: (id: number) => ({ type, id }),
  } as const;
}

export const tags = {
  customers: resource('Customer'),
  projects: resource('Project'),
  tasks: resource('Task'),
} as const;
