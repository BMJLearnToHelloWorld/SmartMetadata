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
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestI18n } from '@/test/i18n';
import SsoDocPanel from './SsoDocPanel.vue';

const GOOGLE_MD = [
  '$$section',
  '## Client ID',
  '$(id="clientId")',
  'Your OpenMetadata client id.',
  '$$',
  '$$section',
  '## Secret',
  '$(id="clientSecret")',
  'Your secret.',
  '$$',
].join('\n');

let fetchMock: ReturnType<typeof vi.fn>;

function mountPanel(props: Record<string, unknown> = {}) {
  return mount(SsoDocPanel, {
    props: { serviceName: 'google', ...props },
    global: { plugins: [createTestI18n('en-US')] },
  });
}

beforeEach(() => {
  fetchMock = vi.fn(async (url: string) => {
    if (String(url).includes('googleSSOClientConfig.md')) {
      return { ok: true, text: async () => GOOGLE_MD };
    }
    return { ok: false, text: async () => '' };
  });
  vi.stubGlobal('fetch', fetchMock);
  HTMLElement.prototype.scrollIntoView = vi.fn();
  if (typeof globalThis.CSS === 'undefined' || !globalThis.CSS.escape) {
    vi.stubGlobal('CSS', { escape: (value: string) => value });
  }
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('SsoDocPanel (pin SSODocPanel thin wrapper over ServiceDocPanel)', () => {
  it('renders the provider header and sectioned docs with brand replacement', async () => {
    const wrapper = mountPanel();
    await vi.waitFor(() => {
      expect(wrapper.find('h1').text()).toBe('Google SSO Configuration');
    });
    // The shared panel's outer testid exists from mount, so wait for the
    // fetched sections themselves rather than the container.
    await vi.waitFor(() => {
      expect(wrapper.findAll('section')).toHaveLength(2);
    });
    // Full-document mode: no focused header inside the shared panel.
    expect(wrapper.find('.service-doc-title').exists()).toBe(false);
    const sections = wrapper.findAll('section');
    expect(sections.map((s) => s.attributes('data-id'))).toEqual([
      'clientId',
      'clientSecret',
    ]);
    expect(wrapper.text()).toContain('Your iSmart client id.');
    expect(fetchMock).toHaveBeenCalledWith(
      '/locales/en-US/SSO/googleSSOClientConfig.md',
      expect.anything(),
    );
  });

  it('renders an empty body when no doc file exists', async () => {
    const wrapper = mountPanel({ serviceName: 'openmetadata' });
    await vi.waitFor(() => {
      expect(wrapper.find('h1').text()).toBe(
        'Openmetadata SSO Configuration',
      );
    });
    // Wait for the fetch to settle: the shared panel's outer testid
    // exists from mount, so the loading indicator is the settle signal.
    await vi.waitFor(() => {
      expect(
        wrapper.find('[data-testid="service-doc-loading"]').exists(),
      ).toBe(false);
    });
    expect(wrapper.findAll('section').length).toBe(0);
  });

  it('renders the basic title for the basic provider', async () => {
    const wrapper = mountPanel({ serviceName: 'basic' });
    await vi.waitFor(() => {
      expect(wrapper.find('h1').text()).toBe('Basic Configuration');
    });
    wrapper.unmount();
  });

  it('highlights the resolved active field section', async () => {
    const wrapper = mountPanel({ activeField: 'secret' });
    await vi.waitFor(() => {
      const section = wrapper.find('section[data-id="clientSecret"]');
      expect(section.attributes('data-highlighted')).toBe('true');
    });
  });

  it('keeps only the newest request when the provider changes mid-flight', async () => {
    let release: (value: unknown) => void = () => {};
    const gate = new Promise((resolve) => {
      release = resolve;
    });
    fetchMock.mockImplementationOnce(async () => {
      await gate;
      return { ok: true, text: async () => GOOGLE_MD };
    });
    const wrapper = mountPanel();
    await wrapper.setProps({ serviceName: 'openmetadata' });
    await vi.waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });
    release(undefined);
    await new Promise((resolve) => setTimeout(resolve, 10));
    await vi.waitFor(() => {
      expect(
        wrapper.find('[data-testid="service-requirements"]').exists(),
      ).toBe(true);
    });
    expect(wrapper.findAll('section').length).toBe(0);
    expect(wrapper.text()).not.toContain('Your iSmart client id.');
  });
});
