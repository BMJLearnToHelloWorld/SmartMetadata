/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */

export const LOCALE_STORAGE_KEY = 'sm.locale.v1';

export const SUPPORTED_LOCALES = ['en-US', 'zh-CN'] as const;

export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];

export const DEFAULT_LOCALE: SupportedLocale = 'en-US';

export function isSupportedLocale(value: unknown): value is SupportedLocale {
  return value === 'en-US' || value === 'zh-CN';
}

export function readStoredLocale(storage: Storage): SupportedLocale | null {
  const raw = storage.getItem(LOCALE_STORAGE_KEY);
  return isSupportedLocale(raw) ? raw : null;
}

export function persistLocale(storage: Storage, locale: SupportedLocale): void {
  storage.setItem(LOCALE_STORAGE_KEY, locale);
}

/**
 * Stored preference wins. Otherwise a zh* browser language maps to zh-CN;
 * everything else stays en-US. Do not invent additional locales here.
 */
export function resolveInitialLocale(
  storage: Storage,
  languages: readonly string[] = [],
): SupportedLocale {
  const stored = readStoredLocale(storage);
  if (stored) {
    return stored;
  }
  const prefersChinese = languages.some((language) => {
    const normalized = language.toLowerCase().replace('_', '-');
    return normalized === 'zh' || normalized.startsWith('zh-');
  });
  return prefersChinese ? 'zh-CN' : DEFAULT_LOCALE;
}
