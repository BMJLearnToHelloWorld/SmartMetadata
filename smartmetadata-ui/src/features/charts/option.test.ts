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
import { SM_CHART_COLORS, SM_COLOR_PRIMARY } from '@/theme/tokens';
import { buildChartOption } from './option';

describe('buildChartOption', () => {
  it('uses OM categorical tokens instead of default antd chart hues', () => {
    const option = buildChartOption('donut', [
      { name: 'types', points: [{ label: 'table', value: 3 }] },
    ]);
    expect(option.color).toEqual([...SM_CHART_COLORS]);
    expect((option.color as string[])[0]).toBe(SM_COLOR_PRIMARY);
    expect(option.color).not.toContain('#1677ff');
    expect(option.color).not.toContain('#52c41a');
  });
});
