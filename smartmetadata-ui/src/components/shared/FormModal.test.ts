/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0.
 */
import { flushPromises, mount } from '@vue/test-utils';
import Antd from 'ant-design-vue';
import { describe, expect, it } from 'vitest';
import { createTestI18n } from '@/test/i18n';
import FormModal from './FormModal.vue';

async function mountModal(props: Record<string, unknown>) {
  const wrapper = mount(FormModal, {
    props: { open: true, title: 'Edit', ...props } as never,
    slots: { default: '<p>modal-body-marker</p>' },
    global: { plugins: [Antd, createTestI18n()] },
  });
  await flushPromises();
  return wrapper;
}

describe('FormModal getContainer passthrough (Fix2)', () => {
  it('renders through the default body portal when getContainer is unset', async () => {
    const wrapper = await mountModal({});
    // Teleported to body: the slot text is in the document but not
    // inside the wrapper element itself.
    expect(document.body.textContent).toContain('modal-body-marker');
    expect(wrapper.html()).not.toContain('modal-body-marker');
    wrapper.unmount();
  });

  it('renders in place when getContainer is false', async () => {
    const wrapper = await mountModal({ getContainer: false });
    expect(wrapper.html()).toContain('modal-body-marker');
    wrapper.unmount();
  });
});
