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
import PermissionPlaceholder from './PermissionPlaceholder.vue';

function mountPlaceholder(permissionValue: string) {
  const i18n = createI18n({
    legacy: false,
    locale: 'en',
    messages: {
      en: {
        settings: {
          shell: {
            accessDenied: 'Access Denied',
            noAccessPlaceholder:
              "You don't have necessary permissions. Please check with the admin to get the {entity} permission.",
          },
        },
      },
    },
  });
  return mount(PermissionPlaceholder, {
    props: { permissionValue },
    global: { plugins: [i18n] },
  });
}

describe('PermissionPlaceholder (§5.4)', () => {
  it('renders the access-denied title and the description with the given entity', () => {
    const wrapper = mountPlaceholder('View');
    expect(wrapper.find('[data-testid="permission-error-placeholder"]').exists()).toBe(true);
    expect(wrapper.find('h3').text()).toBe('Access Denied');
    expect(wrapper.text()).toContain('get the View permission');
  });

  it('interpolates the caller-supplied entity, never a hardcoded one', () => {
    const wrapper = mountPlaceholder('Settings');
    expect(wrapper.text()).toContain('get the Settings permission');
    expect(wrapper.text()).not.toContain('get the View permission');
  });

  it('renders no action buttons (pin has none)', () => {
    const wrapper = mountPlaceholder('View');
    expect(wrapper.find('button').exists()).toBe(false);
    expect(wrapper.find('a').exists()).toBe(false);
  });
});
