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
import { requiredField } from './formRules';

describe('requiredField', () => {
  it('uses OM label.field-required wording', () => {
    const en = createTestI18n('en-US');
    expect(requiredField(en.global.t, 'Name')).toEqual([{ required: true, message: 'Name is required' }]);
    const zh = createTestI18n('zh-CN');
    expect(requiredField(zh.global.t, '名称')).toEqual([{ required: true, message: '需要名称' }]);
  });
});
