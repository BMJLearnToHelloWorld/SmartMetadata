/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may
 * not use this file except in compliance with the License. You may obtain
 * a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { describe, expect, it } from 'vitest';
import { LANDING_PAGE_WIDGET_KEYS, MY_DATA_WIDGET_KEYS } from './landingPageLayout';
import {
  MY_DATA_WIDGET_REGISTRY_KEYS,
  myDataWidgetSlug,
  resolveMyDataWidget,
  resolveMyDataWidgetBaseKey,
} from './landingPageWidgets';

describe('landing page widget registry', () => {
  it('covers exactly the 13 known keys, in default-layout order', () => {
    expect(MY_DATA_WIDGET_REGISTRY_KEYS).toEqual([...MY_DATA_WIDGET_KEYS]);
    expect(MY_DATA_WIDGET_REGISTRY_KEYS).toHaveLength(13);
  });

  it('resolves every known key, including instance keys with a uniqueId suffix', () => {
    for (const key of MY_DATA_WIDGET_KEYS) {
      expect(resolveMyDataWidget(key)).not.toBeNull();
      expect(resolveMyDataWidget(`${key}-211`)).not.toBeNull();
    }
    expect(resolveMyDataWidget(LANDING_PAGE_WIDGET_KEYS.DOMAINS)).toBe(
      resolveMyDataWidget('KnowledgePanel.Domains-211'),
    );
  });

  it('resolves an unknown key to null — the fail-safe that renders nothing', () => {
    expect(resolveMyDataWidget('KnowledgePanel.Foo')).toBeNull();
    expect(resolveMyDataWidget('KnowledgePanel.MyData')).toBeNull();
    expect(resolveMyDataWidget('')).toBeNull();
  });

  it('returns the stable base key for a layout entry', () => {
    expect(resolveMyDataWidgetBaseKey('KnowledgePanel.Domains-211')).toBe(
      LANDING_PAGE_WIDGET_KEYS.DOMAINS,
    );
    expect(resolveMyDataWidgetBaseKey('KnowledgePanel.Foo')).toBe('KnowledgePanel.Foo');
  });

  it('derives the test-id slug from the widget key', () => {
    expect(myDataWidgetSlug(LANDING_PAGE_WIDGET_KEYS.KNOWLEDGE_CENTER)).toBe(
      'knowledge-center',
    );
    expect(myDataWidgetSlug(LANDING_PAGE_WIDGET_KEYS.ACTIVITY_FEED)).toBe('activity-feed');
    expect(myDataWidgetSlug(LANDING_PAGE_WIDGET_KEYS.DATA_PRODUCTS)).toBe('data-products');
  });
});
