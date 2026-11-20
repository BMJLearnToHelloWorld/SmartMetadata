/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may
 * not use this file except in compliance with the License. You may obtain
 * a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { flushPromises } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PersonaPage } from '@/types/persona';
import { getDefaultTabs } from './customizePageData';
import DomainPageEditor from './DomainPageEditor.vue';
import { cleanupBody, mountPageEditor } from './testHarness';

/**
 * N-4: the jsonPatchEmpty predicate family (Domain/DataProduct/
 * Marketplace use fast-json-patch `compare().length === 0` in
 * official; the product uses `jsonPatchEmpty`) — Save stays disabled
 * while the edited page equals the original, enables on a one-field
 * change, and the header button linkage holds. The Details editor
 * covers the isSameDetailsPageLayout family; Glossary shares it.
 */
describe('DomainPageEditor save-disable contract (N-4)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanupBody();
  });

  function domainPage(): PersonaPage {
    return {
      pageType: 'Domain',
      tabs: getDefaultTabs('Domain') as unknown as PersonaPage['tabs'],
    } as PersonaPage;
  }

  it('keeps save disabled while the edited page equals the original', async () => {
    const { wrapper } = await mountPageEditor(DomainPageEditor, {
      currentPage: domainPage(),
      currentPageType: 'Domain',
      originalPage: domainPage(),
    });
    expect(wrapper.get('[data-testid="save-button"]').attributes('disabled')).toBeDefined();
  });

  it('enables save on a one-widget change and saves the edited page', async () => {
    const { wrapper, currentPage, onSaveLayout } = await mountPageEditor(DomainPageEditor, {
      currentPage: domainPage(),
      currentPageType: 'Domain',
      originalPage: domainPage(),
    });
    const layoutOf = () =>
      (currentPage.value?.tabs?.[0] as unknown as Record<string, unknown>)
        .layout as Array<Record<string, unknown>>;
    const topLevelKey = String(layoutOf().find((item) => item.x === 6)?.i ?? layoutOf()[0].i);
    await wrapper.get(`[data-testid="widget-remove-${topLevelKey}"]`).trigger('click');
    await flushPromises();
    expect(wrapper.get('[data-testid="save-button"]').attributes('disabled')).toBeUndefined();
    await wrapper.get('[data-testid="save-button"]').trigger('click');
    await flushPromises();
    expect(onSaveLayout).toHaveBeenCalledTimes(1);
    expect(onSaveLayout).toHaveBeenCalledWith(currentPage.value);
  });
});
