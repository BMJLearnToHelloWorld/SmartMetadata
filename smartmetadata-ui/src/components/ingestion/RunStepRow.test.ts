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
import Antd, { message } from 'ant-design-vue';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createTestI18n } from '@/test/i18n';
import RunStepRow, { type RunStep } from './RunStepRow.vue';

function step(overrides: Partial<RunStep> = {}): RunStep {
  return {
    name: 'metadata',
    status: 'success',
    records: 120,
    filtered: 0,
    updated: 0,
    warnings: 0,
    errors: 0,
    ...overrides,
  };
}

function mountRow(row: RunStep, isLast = true) {
  return mount(RunStepRow, {
    props: { step: row, isLast },
    global: { plugins: [Antd, createTestI18n()] },
  });
}

describe('RunStepRow (official RunStepRow.component)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });
  it('renders the name, record count and records label', () => {
    const wrapper = mountRow(step({ name: 'lineage', records: 1234 }));
    expect(wrapper.text()).toContain('lineage');
    expect(wrapper.text()).toContain('1,234');
    expect(wrapper.text()).toContain('records');
  });

  it('lists only nonzero secondary counts joined with middots', () => {
    const wrapper = mountRow(step({ filtered: 5, updated: 0, warnings: 2 }));
    expect(wrapper.text()).toContain('5 filtered · 2 warnings');
    expect(wrapper.text()).not.toContain('updated');
  });

  it('omits the secondary line when all secondary counts are zero', () => {
    const wrapper = mountRow(step());
    expect(wrapper.find('.run-step-row__secondary').exists()).toBe(false);
  });

  it("shows Didn't run instead of counts for a skipped step", () => {
    const wrapper = mountRow(step({ status: 'skipped', records: 0 }));
    expect(wrapper.text()).toContain("Didn't run");
    expect(wrapper.find('.run-step-row__records').exists()).toBe(false);
  });

  it('shows the errors badge only when errors are nonzero', () => {
    expect(mountRow(step({ errors: 3 })).text()).toContain('3 errors');
    expect(mountRow(step({ errors: 0 })).find('.run-step-row__errors-badge').exists()).toBe(false);
  });

  it('renders the attention card with title, severity label and message', () => {
    const wrapper = mountRow(
      step({
        status: 'failed',
        errors: 1,
        attention: { severity: 'error', title: 'sink failed', message: 'boom' },
      }),
    );
    expect(wrapper.text()).toContain('sink failed');
    expect(wrapper.text()).toContain('Error');
    expect(wrapper.text()).toContain('boom');
    expect(wrapper.find('.run-step-row__copy').exists()).toBe(false);
  });

  it('renders the hint box with the How to fix prefix', () => {
    const wrapper = mountRow(
      step({
        attention: { severity: 'warning', title: 'slow', message: 'm', hint: 'raise the limit' },
      }),
    );
    expect(wrapper.text()).toContain('Warning');
    expect(wrapper.text()).toContain('How to fix');
    expect(wrapper.text()).toContain('raise the limit');
  });

  it('copies only the stack trace and flips the button to Copied', async () => {
    const writeText = vi.fn(async () => undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    const wrapper = mountRow(
      step({
        attention: {
          severity: 'error',
          title: 't',
          message: 'm',
          stackTrace: 'line1\nERROR line2',
        },
      }),
    );
    await wrapper.find('.run-step-row__copy').trigger('click');
    expect(writeText).toHaveBeenCalledTimes(1);
    expect(writeText).toHaveBeenCalledWith('line1\nERROR line2');
    expect(wrapper.find('.run-step-row__copy').text()).toContain('Copied');
  });

  it('keeps the Copy label and toasts when the clipboard write rejects', async () => {
    const writeText = vi.fn(async () => {
      throw new Error('denied');
    });
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    const errorSpy = vi.spyOn(message, 'error').mockImplementation(() => ({}) as never);
    const wrapper = mountRow(
      step({
        attention: { severity: 'error', title: 't', message: 'm', stackTrace: 'trace' },
      }),
    );
    await wrapper.find('.run-step-row__copy').trigger('click');
    expect(wrapper.find('.run-step-row__copy').text()).toContain('Copy');
    expect(wrapper.find('.run-step-row__copy').text()).not.toContain('Copied');
    expect(errorSpy).toHaveBeenCalledWith('Copy failed');
  });

  it('keeps the Copy label and toasts when the clipboard API is absent', async () => {
    Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true });
    const errorSpy = vi.spyOn(message, 'error').mockImplementation(() => ({}) as never);
    const wrapper = mountRow(
      step({
        attention: { severity: 'error', title: 't', message: 'm', stackTrace: 'trace' },
      }),
    );
    await wrapper.find('.run-step-row__copy').trigger('click');
    expect(wrapper.find('.run-step-row__copy').text()).not.toContain('Copied');
    expect(errorSpy).toHaveBeenCalledWith('Copy failed');
  });

  it('toggles the raw log lines and marks ERROR lines', async () => {
    const wrapper = mountRow(
      step({
        attention: {
          severity: 'error',
          title: 't',
          message: 'm',
          stackTrace: 'ok line\nERROR bad line',
        },
      }),
    );
    expect(wrapper.find('.run-step-row__raw-log').exists()).toBe(false);
    await wrapper.find('.run-step-row__raw-log-toggle').trigger('click');
    expect(wrapper.find('.run-step-row__raw-log').exists()).toBe(true);
    expect(wrapper.text()).toContain('ok line');
    expect(wrapper.text()).toContain('ERROR bad line');
    expect(wrapper.findAll('.run-step-row__raw-log-line--error')).toHaveLength(1);
    expect(wrapper.find('.run-step-row__raw-log-toggle').text()).toContain('Hide raw logs');
    await wrapper.find('.run-step-row__raw-log-toggle').trigger('click');
    expect(wrapper.find('.run-step-row__raw-log').exists()).toBe(false);
  });

  it('marks the last row with the last-row class', () => {
    expect(mountRow(step(), true).classes()).toContain('run-step-row--last');
    expect(mountRow(step(), false).classes()).not.toContain('run-step-row--last');
  });
});
