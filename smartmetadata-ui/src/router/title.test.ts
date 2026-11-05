/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { nextTick, ref } from 'vue';
import { describe, expect, it, vi } from 'vitest';
import { documentTitleFor, installDocumentTitle, resolveDocumentTitleKey } from './title';

const translations: Record<string, string> = {
  'nav.home': 'My data',
  'nav.explore': 'Explore',
  'nav.domains': 'Domains',
  'nav.overview': 'Overview',
  'auth.forgotTitle': 'Forgot password',
  'auth.logoutTitle': 'Logging out',
};

const zhTranslations: Record<string, string> = {
  'nav.home': '我的数据',
  'auth.forgotTitle': '忘记密码',
};

const t = (key: string): string => translations[key] ?? key;

function route(name: string, meta: Record<string, unknown> = {}): Parameters<typeof documentTitleFor>[0] {
  return { name, meta } as Parameters<typeof documentTitleFor>[0];
}

describe('document title', () => {
  it('uses the sidebar entry for a nav page', () => {
    expect(documentTitleFor(route('home'), t)).toBe('My data - iSmart');
    expect(documentTitleFor(route('search'), t)).toBe('Explore - iSmart');
  });

  it('falls back to the list page for a detail route', () => {
    expect(documentTitleFor(route('governance-domain'), t)).toBe('Domains - iSmart');
    expect(documentTitleFor(route('asset'), t)).toBe('Explore - iSmart');
  });

  it('uses the sidebar entry for a former shell page turned real page (fixes batch 1)', () => {
    expect(resolveDocumentTitleKey(route('column-bulk-ops'))).toBe('nav.columnBulkOps');
  });

  it('uses the sidebar entry for a former shell page turned real page (P2 B2)', () => {
    expect(resolveDocumentTitleKey(route('marketplace-overview'))).toBe('nav.overview');
  });

  it('uses existing auth/error keys for routes outside the sidebar', () => {
    expect(documentTitleFor(route('forgot-password'), t)).toBe('Forgot password - iSmart');
    expect(documentTitleFor(route('logout'), t)).toBe('Logging out - iSmart');
  });

  it('uses the product name alone when nothing matches (login)', () => {
    expect(documentTitleFor(route('login'), t)).toBe('iSmart');
  });

  it('lets an explicit meta titleKey win', () => {
    expect(resolveDocumentTitleKey(route('home', { titleKey: 'nav.domains' }))).toBe(
      'nav.domains',
    );
  });

  it('re-applies on navigation and on locale switch', async () => {
    const locale = ref('en');
    let afterEachHandler: (() => void) | undefined;
    const router = {
      currentRoute: ref(route('home')),
      afterEach: vi.fn((handler: () => void) => {
        afterEachHandler = handler;
      }),
    };
    const localeAwareT = (key: string): string =>
      locale.value === 'zh' ? (zhTranslations[key] ?? t(key)) : t(key);
    const i18n = { global: { t: localeAwareT, locale } };
    installDocumentTitle(
      router as unknown as Parameters<typeof installDocumentTitle>[0],
      i18n as Parameters<typeof installDocumentTitle>[1],
    );
    afterEachHandler?.();
    expect(document.title).toBe('My data - iSmart');
    router.currentRoute.value = route('forgot-password');
    afterEachHandler?.();
    expect(document.title).toBe('Forgot password - iSmart');
    locale.value = 'zh';
    await nextTick();
    expect(document.title).toBe('忘记密码 - iSmart');
  });
});
