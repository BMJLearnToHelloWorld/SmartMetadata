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
import { createTestI18n } from '@/test/i18n';
import type { PersonaPage } from '@/types/persona';
import { getDefaultTabs } from './customizePageData';
import DataProductPageEditor from './DataProductPageEditor.vue';
import DetailsPageEditor from './DetailsPageEditor.vue';
import DomainPageEditor from './DomainPageEditor.vue';
import GlossaryPageEditor from './GlossaryPageEditor.vue';
import { cleanupBody, clickBody, mountPageEditor } from './testHarness';

const PLACEHOLDER = 'ExtraWidget.EmptyWidgetPlaceholder';

function pageFor(pageType: string): PersonaPage {
  return {
    pageType,
    tabs: getDefaultTabs(pageType) as unknown as PersonaPage['tabs'],
  } as PersonaPage;
}

function withPlaceholder(page: PersonaPage): PersonaPage {
  const copy = JSON.parse(JSON.stringify(page)) as PersonaPage;
  const tabs = copy.tabs as unknown as Array<Record<string, unknown>>;
  (tabs[0].layout as unknown[]).push({ i: PLACEHOLDER, x: 0, y: 99, w: 3, h: 2 });
  return copy;
}

describe('Special pages', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanupBody();
  });

  it('Domain uses the raw compare: a placeholder-only difference is dirty', async () => {
    const { wrapper } = await mountPageEditor(DomainPageEditor, {
      currentPage: withPlaceholder(pageFor('Domain')),
      currentPageType: 'Domain',
      originalPage: pageFor('Domain'),
    });
    expect(wrapper.find('[data-testid="domain-page-editor"]').exists()).toBe(true);
    expect(wrapper.get('[data-testid="save-button"]').attributes('disabled')).toBeUndefined();
  });

  it('Details uses isSameDetailsPageLayout: a placeholder-only difference is clean', async () => {
    const { wrapper } = await mountPageEditor(DetailsPageEditor, {
      currentPage: withPlaceholder(pageFor('Table')),
      currentPageType: 'Table',
      originalPage: pageFor('Table'),
    });
    expect(wrapper.get('[data-testid="save-button"]').attributes('disabled')).toBeDefined();
  });

  it('Domain renders breadcrumbs with the Domains first crumb', async () => {
    const i18n = createTestI18n();
    const { wrapper } = await mountPageEditor(DomainPageEditor, {
      currentPage: pageFor('Domain'),
      currentPageType: 'Domain',
      originalPage: pageFor('Domain'),
    });
    expect(wrapper.find('[data-testid="preview-entity-header"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="preview-entity-name"]').text()).toBe('Engineering');
    const crumbs = wrapper.find('.ant-breadcrumb').text();
    expect(crumbs).toContain(i18n.global.t('nav.domains'));
  });

  it('DataProduct renders the single marketplace crumb', async () => {
    const i18n = createTestI18n();
    const { wrapper } = await mountPageEditor(DataProductPageEditor, {
      currentPage: pageFor('DataProduct'),
      currentPageType: 'DataProduct',
      originalPage: pageFor('DataProduct'),
    });
    expect(wrapper.find('[data-testid="data-product-page-editor"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="preview-entity-name"]').text()).toBe(
      'Sample Data Product',
    );
    const crumbs = wrapper.find('.ant-breadcrumb').text();
    expect(crumbs).toContain(i18n.global.t('marketplace.dataProducts'));
    expect(crumbs).not.toContain(i18n.global.t('nav.domains'));
  });

  it('DataProduct still renders with an empty currentPageType and disables save', async () => {
    const { wrapper } = await mountPageEditor(DataProductPageEditor, {
      currentPage: null,
      currentPageType: '',
      originalPage: null,
    });
    expect(wrapper.find('[data-testid="data-product-page-editor"]').exists()).toBe(true);
    expect(wrapper.get('[data-testid="save-button"]').attributes('disabled')).toBeDefined();
  });

  it('DataProduct reset calls save with no arguments', async () => {
    const { wrapper, onSaveLayout } = await mountPageEditor(DataProductPageEditor, {
      currentPage: pageFor('DataProduct'),
      currentPageType: 'DataProduct',
      originalPage: pageFor('DataProduct'),
    });
    await wrapper.get('[data-testid="reset-button"]').trigger('click');
    await flushPromises();
    clickBody('.ant-modal-confirm-btns .ant-btn-primary');
    await flushPromises();
    expect(onSaveLayout).toHaveBeenCalledTimes(1);
    expect(onSaveLayout).toHaveBeenCalledWith();
  });

  it('Glossary renders with isGlossary true and GlossaryTerm with false', async () => {
    const glossary = await mountPageEditor(GlossaryPageEditor, {
      currentPage: pageFor('Glossary'),
      currentPageType: 'Glossary',
      originalPage: pageFor('Glossary'),
      props: { isGlossary: true },
    });
    expect(
      glossary.wrapper.find('[data-testid="preview-glossary-header"]').attributes(
        'data-is-glossary',
      ),
    ).toBe('true');
    expect(glossary.wrapper.find('[data-testid="tab-terms"]').exists()).toBe(true);
    cleanupBody();

    const term = await mountPageEditor(GlossaryPageEditor, {
      currentPage: pageFor('GlossaryTerm'),
      currentPageType: 'GlossaryTerm',
      originalPage: pageFor('GlossaryTerm'),
      props: { isGlossary: false },
    });
    expect(
      term.wrapper.find('[data-testid="preview-glossary-header"]').attributes(
        'data-is-glossary',
      ),
    ).toBe('false');
    expect(term.wrapper.find('[data-testid="tab-overview"]').exists()).toBe(true);
  });

  it('Glossary renders nothing with an empty currentPageType', async () => {
    const { wrapper } = await mountPageEditor(GlossaryPageEditor, {
      currentPage: null,
      currentPageType: '',
      originalPage: null,
      props: { isGlossary: true },
    });
    expect(wrapper.find('[data-testid="glossary-page-editor"]').exists()).toBe(false);
  });

  it('Glossary uses isSameDetailsPageLayout: a placeholder-only difference is clean', async () => {
    const { wrapper } = await mountPageEditor(GlossaryPageEditor, {
      currentPage: withPlaceholder(pageFor('GlossaryTerm')),
      currentPageType: 'GlossaryTerm',
      originalPage: pageFor('GlossaryTerm'),
      props: { isGlossary: false },
    });
    expect(wrapper.get('[data-testid="save-button"]').attributes('disabled')).toBeDefined();
  });
});
