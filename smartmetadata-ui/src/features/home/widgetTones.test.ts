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
import { MY_DATA_WIDGET_KEYS } from './landingPageLayout';
import { getWidgetTone } from './widgetTones';

describe('widgetTones', () => {
  it('covers every home topic widget with an icon and token tints', () => {
    for (const key of MY_DATA_WIDGET_KEYS) {
      const tone = getWidgetTone(key);
      expect(tone, key).toBeDefined();
      expect(typeof tone?.icon).toBe('function');
      expect(tone?.bg).toMatch(/^var\(--sm-/);
      expect(tone?.fg).toMatch(/^var\(--sm-/);
    }
  });

  it('returns nothing for an unknown key', () => {
    expect(getWidgetTone('KnowledgePanel.Nope')).toBeUndefined();
  });
});
