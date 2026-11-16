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
import { describe, expect, it } from 'vitest';
import ServiceFlowStepper from './ServiceFlowStepper.vue';

const STEPS = [
  { name: 'Connection Details', step: 1 },
  { name: 'Set Default Filters', step: 2 },
];

describe('ServiceFlowStepper (official ServiceFlowStepper)', () => {
  it('marks earlier steps completed, the active step current, later steps upcoming', () => {
    const wrapper = mount(ServiceFlowStepper, { props: { steps: STEPS, activeStep: 2 } });
    const nodes = wrapper.findAll('.service-flow-node');
    expect(nodes[0]?.classes()).toContain('completed');
    expect(nodes[1]?.classes()).toContain('current');
    expect(wrapper.find('[data-testid="step-label-1"]').text()).toBe('Connection Details');
    expect(wrapper.find('[data-testid="step-connector-1"]').classes()).toContain('completed');
  });

  it('leaves connectors unfilled before the active step', () => {
    const wrapper = mount(ServiceFlowStepper, { props: { steps: STEPS, activeStep: 1 } });
    expect(wrapper.findAll('.service-flow-node')[0]?.classes()).toContain('current');
    expect(wrapper.findAll('.service-flow-node')[1]?.classes()).toContain('upcoming');
    expect(wrapper.find('[data-testid="step-connector-1"]').classes()).toContain('current');
    expect(wrapper.find('[data-testid="step-connector-1"]').classes()).not.toContain('completed');
  });
});
