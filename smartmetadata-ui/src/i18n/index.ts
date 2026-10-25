/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { createI18n } from 'vue-i18n';
import enUS from './locales/en-US';
import zhCN from './locales/zh-CN';
import {
  DEFAULT_LOCALE,
  persistLocale,
  resolveInitialLocale,
  type SupportedLocale,
} from './localePreference';

export const messages = {
  'en-US': enUS,
  'zh-CN': zhCN,
} as const;

export function createAppI18n(
  storage: Storage = window.localStorage,
  languages: readonly string[] = typeof navigator !== 'undefined' ? navigator.languages : [],
) {
  const locale = resolveInitialLocale(storage, languages);
  return createI18n({
    legacy: false,
    locale,
    fallbackLocale: DEFAULT_LOCALE,
    messages,
  });
}

export function applyDocumentLang(locale: SupportedLocale): void {
  if (typeof document !== 'undefined') {
    document.documentElement.lang = locale;
  }
}

export function setAppLocale(
  locale: SupportedLocale,
  current: { value: string },
  storage: Storage = window.localStorage,
): void {
  current.value = locale;
  persistLocale(storage, locale);
  applyDocumentLang(locale);
}
