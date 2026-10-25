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
import enUS from './locales/en-US';
import zhCN from './locales/zh-CN';

function leafKeys(value: unknown, prefix = ''): string[] {
  if (value !== null && typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>).flatMap(([key, child]) =>
      leafKeys(child, prefix ? `${prefix}.${key}` : key),
    );
  }
  return prefix ? [prefix] : [];
}

describe('i18n catalogs', () => {
  it('keeps zh-CN and en-US keys in lockstep', () => {
    expect(leafKeys(zhCN).sort()).toEqual(leafKeys(enUS).sort());
  });

  it('covers shell, nav, login, Explore, and asset tabs', () => {
    const keys = leafKeys(enUS);
    expect(keys).toContain('nav.explore');
    expect(keys).toContain('nav.lineage');
    expect(keys).toContain('nav.observability');
    expect(keys).toContain('chrome.logout');
    expect(keys).toContain('chrome.searchPlaceholder');
    expect(keys).toContain('login.submit');
    expect(keys).toContain('explore.title');
    expect(keys).toContain('explore.facets.entityType');
    expect(keys).toContain('asset.tabs.overview');
    expect(keys).toContain('asset.tabs.schema');
    expect(keys).toContain('asset.tabs.lineage');
    expect(keys).toContain('asset.tabs.quality');
    expect(keys).toContain('lineage.title');
    expect(keys).toContain('lineage.searchPlaceholder');
    expect(keys).toContain('lineage.findNode');
    expect(keys).toContain('lineage.columnsLead');
  });
});
