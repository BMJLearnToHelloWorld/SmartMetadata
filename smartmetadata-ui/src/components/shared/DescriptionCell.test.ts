/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import { createI18n } from 'vue-i18n';
import DescriptionCell from './DescriptionCell.vue';

function createCellI18n() {
  return createI18n({
    legacy: false,
    locale: 'en',
    messages: { en: { label: { 'no-description': 'No description' } } },
  });
}

function mountCell(markdown?: string) {
  return mount(DescriptionCell, {
    props: { markdown },
    global: { plugins: [createCellI18n()] },
  });
}

describe('DescriptionCell (official RichTextEditorPreviewerNew empty branch)', () => {
  // The empty-<p> regex matches a literal U+00A0, not the `&nbsp;` entity text (official regex).
  it.each([undefined, '', '   ', '<p></p>', '<p> </p>', '<p>\u00A0</p>'])(
    'renders the no-description span for empty content %j',
    (markdown) => {
      const wrapper = mountCell(markdown);
      expect(wrapper.text()).toBe('No description');
      expect(wrapper.find('[data-testid="sm-markdown"]').exists()).toBe(false);
    },
  );

  it('renders non-empty markdown through the previewer', () => {
    const wrapper = mountCell('**bold** description');
    expect(wrapper.find('[data-testid="sm-markdown"]').exists()).toBe(true);
    expect(wrapper.html()).toContain('<strong>bold</strong>');
    expect(wrapper.text()).not.toContain('No description');
  });
});
