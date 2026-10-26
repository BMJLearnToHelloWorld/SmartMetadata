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
import { incidentStatusLabel } from './incidentStatus';

describe('incidentStatusLabel', () => {
  it('localizes Ack and Resolved to OM labels', () => {
    const en = createTestI18n('en-US');
    expect(incidentStatusLabel(en.global.t, 'Ack')).toBe('Acknowledged');
    expect(incidentStatusLabel(en.global.t, 'Resolved')).toBe('Resolved');
    expect(incidentStatusLabel(en.global.t, 'New')).toBe('New');
    const zh = createTestI18n('zh-CN');
    expect(incidentStatusLabel(zh.global.t, 'Ack')).toBe('已确认');
    expect(incidentStatusLabel(zh.global.t, 'Resolved')).toBe('已解决');
  });
});
