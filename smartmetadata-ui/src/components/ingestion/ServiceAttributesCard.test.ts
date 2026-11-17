/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0.
 */
import { flushPromises, mount } from '@vue/test-utils';
import Antd, { Select } from 'ant-design-vue';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createTestI18n } from '@/test/i18n';
import ServiceAttributesCard from './ServiceAttributesCard.vue';

function mountCard(props: Record<string, unknown> = {}) {
  return mount(ServiceAttributesCard, {
    props: {
      hasEditPermission: true,
      onSave: vi.fn().mockResolvedValue(undefined),
      ...props,
    },
    attachTo: document.body,
    global: { plugins: [Antd, createTestI18n()] },
  });
}

describe('ServiceAttributesCard (official ServiceAttributesCard)', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('shows the configured attributes', () => {
    const wrapper = mountCard({
      serviceAttributes: {
        environment: 'Development',
        region: 'us-east-1',
        deployment: 'prod-cluster-01',
      },
    });
    expect(wrapper.find('[data-testid="service-environment-value"]').text()).toBe('Development');
    expect(wrapper.find('[data-testid="service-region-value"]').text()).toBe('us-east-1');
    expect(wrapper.find('[data-testid="service-deployment-value"]').text()).toBe('prod-cluster-01');
    expect(wrapper.find('[data-testid="service-attributes-card"]').text()).toContain(
      'Service Attributes',
    );
    wrapper.unmount();
  });

  it('renders every attribute, dashing the ones that are unset', () => {
    const wrapper = mountCard({ serviceAttributes: { region: 'us-east-1' } });
    expect(wrapper.find('[data-testid="service-region-value"]').text()).toBe('us-east-1');
    expect(wrapper.find('[data-testid="service-environment-value"]').text()).toBe('-');
    expect(wrapper.find('[data-testid="service-deployment-value"]').text()).toBe('-');
    wrapper.unmount();
  });

  it('does not render the edit affordance without permission', () => {
    const wrapper = mountCard({ hasEditPermission: false, serviceAttributes: {} });
    expect(wrapper.find('[data-testid="edit-service-attributes"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it('offers the environments in the pin enum order', async () => {
    const wrapper = mountCard({ serviceAttributes: {} });
    await wrapper.find('[data-testid="edit-service-attributes"]').trigger('click');
    const options = wrapper.findComponent(Select).props('options') as Array<{
      value: string;
      label: string;
    }>;
    expect(options.map((option) => option.value)).toEqual([
      'Development',
      'Other',
      'Production',
      'QA',
      'Sandbox',
      'Staging',
      'UAT',
    ]);
    expect(options.every((option) => option.label === option.value)).toBe(true);
    wrapper.unmount();
  });

  it('trims region/deployment on save and passes environment through untrimmed', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    const wrapper = mountCard({
      onSave,
      serviceAttributes: { environment: 'Production', region: 'old', deployment: 'old' },
    });
    await wrapper.find('[data-testid="edit-service-attributes"]').trigger('click');
    await wrapper.find('input#service-region').setValue('  eu-west-1  ');
    await wrapper.find('input#service-deployment').setValue('   ');
    await wrapper.find('[data-testid="save-service-attributes"]').trigger('click');
    await flushPromises();
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave).toHaveBeenCalledWith({
      environment: 'Production',
      region: 'eu-west-1',
      deployment: undefined,
    });
    expect(wrapper.find('[data-testid="service-attributes-values"]').exists()).toBe(true);
    wrapper.unmount();
  });

  it('saves the newly selected environment', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    const wrapper = mountCard({ onSave, serviceAttributes: {} });
    await wrapper.find('[data-testid="edit-service-attributes"]').trigger('click');
    await wrapper.findComponent(Select).vm.$emit('update:value', 'Staging');
    await wrapper.find('[data-testid="save-service-attributes"]').trigger('click');
    await flushPromises();
    expect(onSave).toHaveBeenCalledWith({
      environment: 'Staging',
      region: undefined,
      deployment: undefined,
    });
    wrapper.unmount();
  });

  it('stays in edit mode when the save fails, keeping the draft', async () => {
    const onSave = vi.fn().mockRejectedValue(new Error('boom'));
    const wrapper = mountCard({ onSave, serviceAttributes: { region: 'old' } });
    await wrapper.find('[data-testid="edit-service-attributes"]').trigger('click');
    await wrapper.find('input#service-region').setValue('new-region');
    await wrapper.find('[data-testid="save-service-attributes"]').trigger('click');
    await flushPromises();
    expect(wrapper.find('[data-testid="save-service-attributes"]').exists()).toBe(true);
    expect((wrapper.find('input#service-region').element as HTMLInputElement).value).toBe(
      'new-region',
    );
    wrapper.unmount();
  });

  it('disables cancel and shows the save spinner while saving', async () => {
    let resolveSave!: () => void;
    const onSave = vi.fn(() => new Promise<void>((resolve) => (resolveSave = resolve)));
    const wrapper = mountCard({ onSave, serviceAttributes: {} });
    await wrapper.find('[data-testid="edit-service-attributes"]').trigger('click');
    await wrapper.find('[data-testid="save-service-attributes"]').trigger('click');
    await flushPromises();
    expect(wrapper.find('[data-testid="cancel-service-attributes"]').attributes('disabled')).toBe(
      '',
    );
    expect(
      wrapper.find('[data-testid="save-service-attributes"]').classes(),
    ).toContain('ant-btn-loading');
    resolveSave();
    await flushPromises();
    expect(wrapper.find('[data-testid="service-attributes-values"]').exists()).toBe(true);
    wrapper.unmount();
  });

  it('resets the draft from props on cancel', async () => {
    const wrapper = mountCard({ serviceAttributes: { region: 'kept' } });
    await wrapper.find('[data-testid="edit-service-attributes"]').trigger('click');
    await wrapper.find('input#service-region').setValue('discarded');
    await wrapper.find('[data-testid="cancel-service-attributes"]').trigger('click');
    await wrapper.find('[data-testid="edit-service-attributes"]').trigger('click');
    expect((wrapper.find('input#service-region').element as HTMLInputElement).value).toBe('kept');
    wrapper.unmount();
  });
});
