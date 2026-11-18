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
import { useI18n } from 'vue-i18n';
import { createApp, defineComponent, h } from 'vue';
import {
  OFFICIAL_TAB_LABEL_TO_PRODUCT_KEY,
  defaultTabLabelResolver,
  resolveTabLabel,
} from './tabLabels';
import type { CustomizeTab } from './customizeTypes';

function translator(locale: 'en-US' | 'zh-CN'): (key: string) => string {
  let t: ((key: string) => string) | undefined;
  const probe = defineComponent({
    setup() {
      t = useI18n().t as (key: string) => string;
      return () => h('div');
    },
  });
  const app = createApp(probe);
  app.use(createTestI18n(locale));
  const el = document.createElement('div');
  app.mount(el);
  app.unmount();
  if (!t) {
    throw new Error('translator probe did not run');
  }
  return t;
}

describe('tab label keys (TAB_LABEL_MAP coverage)', () => {
  it('maps every distinct TAB_LABEL_MAP value (52; data-observability shared)', () => {
    expect(Object.keys(OFFICIAL_TAB_LABEL_TO_PRODUCT_KEY)).toHaveLength(52);
    expect(OFFICIAL_TAB_LABEL_TO_PRODUCT_KEY['label.data-observability']).toBe(
      'asset.tabs.dataObservability',
    );
  });

  it('resolves every mapped key in both catalogs, never echoing the key', () => {
    const enT = translator('en-US');
    const zhT = translator('zh-CN');
    for (const [labelKey, productKey] of Object.entries(
      OFFICIAL_TAB_LABEL_TO_PRODUCT_KEY,
    )) {
      expect(enT(productKey), labelKey).not.toBe(productKey);
      expect(zhT(productKey), labelKey).not.toBe(productKey);
    }
  });

  it('renders the SQL tab as SQL (pin label.sql has no locale entry)', () => {
    const enT = translator('en-US');
    const zhT = translator('zh-CN');
    const tab = { name: 'sql', displayName: 'label.sql' } as CustomizeTab;
    expect(resolveTabLabel(enT, tab)).toBe('SQL');
    expect(resolveTabLabel(zhT, tab)).toBe('SQL');
  });

  it('renders the newly registered labels from the catalogs', () => {
    const enT = translator('en-US');
    const zhT = translator('zh-CN');
    expect(resolveTabLabel(enT, { name: 'x', displayName: 'label.glossary-term-plural' } as CustomizeTab)).toBe(
      'Glossary Terms',
    );
    expect(resolveTabLabel(zhT, { name: 'x', displayName: 'label.glossary-term-plural' } as CustomizeTab)).toBe(
      '术语',
    );
    expect(
      defaultTabLabelResolver(enT)('agents', 'label.agent-plural'),
    ).toBe('Agents');
    expect(
      defaultTabLabelResolver(zhT)('approval', 'label.approval'),
    ).toBe('审批');
  });

  it('falls back to the raw tab id for keys outside TAB_LABEL_MAP (pin getTabLabelFromId)', () => {
    const enT = translator('en-US');
    expect(
      resolveTabLabel(enT, { name: 'mystery', displayName: 'label.nope' } as CustomizeTab),
    ).toBe('mystery');
    expect(defaultTabLabelResolver(enT)('mystery', 'label.nope')).toBe('mystery');
  });
});
