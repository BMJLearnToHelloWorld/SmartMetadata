/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the Apache License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import Antd, { Calendar, Popover } from 'ant-design-vue';
import dayjs from 'dayjs';
import { describe, expect, it, afterEach } from 'vitest';
import { createTestI18n } from '@/test/i18n';
import { fromCalendarValue } from '@/utils/notifications/announcementUtils';
import AnnouncementDateField from './AnnouncementDateField.vue';

const NOV_10 = new Date(2026, 10, 10).getTime();

const mounted: VueWrapper[] = [];

afterEach(() => {
  // The popover portals into document.body; unmount every wrapper
  // so no portal survives into the next test.
  for (const wrapper of mounted) {
    wrapper.unmount();
  }
  mounted.length = 0;
  document.body.innerHTML = '';
});

function mountField(props: Record<string, unknown>): VueWrapper {
  const wrapper = mount(AnnouncementDateField, {
    props: { id: 'startTime', label: 'Start date', ...props },
    global: { plugins: [Antd, createTestI18n()] },
    attachTo: document.body,
  });
  mounted.push(wrapper);
  return wrapper;
}

async function openPopover(wrapper: VueWrapper): Promise<void> {
  const popover = wrapper.findComponent(Popover);
  await popover.vm.$emit('openChange', true);
  await waitForCalendar(wrapper);
}

/**
 * The popover content mounts through an antd portal a frame after
 * the open state lands; poll for the Calendar instead of assuming
 * it is already in the tree.
 */
async function waitForCalendar(wrapper: VueWrapper): Promise<void> {
  for (let i = 0; i < 40; i++) {
    if (wrapper.findComponent(Calendar).exists()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error('calendar never mounted inside the popover');
}

async function waitForFooterButtons(): Promise<HTMLButtonElement[]> {
  for (let i = 0; i < 40; i++) {
    const buttons = footerButtons();
    if (buttons.length === 3) {
      return buttons;
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error('date-field footer never mounted');
}

function footerButtons(): HTMLButtonElement[] {
  return [...document.body.querySelectorAll<HTMLButtonElement>('.announcement-date-field__footer button')];
}

describe('AnnouncementDateField', () => {
  it('shows the stored day, or nothing when no date is set', () => {
    const filled = mountField({ value: NOV_10 });
    expect(filled.find('input').element.value).toBe('2026-11-10');
    const empty = mountField({ value: null });
    expect(empty.find('input').element.value).toBe('');
  });

  it('commits a picked day at the start boundary, live', async () => {
    const wrapper = mountField({ value: NOV_10 });
    await openPopover(wrapper);
    const calendar = wrapper.findComponent(Calendar);
    await calendar.vm.$emit('select', dayjs('2026-11-12'));
    expect(wrapper.emitted('change')).toEqual([
      [fromCalendarValue('2026-11-12', 'start')],
    ]);
    expect(fromCalendarValue('2026-11-12', 'start')).toBe(new Date(2026, 10, 12).getTime());
  });

  it('anchors the end boundary at 23:59:59.999', async () => {
    const wrapper = mountField({ boundary: 'end', id: 'endTime', value: NOV_10 });
    await openPopover(wrapper);
    const calendar = wrapper.findComponent(Calendar);
    await calendar.vm.$emit('select', dayjs('2026-11-12'));
    expect(wrapper.emitted('change')).toEqual([
      [new Date(2026, 10, 12, 23, 59, 59, 999).getTime()],
    ]);
  });

  it('reverts to the value on open when dismissed without Apply', async () => {
    const wrapper = mountField({ value: NOV_10 });
    await openPopover(wrapper);
    const calendar = wrapper.findComponent(Calendar);
    await calendar.vm.$emit('select', dayjs('2026-11-12'));
    await wrapper.findComponent(Popover).vm.$emit('openChange', false);
    await flushPromises();
    expect(wrapper.emitted('change')).toEqual([
      [fromCalendarValue('2026-11-12', 'start')],
      [NOV_10],
    ]);
  });

  it('keeps the picked day after Apply, with no revert', async () => {
    const wrapper = mountField({ value: NOV_10 });
    await openPopover(wrapper);
    const calendar = wrapper.findComponent(Calendar);
    await calendar.vm.$emit('select', dayjs('2026-11-12'));
    const buttons = await waitForFooterButtons();

    buttons[2]?.click();
    await flushPromises();
    expect(wrapper.emitted('change')).toEqual([[fromCalendarValue('2026-11-12', 'start')]]);
    expect(wrapper.findComponent(Popover).props('open')).toBe(false);
  });

  it('reverts exactly once through Cancel', async () => {
    const wrapper = mountField({ value: NOV_10 });
    await openPopover(wrapper);
    const calendar = wrapper.findComponent(Calendar);
    await calendar.vm.$emit('select', dayjs('2026-11-12'));
    const buttons = await waitForFooterButtons();
    buttons[1]?.click();
    await flushPromises();
    // The revert fires once even though the close travels both the
    // Cancel button and the popover's own close event.
    expect(wrapper.emitted('change')).toEqual([
      [fromCalendarValue('2026-11-12', 'start')],
      [NOV_10],
    ]);
  });

  it('offers Today as a day click, leaving the popover open', async () => {
    const wrapper = mountField({ value: null });
    await openPopover(wrapper);
    const buttons = await waitForFooterButtons();
    buttons[0]?.click();
    await flushPromises();
    const today = dayjs().format('YYYY-MM-DD');
    expect(wrapper.emitted('change')).toEqual([[fromCalendarValue(today, 'start')]]);
    expect(wrapper.findComponent(Popover).props('open')).toBe(true);
  });

  it('renders the error line under the field', () => {
    const wrapper = mountField({ value: null, error: 'Start date is required' });
    const error = wrapper.find('[data-testid="startTime-error"]');
    expect(error.exists()).toBe(true);
    expect(error.text()).toBe('Start date is required');
  });
});
