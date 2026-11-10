/**
 * Copyright 2026 SmartMetadata authors.
 * Licensed under the Apache License, Version 2.0.
 */
import { describe, expect, it, vi } from 'vitest';
import { ref } from 'vue';
import { getIntakeFormFields, splitIntakeFormFields, useMetricIntakeForm } from './metricIntakeForm';
import * as intakeFormsApi from '@/api/intakeForms';
import * as customPropertiesApi from '@/api/customProperties';
import type { IntakeFormField } from '@/api/intakeForms';

const nativeField: IntakeFormField = {
  fieldPath: 'code',
  fieldLabel: 'Code',
  fieldKind: 'native',
  required: false,
};
const requiredNativeField: IntakeFormField = { ...nativeField, required: true };
const extensionField: IntakeFormField = {
  fieldPath: 'extension.customScore',
  fieldLabel: 'Custom score',
  fieldKind: 'customProperty',
  required: true,
};

describe('getIntakeFormFields', () => {
  it('returns formFields when present, else requiredFields forced required', () => {
    expect(
      getIntakeFormFields({
        id: 'metric-intake-form',
        entityType: 'metric',
        formFields: [nativeField],
        requiredFields: [{ ...nativeField, required: false }],
      }),
    ).toEqual([nativeField]);
    expect(
      getIntakeFormFields({
        id: 'metric-intake-form',
        entityType: 'metric',
        formFields: [],
        requiredFields: [{ ...nativeField, required: false }],
      }),
    ).toEqual([{ ...nativeField, required: true }]);
    expect(getIntakeFormFields(null)).toEqual([]);
  });
});

describe('splitIntakeFormFields', () => {
  it('splits extension fields from required native fields (non-required native dropped)', () => {
    const split = splitIntakeFormFields([nativeField, requiredNativeField, extensionField]);
    expect(split.extensionFormFields).toEqual([extensionField]);
    expect([...split.requiredNativeFields.keys()]).toEqual(['code']);
    expect(
      splitIntakeFormFields([
        { fieldPath: 'extension.other', fieldLabel: 'Other', fieldKind: 'native', required: true },
      ]).extensionFormFields,
    ).toHaveLength(1);
  });
});

describe('useMetricIntakeForm', () => {
  it('loads the form and custom properties in parallel and reports loaded', async () => {
    vi.spyOn(intakeFormsApi, 'getIntakeFormByEntityType').mockResolvedValue({
      id: 'f1',
      name: 'metric',
      entityType: 'metric',
      formFields: [nativeField],
      requiredFields: [],
    });
    vi.spyOn(customPropertiesApi, 'listCustomProperties').mockResolvedValue([]);
    const state = useMetricIntakeForm(ref(true));
    await vi.waitFor(() => expect(state.isLoaded.value).toBe(true));
    expect(state.intakeForm.value?.id).toBe('f1');
    expect(state.isError.value).toBe(false);
    expect(intakeFormsApi.getIntakeFormByEntityType).toHaveBeenCalledWith('metric');
    expect(customPropertiesApi.listCustomProperties).toHaveBeenCalledWith('metric');
  });

  it('treats a missing intake form (null) as loaded, not an error', async () => {
    vi.spyOn(intakeFormsApi, 'getIntakeFormByEntityType').mockResolvedValue(null);
    vi.spyOn(customPropertiesApi, 'listCustomProperties').mockResolvedValue([]);
    const state = useMetricIntakeForm(ref(true));
    await vi.waitFor(() => expect(state.isLoaded.value).toBe(true));
    expect(state.intakeForm.value).toBeNull();
    expect(state.isError.value).toBe(false);
  });

  it('reports an error and retries on demand when the fetch fails', async () => {
    const spy = vi
      .spyOn(intakeFormsApi, 'getIntakeFormByEntityType')
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce(null);
    vi.spyOn(customPropertiesApi, 'listCustomProperties').mockResolvedValue([]);
    const state = useMetricIntakeForm(ref(true));
    await vi.waitFor(() => expect(state.isError.value).toBe(true));
    expect(state.isLoaded.value).toBe(false);
    state.retry();
    await vi.waitFor(() => expect(state.isLoaded.value).toBe(true));
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it('does not fetch while disabled', async () => {
    const spy = vi.spyOn(intakeFormsApi, 'getIntakeFormByEntityType').mockResolvedValue(null);
    vi.spyOn(customPropertiesApi, 'listCustomProperties').mockResolvedValue([]);
    useMetricIntakeForm(ref(false));
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(spy).not.toHaveBeenCalled();
  });
});
