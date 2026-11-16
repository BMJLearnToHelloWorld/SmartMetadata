/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { flushPromises, mount } from '@vue/test-utils';
import Antd from 'ant-design-vue';
import { describe, expect, it } from 'vitest';
import { createTestI18n } from '@/test/i18n';
import CronSummaryCard from './CronSummaryCard.vue';

function mountCard(props: Record<string, unknown> = {}) {
  return mount(CronSummaryCard, {
    props,
    global: { plugins: [Antd, createTestI18n()] },
  });
}

/** The lazy cronstrue import resolves on real timers, not microtasks. */
async function waitForText(
  wrapper: ReturnType<typeof mountCard>,
  substring: string,
  timeoutMs = 5000,
): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (wrapper.text().includes(substring)) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
    await flushPromises();
  }
}

describe('CronSummaryCard (official ScheduleInterval summary)', () => {
  it('renders the human-readable schedule once cronstrue resolves', async () => {
    const wrapper = mountCard({ cron: '0 0 * * *' });
    await waitForText(wrapper, '12:00 AM');
    // cronstrue verbose text for midnight daily, 12-hour clock.
    expect(wrapper.find('[data-testid="cron-summary-card"]').text()).toContain(
      'Ingestion scheduled to run',
    );
    expect(wrapper.text()).toContain('12:00 AM');
  });

  it('renders the manual-trigger text when no cron is set', async () => {
    const wrapper = mountCard({});
    await flushPromises();
    expect(wrapper.text()).toContain('Pipeline will only be triggered manually.');
  });

  it('uses the caller-provided entity word', async () => {
    const wrapper = mountCard({ cron: '0 0 * * *', entity: 'Profiler' });
    await flushPromises();
    expect(wrapper.text()).toContain('Profiler scheduled to run');
  });

  it('updates when the cron changes', async () => {
    const wrapper = mountCard({ cron: '0 0 * * *' });
    await flushPromises();
    await wrapper.setProps({ cron: undefined });
    await flushPromises();
    expect(wrapper.text()).toContain('Pipeline will only be triggered manually.');
  });
});
