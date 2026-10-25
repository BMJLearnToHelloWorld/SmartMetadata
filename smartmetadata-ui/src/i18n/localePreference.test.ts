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
import {
  DEFAULT_LOCALE,
  LOCALE_STORAGE_KEY,
  persistLocale,
  readStoredLocale,
  resolveInitialLocale,
} from './localePreference';

function memoryStorage(initial: Record<string, string> = {}): Storage {
  const data = { ...initial };
  return {
    get length() {
      return Object.keys(data).length;
    },
    clear() {
      for (const key of Object.keys(data)) {
        delete data[key];
      }
    },
    getItem(key: string) {
      return data[key] ?? null;
    },
    key(index: number) {
      return Object.keys(data)[index] ?? null;
    },
    removeItem(key: string) {
      delete data[key];
    },
    setItem(key: string, value: string) {
      data[key] = value;
    },
  };
}

describe('localePreference', () => {
  it('persists only supported locales under sm.locale.v1', () => {
    const storage = memoryStorage();
    persistLocale(storage, 'zh-CN');
    expect(storage.getItem(LOCALE_STORAGE_KEY)).toBe('zh-CN');
    expect(readStoredLocale(storage)).toBe('zh-CN');
  });

  it('ignores unknown stored values', () => {
    const storage = memoryStorage({ [LOCALE_STORAGE_KEY]: 'fr-FR' });
    expect(readStoredLocale(storage)).toBeNull();
  });

  it('prefers the stored locale over the browser language', () => {
    const storage = memoryStorage({ [LOCALE_STORAGE_KEY]: 'en-US' });
    expect(resolveInitialLocale(storage, ['zh-CN'])).toBe('en-US');
  });

  it('uses zh-CN when nothing is stored and the browser is Chinese', () => {
    expect(resolveInitialLocale(memoryStorage(), ['zh-Hans-CN', 'en'])).toBe('zh-CN');
  });

  it('defaults to en-US when nothing is stored and the browser is not Chinese', () => {
    expect(resolveInitialLocale(memoryStorage(), ['en-GB'])).toBe(DEFAULT_LOCALE);
  });
});
