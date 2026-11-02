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
import { ACTIVITY_RANGE_PRESETS, TASK_STATUS_TABS, taskStatusQuery } from './collaborationTabs';

describe('collaborationTabs', () => {
  it('keeps the evidenced open status group and omits it for all', () => {
    expect(TASK_STATUS_TABS.map((tab) => tab.key)).toEqual(['open', 'all']);
    expect(taskStatusQuery(TASK_STATUS_TABS[0])).toEqual({ statusGroup: 'open' });
    expect(taskStatusQuery(TASK_STATUS_TABS[1])).toEqual({});
  });

  it('offers the 7-day default and the 30-day entity-activity default', () => {
    expect(ACTIVITY_RANGE_PRESETS.map((preset) => preset.days)).toEqual([7, 30]);
  });
});
