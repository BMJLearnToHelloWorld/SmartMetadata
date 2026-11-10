/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may
 * not use this file except in compliance with the License. You may obtain
 * a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { describe, expect, it } from 'vitest';
import type { CollaborationTask } from '@/types/collaboration';
import { getTaskTitle } from './taskTitle';

function task(overrides: Partial<CollaborationTask> & { id: string }): CollaborationTask {
  return { assignees: [], comments: [], ...overrides };
}

describe('getTaskTitle', () => {
  it('prefers the authored display name', () => {
    expect(getTaskTitle(task({ id: 't1', displayName: 'Fix the description' }))).toBe(
      'Fix the description',
    );
  });

  it('falls back to the description when the name merely repeats the id', () => {
    expect(
      getTaskTitle(task({ id: 't1', name: 't1', description: 'Request access\nto the table' })),
    ).toBe('Request access to the table');
  });

  it('falls back to #id when there is nothing else', () => {
    expect(getTaskTitle(task({ id: 't1' }))).toBe('#t1');
  });
});
