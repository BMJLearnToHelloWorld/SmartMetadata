/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { describe, expect, it } from 'vitest';
import { TASK_ACTIONS, TASK_TERMINAL_STATUSES, isTaskActionable, isTaskTerminalStatus } from './taskActions';

describe('taskActions', () => {
  it('covers the five official TaskActionMode values exactly once', () => {
    expect(TASK_ACTIONS.map((action) => action.key).sort()).toEqual(
      ['close', 'edit', 're-assign', 'resolve', 'view'],
    );
  });

  it('wires only resolve and close; every unwired action carries a residual key', () => {
    expect(TASK_ACTIONS.filter((action) => action.wired).map((action) => action.key).sort()).toEqual([
      'close',
      'resolve',
    ]);
    for (const action of TASK_ACTIONS.filter((item) => !item.wired)) {
      expect(action.residualKey).toBeTruthy();
    }
  });

  it('treats the official terminal statuses as not actionable and Open as actionable', () => {
    for (const status of TASK_TERMINAL_STATUSES) {
      expect(isTaskTerminalStatus(status)).toBe(true);
      expect(isTaskActionable(status)).toBe(false);
    }
    expect(isTaskActionable('Open')).toBe(true);
    expect(isTaskActionable(undefined)).toBe(true);
  });

  it('treats the product close outcome Closed as terminal (bridge addition)', () => {
    expect(isTaskTerminalStatus('Closed')).toBe(true);
    expect(isTaskActionable('Closed')).toBe(false);
  });
});
