/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may
 * not use this file except in compliance with the License. You may obtain
 * a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import Antd from 'ant-design-vue';
import { createTestI18n } from '@/test/i18n';
import AppModeConfigView from './AppModeConfigView.vue';

/**
 * B-13 (Bai 2026-11-18 21:43, C-4 §6.5 R-C4-APPMODE-TENANT close): the tenant
 * `ai` option is DISABLED, not hidden — the M3 precedent from the persona
 * AppLayoutEditor. A stored `ai` value still renders selected, the user
 * cannot newly select `ai`, and leaving `ai` (switch to `classic`, or clear
 * via the pre-existing allow-clear) is unrestricted and saves the new value.
 */

interface FetchCall {
  url: string;
  method: string;
  body: unknown;
}

let storedMode: 'ai' | 'classic' | null;
let fetchCalls: FetchCall[];

function jsonResponse(payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

function installFetchStub(): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? 'GET';
      const body = init?.body ? JSON.parse(String(init.body)) : undefined;
      fetchCalls.push({ url, method, body });
      if (url.endsWith('/api/v1/system/settings/appConfiguration') && method === 'GET') {
        return jsonResponse({
          config_type: 'appConfiguration',
          config_value: { defaultAppMode: storedMode },
        });
      }
      if (url.endsWith('/api/v1/system/settings') && method === 'PUT') {
        const value = (body as { config_value?: { defaultAppMode?: 'ai' | 'classic' | null } })
          .config_value;
        storedMode = value?.defaultAppMode ?? null;
        return jsonResponse({
          config_type: 'appConfiguration',
          config_value: { defaultAppMode: storedMode },
        });
      }
      return jsonResponse({});
    }),
  );
}

async function mountView(): Promise<VueWrapper> {
  const wrapper = mount(AppModeConfigView, {
    attachTo: document.body,
    global: { plugins: [Antd, createTestI18n()] },
  });
  await flushPromises();
  await wrapper.vm.$nextTick();
  return wrapper;
}

async function openDropdown(wrapper: VueWrapper): Promise<void> {
  const selector = wrapper
    .find('[data-testid="app-mode-select"]')
    .element.querySelector('.ant-select-selector') as HTMLElement;
  selector.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
  selector.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  await flushPromises();
  await wrapper.vm.$nextTick();
}

function dropdownOption(label: string): HTMLElement {
  const option = Array.from(document.body.querySelectorAll('.ant-select-item-option')).find(
    (el) => el.textContent?.trim() === label,
  ) as HTMLElement | undefined;
  if (!option) {
    throw new Error(`Expected a dropdown option labelled "${label}"`);
  }
  return option;
}

function clickOption(option: HTMLElement): void {
  option.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
  option.dispatchEvent(new MouseEvent('click', { bubbles: true }));
}

function selectionText(wrapper: VueWrapper): string {
  return (
    wrapper.find('[data-testid="app-mode-select"] .ant-select-selection-item').text() ?? ''
  ).trim();
}

function putBodies(): unknown[] {
  return fetchCalls
    .filter((call) => call.method === 'PUT')
    .map((call) => call.body);
}

describe('AppModeConfigView B-13 tenant ai disable', () => {
  beforeEach(() => {
    storedMode = 'classic';
    fetchCalls = [];
    installFetchStub();
  });

  afterEach(() => {
    document.body.innerHTML = '';
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('renders the ai option disabled while keeping its label; classic stays enabled', async () => {
    const wrapper = await mountView();
    await openDropdown(wrapper);
    const ai = dropdownOption('AI');
    const classic = dropdownOption('Classic');
    expect(ai.classList.contains('ant-select-item-option-disabled')).toBe(true);
    expect(classic.classList.contains('ant-select-item-option-disabled')).toBe(false);
    wrapper.unmount();
  });

  it('renders a stored ai value as the selected (disabled) option', async () => {
    storedMode = 'ai';
    const wrapper = await mountView();
    expect(selectionText(wrapper)).toBe('AI');
    await openDropdown(wrapper);
    const ai = dropdownOption('AI');
    expect(ai.classList.contains('ant-select-item-option-disabled')).toBe(true);
    expect(ai.classList.contains('ant-select-item-option-selected')).toBe(true);
    wrapper.unmount();
  });

  it('does not select ai when the disabled option is clicked', async () => {
    const wrapper = await mountView();
    expect(selectionText(wrapper)).toBe('Classic');
    await openDropdown(wrapper);
    clickOption(dropdownOption('AI'));
    await flushPromises();
    await wrapper.vm.$nextTick();
    expect(selectionText(wrapper)).toBe('Classic');
    wrapper.unmount();
  });

  it('switches from a stored ai value to classic and saves the new value', async () => {
    storedMode = 'ai';
    const wrapper = await mountView();
    expect(selectionText(wrapper)).toBe('AI');
    await openDropdown(wrapper);
    clickOption(dropdownOption('Classic'));
    await flushPromises();
    await wrapper.vm.$nextTick();
    expect(selectionText(wrapper)).toBe('Classic');
    await wrapper.find('[data-testid="app-mode-save"]').trigger('click');
    await flushPromises();
    await wrapper.vm.$nextTick();
    expect(putBodies()).toContainEqual({
      config_type: 'appConfiguration',
      config_value: {
        defaultAppMode: 'classic',
        defaultColumnOrder: null,
        defaultTimeFormat: undefined,
      },
    });
    // Save reloads; the stored value echoes back as the selection.
    expect(selectionText(wrapper)).toBe('Classic');
    wrapper.unmount();
  });

  it('writes the stored ai value back unchanged when saving without changing the selection', async () => {
    // m-3: saving without touching the select must not drop or rewrite
    // the stored ai value (the option is disabled, not absent).
    storedMode = 'ai';
    const wrapper = await mountView();
    expect(selectionText(wrapper)).toBe('AI');
    await wrapper.find('[data-testid="app-mode-save"]').trigger('click');
    await flushPromises();
    await wrapper.vm.$nextTick();
    expect(putBodies()).toContainEqual({
      config_type: 'appConfiguration',
      config_value: {
        defaultAppMode: 'ai',
        defaultColumnOrder: null,
        defaultTimeFormat: undefined,
      },
    });
    expect(selectionText(wrapper)).toBe('AI');
    wrapper.unmount();
  });

  it('clears a stored ai value via allow-clear and saves null', async () => {
    storedMode = 'ai';
    const wrapper = await mountView();
    expect(selectionText(wrapper)).toBe('AI');
    const clear = wrapper
      .find('[data-testid="app-mode-select"]')
      .element.querySelector('.ant-select-clear') as HTMLElement | null;
    expect(clear).not.toBeNull();
    clear?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    clear?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushPromises();
    await wrapper.vm.$nextTick();
    expect(wrapper.find('[data-testid="app-mode-select"] .ant-select-selection-item').exists()).toBe(
      false,
    );
    await wrapper.find('[data-testid="app-mode-save"]').trigger('click');
    await flushPromises();
    await wrapper.vm.$nextTick();
    expect(putBodies()).toContainEqual({
      config_type: 'appConfiguration',
      config_value: {
        defaultAppMode: null,
        defaultColumnOrder: null,
        defaultTimeFormat: undefined,
      },
    });
    wrapper.unmount();
  });
});
