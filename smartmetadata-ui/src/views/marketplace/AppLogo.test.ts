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
import { nextTick } from 'vue';
import AppLogo from './AppLogo.vue';

describe('AppLogo', () => {
  it('renders the app logo in a 100px circle', () => {
    const wrapper = mount(AppLogo, { props: { appName: 'SearchIndexingApplication' } });
    const img = wrapper.find('img');
    expect(img.exists()).toBe(true);
    expect(img.attributes('alt')).toBe('SearchIndexingApplication');
    expect(img.attributes('src')).toBeTruthy();
    const circle = wrapper.find('div');
    expect(circle.element.getAttribute('style')).toContain('width: 100px');
    expect(circle.element.getAttribute('style')).toContain('border-radius: 50%');
  });

  it('re-resolves when the app name changes', async () => {
    const wrapper = mount(AppLogo, { props: { appName: 'SearchIndexingApplication' } });
    const first = wrapper.find('img').attributes('src');
    await wrapper.setProps({ appName: 'McpApplication' });
    await nextTick();
    expect(wrapper.find('img').attributes('src')).toBeTruthy();
    expect(wrapper.find('img').attributes('src')).not.toBe(first);
  });

  it('prefers an explicit logo URL and falls back on load error', async () => {
    const wrapper = mount(AppLogo, {
      props: { appName: 'SearchIndexingApplication', logo: 'https://example.com/logo.svg' },
    });
    expect(wrapper.find('img').attributes('src')).toBe('https://example.com/logo.svg');
    await wrapper.find('img').trigger('error');
    await nextTick();
    const fallback = wrapper.find('img').attributes('src');
    expect(fallback).toBeTruthy();
    expect(fallback).not.toBe('https://example.com/logo.svg');
  });
});
