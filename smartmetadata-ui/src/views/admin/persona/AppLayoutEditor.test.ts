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
import Antd, { Select, message } from 'ant-design-vue';
import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defineComponent, h } from 'vue';
import { createMemoryHistory, createRouter, type Router } from 'vue-router';
import { createTestI18n } from '@/test/i18n';
import type { Persona, PersonaDocument, PersonaPreferences } from '@/types/persona';
import AppLayoutEditor, { type AppLayoutPreferences } from './AppLayoutEditor.vue';
import { bodyEl, cleanupBody, clickBody } from './editors/testHarness';

const PERSONA: Persona = { id: 'p1', name: 'Analyst', fullyQualifiedName: 'Analyst' };

function docWith(prefs: Partial<PersonaPreferences>): PersonaDocument {
  return {
    id: 'doc1',
    name: 'Analyst-Analyst',
    fullyQualifiedName: 'persona.Analyst',
    entityType: 'Page',
    data: {
      pages: [],
      personaPreferences: [{ personaId: 'p1', personaName: 'Analyst', ...prefs }],
    },
  };
}

async function mountEditor(options: {
  document: PersonaDocument;
  saveImpl?: (prefs: AppLayoutPreferences) => Promise<void>;
}): Promise<{
  wrapper: VueWrapper;
  router: Router;
  onSave: ReturnType<typeof vi.fn>;
}> {
  setActivePinia(createPinia());
  const onSave = vi.fn<(prefs: AppLayoutPreferences) => Promise<void>>(
    options.saveImpl ?? (async () => {}),
  );
  const Harness = defineComponent({
    setup() {
      return () =>
        h(AppLayoutEditor, {
          persona: PERSONA,
          document: options.document,
          onSave: (...args: [AppLayoutPreferences]) => onSave(...args),
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

describe('AppLayoutEditor (callback-style)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanupBody();
  });

  it('R-ENTRY-TOAST: emits no toast on a successful save (the parent owns toasts)', async () => {
    const successSpy = vi.spyOn(message, 'success').mockImplementation(() => undefined as never);
    const errorSpy = vi.spyOn(message, 'error').mockImplementation(() => undefined as never);
    try {
      const { wrapper, onSave } = await mountEditor({ document: docWith({ appMode: 'classic' }) });
      await wrapper.find('input[value="none"]').trigger('click');
      await wrapper.find('[data-testid="app-layout-save"]').trigger('click');
      await flushPromises();
      expect(onSave).toHaveBeenCalledTimes(1);
      expect(successSpy).not.toHaveBeenCalled();
      expect(errorSpy).not.toHaveBeenCalled();
    } finally {
      successSpy.mockRestore();
      errorSpy.mockRestore();
    }
  });

  it('disables save when nothing changed and never calls onSave by itself', async () => {
    const { wrapper, onSave } = await mountEditor({ document: docWith({ appMode: 'classic' }) });
    expect(wrapper.find('[data-testid="app-layout-editor"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="app-layout-save"]').attributes('disabled')).toBeDefined();
    expect(onSave).not.toHaveBeenCalled();
  });

  it('maps the none sentinel, the default landing page, and empty view modes to undefined', async () => {
    const { wrapper, onSave } = await mountEditor({
      document: docWith({
        appMode: 'classic',
        defaultLandingPage: '/search',
        defaultViewModes: { domains: 'card' },
      }),
    });
    // Switch to none, reset the landing page through the Select, drop the view mode.
    await wrapper.find('input[value="none"]').setValue(true);
    const landing = wrapper
      .findAllComponents(Select)
      .find((select) => select.attributes('data-testid') === 'landing-select')!;
    await landing.vm.$emit('update:value', '/my-data');
    await wrapper.get('[data-testid="view-mode-remove-domains"]').trigger('click');
    await flushPromises();
    await wrapper.get('[data-testid="app-layout-save"]').trigger('click');
    await flushPromises();
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave).toHaveBeenCalledWith({
      appMode: undefined,
      defaultLandingPage: undefined,
      defaultViewModes: undefined,
    });
  });

  it('passes through a classic selection with a curated landing page and view modes', async () => {
    const { wrapper, onSave } = await mountEditor({ document: docWith({}) });
    await wrapper.find('input[value="classic"]').setValue(true);
    const landing = wrapper
      .findAllComponents(Select)
      .find((select) => select.attributes('data-testid') === 'landing-select')!;
    await landing.vm.$emit('update:value', '/search');
    // Add a view mode (defaults to table), then change it to card.
    const selects = wrapper.findAllComponents(Select);
    const addSelect = selects.find(
      (select) => select.props('placeholder') !== undefined && select.props('value') === undefined,
    )!;
    await addSelect.vm.$emit('change', 'domains');
    await flushPromises();
    const viewSelect = wrapper
      .findAllComponents(Select)
      .find((select) => select.attributes('data-testid') === 'view-mode-domains')!;
    await viewSelect.vm.$emit('change', 'card');
    await flushPromises();
    await wrapper.get('[data-testid="app-layout-save"]').trigger('click');
    await flushPromises();
    expect(onSave).toHaveBeenCalledWith({
      appMode: 'classic',
      defaultLandingPage: '/search',
      defaultViewModes: { domains: 'card' },
    });
  });

  it('falls back to the default landing page for a non-curated stored value', async () => {
    const { wrapper } = await mountEditor({
      document: docWith({ defaultLandingPage: '/not-a-curated-page' }),
    });
    const landing = wrapper
      .findAllComponents(Select)
      .find((select) => select.attributes('data-testid') === 'landing-select')!;
    expect(landing.props('value')).toBe('/my-data');
    // The fallback is the persisted baseline, so save stays disabled.
    expect(wrapper.find('[data-testid="app-layout-save"]').attributes('disabled')).toBeDefined();
  });

  it('M3: the AI option is disabled but keeps its label and testid', async () => {
    const { wrapper } = await mountEditor({ document: docWith({ appMode: 'classic' }) });
    const ai = wrapper.get('[data-testid="app-mode-ai"]');
    expect(ai.text()).toContain('AI');
    expect(ai.find('input').attributes('disabled')).toBeDefined();
    expect(ai.find('input').attributes('checked')).toBeUndefined();
  });

  it('M3: a stored AI mode renders selected-disabled and can switch to none/classic', async () => {
    const { wrapper, onSave } = await mountEditor({ document: docWith({ appMode: 'AI' }) });
    const ai = wrapper.get('[data-testid="app-mode-ai"]');
    expect(ai.find('input').attributes('disabled')).toBeDefined();
    expect((ai.find('input').element as HTMLInputElement).checked).toBe(true);
    await wrapper.find('input[value="classic"]').setValue(true);
    await flushPromises();
    await wrapper.get('[data-testid="app-layout-save"]').trigger('click');
    await flushPromises();
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({ appMode: 'classic' }),
    );
  });

  it('M3: reset to none is unrestricted even from a stored AI mode', async () => {
    const { wrapper, onSave } = await mountEditor({ document: docWith({ appMode: 'AI' }) });
    await wrapper.get('[data-testid="app-layout-reset"]').trigger('click');
    await flushPromises();
    expect(onSave).not.toHaveBeenCalled();
    expect((wrapper.find('input[value="none"]').element as HTMLInputElement).checked).toBe(true);
    await wrapper.get('[data-testid="app-layout-save"]').trigger('click');
    await flushPromises();
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({ appMode: undefined }),
    );
  });

  it('reset is local-only: zero onSave calls and state reset to defaults', async () => {
    const { wrapper, onSave } = await mountEditor({
      document: docWith({
        appMode: 'classic',
        defaultLandingPage: '/search',
        defaultViewModes: { domains: 'card' },
      }),
    });
    await wrapper.get('[data-testid="app-layout-reset"]').trigger('click');
    await flushPromises();
    expect(onSave).not.toHaveBeenCalled();
    expect((wrapper.find('input[value="none"]').element as HTMLInputElement).checked).toBe(true);
    const landing = wrapper
      .findAllComponents(Select)
      .find((select) => select.attributes('data-testid') === 'landing-select')!;
    expect(landing.props('value')).toBe('/my-data');
    expect(wrapper.find('[data-testid="view-mode-domains"]').exists()).toBe(false);
    // Saving after reset writes the sentinel-mapped defaults.
    await wrapper.get('[data-testid="app-layout-save"]').trigger('click');
    await flushPromises();
    expect(onSave).toHaveBeenCalledWith({
      appMode: undefined,
      defaultLandingPage: undefined,
      defaultViewModes: undefined,
    });
  });

  it('shows a save failure inline and keeps the editor dirty', async () => {
    const { wrapper, onSave } = await mountEditor({
      document: docWith({}),
      saveImpl: async () => {
        throw new Error('boom');
      },
    });
    await wrapper.find('input[value="classic"]').setValue(true);
    await wrapper.get('[data-testid="app-layout-save"]').trigger('click');
    await flushPromises();
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(wrapper.find('.app-layout-editor__error').text()).toBe('boom');
    expect(wrapper.find('[data-testid="app-layout-save"]').attributes('disabled')).toBeUndefined();
  });

  it('stays on the page when the leave-flow save rejects', async () => {
    const { wrapper, router, onSave } = await mountEditor({
      document: docWith({}),
      saveImpl: async () => {
        throw new Error('boom');
      },
    });
    await wrapper.find('input[value="classic"]').setValue(true);
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
