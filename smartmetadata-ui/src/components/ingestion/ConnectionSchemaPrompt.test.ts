/**
 * Copyright 2026 SmartMetadata authors.
 * Licensed under the Apache License, Version 2.0.
 */
import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import { createI18n } from 'vue-i18n';
import ConnectionSchemaPrompt from './ConnectionSchemaPrompt.vue';

const MESSAGES = {
  'en-US': {
    settings: {
      services: {
        connectionGuard: {
          loadFailed: 'The connection schema failed to load.',
          noConfigAvailable: 'No Connection Configs available.',
          blockedReasonA: 'Reason A.',
          blockedReasonB: 'Reason B.',
          blockedReasonC: 'Reason C.',
        },
      },
    },
  },
};

function mountPrompt(props: Record<string, unknown>) {
  return mount(ConnectionSchemaPrompt, {
    props: { area: 'no-config', ...props },
    global: { plugins: [createI18n({ legacy: false, locale: 'en-US', messages: MESSAGES })] },
  });
}

describe('ConnectionSchemaPrompt', () => {
  it('renders the pin no-config message for the empty-schema state', () => {
    const wrapper = mountPrompt({ area: 'no-config' });
    expect(wrapper.find('[data-testid="no-config-available"]').text()).toBe(
      'No Connection Configs available.',
    );
  });

  it('renders the load-failure message for the failed state', () => {
    const wrapper = mountPrompt({ area: 'load-failed' });
    expect(wrapper.find('[data-testid="no-config-available"]').text()).toBe(
      'The connection schema failed to load.',
    );
  });

  it('renders the class-specific reason for a blocked row', () => {
    expect(
      mountPrompt({ area: 'read-only-prompt', uncoveredClass: 'A' }).text(),
    ).toBe('Reason A.');
    expect(
      mountPrompt({ area: 'read-only-prompt', uncoveredClass: 'B' }).text(),
    ).toBe('Reason B.');
    expect(
      mountPrompt({ area: 'read-only-prompt', uncoveredClass: 'C' }).text(),
    ).toBe('Reason C.');
  });

  it('falls back to the generic message when a blocked row carries no class', () => {
    const wrapper = mountPrompt({ area: 'read-only-prompt' });
    expect(wrapper.find('[data-testid="no-config-available"]').text()).toBe(
      'No Connection Configs available.',
    );
  });
});
