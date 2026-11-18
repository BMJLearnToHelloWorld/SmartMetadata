/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may
 * not use this file except in compliance with the License. You may obtain
 * a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import Antd from 'ant-design-vue';
import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defineComponent, h } from 'vue';
import { createMemoryHistory, createRouter, type Router } from 'vue-router';
import { NAV_ENTRIES } from '@/layouts/nav';
import { createTestI18n } from '@/test/i18n';
import type { Persona } from '@/types/persona';
import NavigationEditor from './NavigationEditor.vue';
import {
  getNavigationItems,
  getTreeDataForNavigationItems,
  type NavigationItem,
  type SidebarBaseItem,
} from './navigationUtils';
import { bodyEl, cleanupBody, clickBody } from './testHarness';

const PERSONA: Persona = {
  id: 'persona-1',
  name: 'analyst',
  fullyQualifiedName: 'analyst',
  displayName: 'Analyst',
};

function baseItems(): SidebarBaseItem[] {
  return NAV_ENTRIES.map((entry) =>
    entry.kind === 'section'
      ? {
          key: entry.key,
          title: entry.titleKey,
          children: entry.items.map((item) => ({ key: item.key, title: item.titleKey })),
        }
      : { key: entry.key, title: entry.titleKey },
  );
}

function defaultSerialization(): NavigationItem[] {
  return getNavigationItems(getTreeDataForNavigationItems(null, baseItems()), []);
}

async function mountNavigationEditor(options: {
  navigation?: NavigationItem[] | null;
  saveImpl?: (items: NavigationItem[]) => Promise<void>;
}): Promise<{ wrapper: VueWrapper; router: Router; onSave: ReturnType<typeof vi.fn> }> {
  setActivePinia(createPinia());
  const onSave = vi.fn<(items: NavigationItem[]) => Promise<void>>(
    options.saveImpl ?? (async () => {}),
  );
  const Harness = defineComponent({
    setup() {
      return () =>
        h(NavigationEditor, {
          persona: PERSONA,
          navigation: options.navigation ?? null,
          onSave: (...args: [NavigationItem[]]) => onSave(...args),
        });
    },
  });
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: Harness },
      { path: '/other', component: { template: '<div>other</div>' } },
    ],
  });
  await router.push('/');
  await router.isReady();
  const App = defineComponent({ template: '<RouterView />' });
  const wrapper = mount(App, {
    attachTo: document.body,
    global: { plugins: [router, Antd, createTestI18n()] },
  });
  await flushPromises();
  return { wrapper, router, onSave };
}

describe('NavigationEditor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanupBody();
  });

  it('renders the default tree and keeps save ENABLED with null navigation (official verbatim)', async () => {
    const { wrapper } = await mountNavigationEditor({ navigation: null });
    expect(wrapper.find('[data-testid="navigation-editor"]').exists()).toBe(true);
    for (const key of ['home', 'search', 'observability', 'insights', 'marketplace']) {
      expect(wrapper.find(`[data-testid="navigation-switch-${key}"]`).exists()).toBe(true);
    }
    // Section children are part of the tree.
    expect(
      wrapper.find('[data-testid="navigation-switch-quality-test-cases"]').exists(),
    ).toBe(true);
    expect(wrapper.get('[data-testid="save-button"]').attributes('disabled')).toBeUndefined();
  });

  it('saves the default-tree serialization for null navigation', async () => {
    const { wrapper, onSave } = await mountNavigationEditor({ navigation: null });
    await wrapper.get('[data-testid="save-button"]').trigger('click');
    await flushPromises();
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave).toHaveBeenCalledWith(defaultSerialization());
  });

  it('writes isHidden for toggled-off items', async () => {
    const { wrapper, onSave } = await mountNavigationEditor({ navigation: null });
    await wrapper.get('[data-testid="navigation-switch-home"]').trigger('click');
    await flushPromises();
    await wrapper.get('[data-testid="save-button"]').trigger('click');
    await flushPromises();
    const payload = onSave.mock.calls[0][0] as NavigationItem[];
    const home = payload.find((item) => item.id === 'home');
    expect(home?.isHidden).toBe(true);
    expect(payload.filter((item) => item.id !== 'home').every((item) => !item.isHidden)).toBe(
      true,
    );
    // Titles round-trip as label keys, and every entry carries children.
    expect(home?.title).toBe('nav.home');
    expect(payload.every((item) => Array.isArray(item.children))).toBe(true);
  });

  it('loads a saved navigation round-trip: unchanged save stays disabled', async () => {
    const saved = defaultSerialization();
    saved[0].isHidden = true;
    const { wrapper } = await mountNavigationEditor({ navigation: saved });
    expect(wrapper.get('[data-testid="save-button"]').attributes('disabled')).toBeDefined();
    await wrapper.get('[data-testid="navigation-switch-home"]').trigger('click');
    await flushPromises();
    expect(wrapper.get('[data-testid="save-button"]').attributes('disabled')).toBeUndefined();
  });

  it('reset makes zero save calls, and the following save writes the default serialization (R3)', async () => {
    const saved = defaultSerialization();
    saved[0].isHidden = true;
    const { wrapper, onSave } = await mountNavigationEditor({ navigation: saved });
    await wrapper.get('[data-testid="reset-button"]').trigger('click');
    await flushPromises();
    clickBody('.ant-modal-confirm-btns .ant-btn-primary');
    await flushPromises();
    expect(onSave).not.toHaveBeenCalled();
    await wrapper.get('[data-testid="save-button"]').trigger('click');
    await flushPromises();
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave).toHaveBeenCalledWith(defaultSerialization());
  });

  it('surfaces a save failure as an error toast and keeps the editor usable', async () => {
    const i18n = createTestI18n();
    const { wrapper, onSave } = await mountNavigationEditor({
      navigation: null,
      saveImpl: async () => {
        throw new Error('save failed');
      },
    });
    await wrapper.get('[data-testid="save-button"]').trigger('click');
    await flushPromises();
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(document.body.textContent).toContain(i18n.global.t('persona.saveFailed'));
    expect(wrapper.get('[data-testid="save-button"]').attributes('disabled')).toBeUndefined();
  });

  it('stays on the page when the leave-flow save rejects', async () => {
    const { wrapper, router, onSave } = await mountNavigationEditor({
      navigation: defaultSerialization(),
      saveImpl: async () => {
        throw new Error('save failed');
      },
    });
    await wrapper.get('[data-testid="navigation-switch-home"]').trigger('click');
    await flushPromises();
    const navigation = router.push('/other');
    await flushPromises();
    expect(bodyEl('[data-testid="customize-leave-discard"]')).toBeTruthy();
    clickBody('[data-testid="customize-leave-save-exit"]');
    await flushPromises();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(router.currentRoute.value.path).toBe('/');
    clickBody('[data-testid="customize-leave-discard"]');
    await navigation;
  });
});
