/**
 * Copyright 2026 SmartMetadata authors.
 * Licensed under the Apache License, Version 2.0.
 */
import { mount, type VueWrapper } from '@vue/test-utils';
import Antd from 'ant-design-vue';
import { describe, expect, it } from 'vitest';
import { createI18n } from 'vue-i18n';
import SmRichTextEditor from '@/components/shared/SmRichTextEditor.vue';
import ServiceNameCard from './ServiceNameCard.vue';

const MESSAGES = {
  'en-US': {
    settings: {
      services: {
        wizard: {
          nameThisService: 'Name this service',
          nameThisServiceDescription:
            'A unique name for this {serviceType} connection in {brandName}.',
          serviceNameRule: 'Must be unique within this service category.',
          addDescriptionPlaceholder: 'Add a description for the service',
          addDescription: 'Add a description',
        },
      },
    },
    product: { name: 'iSmart' },
  },
};

function mountCard(props: Record<string, unknown>): VueWrapper {
  return mount(ServiceNameCard, {
    props: { serviceType: 'Postgres', name: '', description: '', ...props },
    attachTo: document.body,
    global: {
      plugins: [Antd, createI18n({ legacy: false, locale: 'en-US', messages: MESSAGES })],
    },
  });
}

describe('ServiceNameCard', () => {
  it('renders the title, lead with service type and brand, and the rule hint', () => {
    const wrapper = mountCard({});
    expect(wrapper.text()).toContain('Name this service');
    expect(wrapper.text()).toContain('A unique name for this Postgres connection in iSmart.');
    expect(wrapper.text()).toContain('Must be unique within this service category.');
    expect(wrapper.find('#service-name').exists()).toBe(true);
  });

  it('shows the name error in place of the rule hint', () => {
    const wrapper = mountCard({ nameError: 'Name is taken' });
    expect(wrapper.text()).toContain('Name is taken');
    expect(wrapper.text()).not.toContain('Must be unique within this service category.');
  });

  it('collapses the description editor when empty and reveals it with one focus notification', async () => {
    const wrapper = mountCard({});
    expect(wrapper.findComponent(SmRichTextEditor).exists()).toBe(false);
    await wrapper.find('[data-testid="add-description-button"]').trigger('click');
    expect(wrapper.findComponent(SmRichTextEditor).exists()).toBe(true);
    // The name input's autofocus fires one serviceName notification on
    // mount; the reveal must add exactly one serviceDescription.
    const focusEvents = (wrapper.emitted('focus') ?? []).map(([field]) => field);
    expect(focusEvents.filter((field) => field === 'serviceDescription')).toHaveLength(1);
    expect(focusEvents.at(-1)).toBe('serviceDescription');
  });

  it('shows the editor immediately when a description exists', () => {
    const wrapper = mountCard({ description: '<p>hello</p>' });
    expect(wrapper.findComponent(SmRichTextEditor).exists()).toBe(true);
    expect(wrapper.find('[data-testid="add-description-button"]').exists()).toBe(false);
  });

  it('forwards editor focus and text changes without duplicate notifications', async () => {
    const wrapper = mountCard({ description: '<p>hello</p>' });
    const editor = wrapper.findComponent(SmRichTextEditor);
    await editor.vm.$emit('focus');
    await editor.vm.$emit('text-change', '<p>updated</p>');
    const focusEvents = (wrapper.emitted('focus') ?? []).map(([field]) => field);
    expect(focusEvents.filter((field) => field === 'serviceDescription')).toHaveLength(1);
    expect(wrapper.emitted('update:description')).toEqual([['<p>updated</p>']]);
  });

  it('maps name input focus and edits to the serviceName channel', async () => {
    const wrapper = mountCard({});
    const input = wrapper.find('#service-name');
    await input.trigger('focus');
    await input.setValue('warehouse');
    // Mount-time autofocus plus the explicit focus: every notification
    // on this channel is serviceName, and exactly one edit is emitted.
    const focusEvents = (wrapper.emitted('focus') ?? []).map(([field]) => field);
    expect(focusEvents.length).toBeGreaterThan(0);
    expect(focusEvents.every((field) => field === 'serviceName')).toBe(true);
    // antd Input reports the edit on both input and change events;
    // every report carries the same value.
    const nameEvents = wrapper.emitted('update:name') ?? [];
    expect(nameEvents.length).toBeGreaterThan(0);
    expect(nameEvents.every(([value]) => value === 'warehouse')).toBe(true);
  });

  it('carries no displayName field', () => {
    const wrapper = mountCard({});
    expect(wrapper.text()).not.toContain('Display name');
    expect(wrapper.findAll('input').length).toBe(1);
  });
});
