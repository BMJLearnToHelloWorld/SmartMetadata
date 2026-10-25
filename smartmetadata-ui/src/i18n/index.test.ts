/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { afterEach, describe, expect, it } from 'vitest';
import { setAppLocale } from './index';
import { LOCALE_STORAGE_KEY } from './localePreference';

describe('setAppLocale', () => {
  afterEach(() => {
    localStorage.clear();
    document.documentElement.lang = 'en';
  });

  it('writes sm.locale.v1 and document lang', () => {
    const current = { value: 'en-US' };
    setAppLocale('zh-CN', current, window.localStorage);
    expect(current.value).toBe('zh-CN');
    expect(localStorage.getItem(LOCALE_STORAGE_KEY)).toBe('zh-CN');
    expect(document.documentElement.lang).toBe('zh-CN');
  });
});
