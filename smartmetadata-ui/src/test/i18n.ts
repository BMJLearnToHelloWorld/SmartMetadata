/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { createAppI18n } from '@/i18n';
import type { SupportedLocale } from '@/i18n/localePreference';

export function createTestI18n(locale: SupportedLocale = 'en-US') {
  const storage = window.localStorage;
  storage.setItem('sm.locale.v1', locale);
  return createAppI18n(storage, []);
}
