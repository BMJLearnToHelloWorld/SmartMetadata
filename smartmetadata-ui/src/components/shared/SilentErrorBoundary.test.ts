/**
 * Copyright 2026 SmartMetadata authors.
 * Licensed under the Apache License, Version 2.0.
 */
import { defineComponent, h, onErrorCaptured, ref } from 'vue';
import { mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';
import { createTestI18n } from '@/test/i18n';
import SilentErrorBoundary from './SilentErrorBoundary.vue';

const HealthyChild = defineComponent({
  setup() {
    return () => h('span', 'healthy content');
  },
});

const ThrowingChild = defineComponent({
  setup() {
    return () => {
      throw new Error('boom');
    };
  },
});

describe('SilentErrorBoundary', () => {
  it('renders a healthy child normally', () => {
    const wrapper = mount(SilentErrorBoundary, {
      global: { plugins: [createTestI18n()] },
      slots: { default: HealthyChild },
    });
    expect(wrapper.text()).toContain('healthy content');
    expect(wrapper.findComponent(HealthyChild).exists()).toBe(true);
  });

  it('renders empty when a child throws during render, without propagating the error', async () => {
    const outerError = ref<unknown>(null);
    const Outer = defineComponent({
      setup() {
        onErrorCaptured((error) => {
          outerError.value = error;
          return false;
        });
        return () =>
          h(SilentErrorBoundary, null, { default: () => h(ThrowingChild) });
      },
    });
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const wrapper = mount(Outer, {
        global: { plugins: [createTestI18n()] },
      });
      await wrapper.vm.$nextTick();
      expect(wrapper.text()).toBe('');
      expect(wrapper.findComponent(ThrowingChild).exists()).toBe(false);
      // The boundary recorded the error exactly once ...
      expect(consoleSpy).toHaveBeenCalledTimes(1);
      // ... and stopped it before the outer boundary / second net.
      expect(outerError.value).toBeNull();
    } finally {
      consoleSpy.mockRestore();
    }
  });

  it('stays empty on re-render after an error', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const wrapper = mount(SilentErrorBoundary, {
        global: { plugins: [createTestI18n()] },
        slots: { default: ThrowingChild },
      });
      await wrapper.vm.$nextTick();
      expect(wrapper.text()).toBe('');
      await wrapper.vm.$forceUpdate();
      await wrapper.vm.$nextTick();
      expect(wrapper.text()).toBe('');
      expect(wrapper.findComponent(ThrowingChild).exists()).toBe(false);
      // No re-throw on re-render: a remount-then-throw-again would record
      // a second error while the text still reads empty.
      expect(consoleSpy).toHaveBeenCalledTimes(1);
    } finally {
      consoleSpy.mockRestore();
    }
  });
});
