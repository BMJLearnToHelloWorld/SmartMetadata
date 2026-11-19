/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { nextTick } from 'vue';
import { mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import HoverCard from './HoverCard.vue';

function mountCard(props: Record<string, unknown> = {}) {
  return mount(HoverCard, {
    props,
    slots: {
      default: '<button type="button">trigger</button>',
      content: '<div class="card-body">card content</div>',
    },
    attachTo: document.body,
  });
}

describe('HoverCard', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('does not mount the content before any interaction', () => {
    const wrapper = mountCard();
    expect(wrapper.find('.card-body').exists()).toBe(false);
    wrapper.unmount();
  });

  it('opens after the 300ms open delay on hover', async () => {
    const wrapper = mountCard();
    await wrapper.find('.sm-hover-card__trigger').trigger('mouseenter');
    await vi.advanceTimersByTimeAsync(299);
    await nextTick();
    expect(wrapper.find('.card-body').exists()).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await nextTick();
    expect(wrapper.find('.card-body').exists()).toBe(true);
    wrapper.unmount();
  });

  it('closes after the 200ms close delay on mouse leave', async () => {
    const wrapper = mountCard();
    await wrapper.find('.sm-hover-card__trigger').trigger('mouseenter');
    await vi.advanceTimersByTimeAsync(300);
    await nextTick();
    await wrapper.find('.sm-hover-card__trigger').trigger('mouseleave');
    await vi.advanceTimersByTimeAsync(199);
    await nextTick();
    expect(wrapper.find('.card-body').exists()).toBe(true);
    await vi.advanceTimersByTimeAsync(1);
    await nextTick();
    expect(wrapper.find('.card-body').exists()).toBe(false);
    wrapper.unmount();
  });

  it('stays open when the pointer moves from the trigger onto the card', async () => {
    const wrapper = mountCard();
    const trigger = wrapper.find('.sm-hover-card__trigger');
    await trigger.trigger('mouseenter');
    await vi.advanceTimersByTimeAsync(300);
    await nextTick();
    await trigger.trigger('mouseleave');
    await wrapper.find('.sm-hover-card__card').trigger('mouseenter');
    await vi.advanceTimersByTimeAsync(500);
    await nextTick();
    expect(wrapper.find('.card-body').exists()).toBe(true);
    wrapper.unmount();
  });

  it('closes immediately on Escape', async () => {
    const wrapper = mountCard();
    await wrapper.find('.sm-hover-card__trigger').trigger('mouseenter');
    await vi.advanceTimersByTimeAsync(300);
    await nextTick();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    await nextTick();
    expect(wrapper.find('.card-body').exists()).toBe(false);
    wrapper.unmount();
  });

  it('never shows the content while disabled', async () => {
    const wrapper = mountCard({ isDisabled: true });
    await wrapper.find('.sm-hover-card__trigger').trigger('mouseenter');
    await vi.advanceTimersByTimeAsync(1000);
    await nextTick();
    expect(wrapper.find('.card-body').exists()).toBe(false);
    wrapper.unmount();
  });

  it('opens on keyboard focus of the trigger', async () => {
    const wrapper = mountCard();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab' }));
    await wrapper.find('.sm-hover-card__trigger').trigger('focusin');
    await vi.advanceTimersByTimeAsync(300);
    await nextTick();
    expect(wrapper.find('.card-body').exists()).toBe(true);
    wrapper.unmount();
  });

  it('does not open on mouse focus of the trigger', async () => {
    const wrapper = mountCard();
    document.dispatchEvent(new MouseEvent('mousedown'));
    await wrapper.find('.sm-hover-card__trigger').trigger('focusin');
    await vi.advanceTimersByTimeAsync(1000);
    await nextTick();
    expect(wrapper.find('.card-body').exists()).toBe(false);
    wrapper.unmount();
  });

  it('closes when focus leaves the card entirely', async () => {
    const wrapper = mountCard();
    await wrapper.find('.sm-hover-card__trigger').trigger('mouseenter');
    await vi.advanceTimersByTimeAsync(300);
    await nextTick();
    const card = wrapper.find('.sm-hover-card__card');
    await card.trigger('focusin');
    await card.trigger('focusout', { relatedTarget: document.body });
    await vi.advanceTimersByTimeAsync(200);
    await nextTick();
    expect(wrapper.find('.card-body').exists()).toBe(false);
    wrapper.unmount();
  });

  it('respects custom delays', async () => {
    const wrapper = mountCard({ openDelay: 50, closeDelay: 60 });
    await wrapper.find('.sm-hover-card__trigger').trigger('mouseenter');
    await vi.advanceTimersByTimeAsync(50);
    await nextTick();
    expect(wrapper.find('.card-body').exists()).toBe(true);
    await wrapper.find('.sm-hover-card__trigger').trigger('mouseleave');
    await vi.advanceTimersByTimeAsync(60);
    await nextTick();
    expect(wrapper.find('.card-body').exists()).toBe(false);
    wrapper.unmount();
  });

  it('positions the card below the trigger with the default offset and no arrow', async () => {
    const wrapper = mountCard();
    await wrapper.find('.sm-hover-card__trigger').trigger('mouseenter');
    await vi.advanceTimersByTimeAsync(300);
    await nextTick();
    const card = wrapper.find('.sm-hover-card__card');
    expect(card.attributes('style')).toContain('top: calc(100% + 8px)');
    expect(wrapper.find('.sm-hover-card__arrow').exists()).toBe(false);
    wrapper.unmount();
  });

  it('renders the arrow only when requested', async () => {
    const wrapper = mountCard({ arrow: true });
    await wrapper.find('.sm-hover-card__trigger').trigger('mouseenter');
    await vi.advanceTimersByTimeAsync(300);
    await nextTick();
    expect(wrapper.find('.sm-hover-card__arrow').exists()).toBe(true);
    wrapper.unmount();
  });

  it('clears its timer on unmount without error', async () => {
    const wrapper = mountCard();
    await wrapper.find('.sm-hover-card__trigger').trigger('mouseenter');
    wrapper.unmount();
    await vi.advanceTimersByTimeAsync(1000);
    await nextTick();
  });
});
