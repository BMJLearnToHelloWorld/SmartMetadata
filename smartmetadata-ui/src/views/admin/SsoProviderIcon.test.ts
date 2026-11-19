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
import { defineComponent, h } from 'vue';
import { createTestI18n } from '@/test/i18n';
import SsoProviderIcon from './SsoProviderIcon.vue';

describe('SsoProviderIcon', () => {
  it('renders nothing for a null icon', () => {
    const wrapper = mount(SsoProviderIcon, { props: { icon: null } });
    expect(wrapper.findAll('*').length).toBe(0);
  });

  it('renders an image for a string icon with alt and size', () => {
    const wrapper = mount(SsoProviderIcon, {
      props: { icon: '/img/icon-google.png', alt: 'Google', size: 22 },
    });
    const img = wrapper.find('img');
    expect(img.attributes('src')).toBe('/img/icon-google.png');
    expect(img.attributes('alt')).toBe('Google');
    expect(img.attributes('width')).toBe('22');
    expect(img.attributes('height')).toBe('22');
  });

  it('renders a component icon with the default size', () => {
    const IconStub = defineComponent({
      props: { size: { type: Number, default: 0 } },
      setup(props) {
        return () => h('svg', { 'data-size': props.size });
      },
    });
    const wrapper = mount(SsoProviderIcon, {
      props: { icon: IconStub },
      global: { plugins: [createTestI18n('en-US')] },
    });
    expect(wrapper.find('svg').attributes('data-size')).toBe('24');
  });
});
