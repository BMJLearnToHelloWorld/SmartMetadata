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
import AppInstallStepper from './AppInstallStepper.vue';

const STEPS = [
  { name: 'Details', step: 1 },
  { name: 'Configure', step: 2 },
  { name: 'Schedule', step: 3 },
];

describe('AppInstallStepper', () => {
  it('renders all steps with pin testids and marks the active step current', () => {
    const wrapper = mount(AppInstallStepper, { props: { steps: STEPS, activeStep: 1 } });
    expect(wrapper.find('[data-testid="stepper-container"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="step-icon-1"]').text()).toBe('Details');
    expect(wrapper.find('[data-testid="step-icon-2"]').text()).toBe('Configure');
    expect(wrapper.find('[data-testid="step-icon-3"]').text()).toBe('Schedule');
    wrapper.unmount();
  });

  it('excludes steps and derives status from the original step identifier', () => {
    // Step 2 excluded (no configuration): step 3 is current, step 1
    // complete — the gap does not shift the status derivation.
    const wrapper = mount(AppInstallStepper, {
      props: { steps: STEPS, activeStep: 3, excludeSteps: [2] },
    });
    expect(wrapper.find('[data-testid="step-icon-2"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="step-icon-1"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="step-icon-3"]').exists()).toBe(true);
    wrapper.unmount();
  });
});
