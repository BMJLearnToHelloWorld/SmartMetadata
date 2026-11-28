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
import { createTestI18n } from '@/test/i18n';
import { observabilityChildBreadcrumb } from './observabilityBreadcrumbs';

describe('observabilityChildBreadcrumb', () => {
  it('uses nav.observability (数据监控) as the root crumb in zh-CN', () => {
    const i18n = createTestI18n('zh-CN');
    const items = observabilityChildBreadcrumb(i18n.global.t, 'label.data-quality');
    expect(items[0].label).toBe('数据监控');
    expect(items[0].label).not.toBe('观测');
    expect(items[1].label).toBe('数据质量');
  });
});