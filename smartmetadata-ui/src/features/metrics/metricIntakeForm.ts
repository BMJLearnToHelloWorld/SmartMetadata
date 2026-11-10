/**
 * Copyright 2026 SmartMetadata authors.
 * Licensed under the Apache License, Version 2.0.
 */
import { ref, watch, type Ref } from 'vue';
import {
  getIntakeFormByEntityType,
  type IntakeForm,
  type IntakeFormField,
} from '@/api/intakeForms';
import { listCustomProperties } from '@/api/customProperties';
import type { CustomPropertyDef } from '@/types/collaboration';

/**
 * Official getIntakeFormFields (utils/IntakeFormUtils.ts), verbatim:
 * formFields is the current input; when it is empty the deprecated
 * requiredFields list stands in, every entry forced required.
 */
export function getIntakeFormFields(
  intakeForm?: IntakeForm | null,
): IntakeFormField[] {
  if (intakeForm?.formFields?.length || !intakeForm?.requiredFields?.length) {
    return intakeForm?.formFields ?? [];
  }
  return (intakeForm?.requiredFields ?? []).map((field) => ({
    ...field,
    required: true,
  }));
}

export interface SplitIntakeFormFields {
  requiredNativeFields: Map<string, IntakeFormField>;
  extensionFormFields: IntakeFormField[];
}

/**
 * Official useMetricIntakeForm field split: a field is an extension
 * field when its kind is CustomProperty or its path starts with
 * `extension.`; otherwise a required native field lands in the
 * required map. Non-required native fields are not tracked — the form
 * renders them as optional either way.
 */
export function splitIntakeFormFields(fields: IntakeFormField[]): SplitIntakeFormFields {
  const requiredNativeFields = new Map<string, IntakeFormField>();
  const extensionFormFields: IntakeFormField[] = [];
  for (const field of fields) {
    if (field.fieldKind === 'customProperty' || field.fieldPath.startsWith('extension.')) {
      extensionFormFields.push(field);
    } else if (field.required) {
      requiredNativeFields.set(field.fieldPath, field);
    }
  }
  return { requiredNativeFields, extensionFormFields };
}

export interface MetricIntakeFormState {
  intakeForm: Ref<IntakeForm | null>;
  customProperties: Ref<CustomPropertyDef[]>;
  requiredNativeFields: Ref<Map<string, IntakeFormField>>;
  extensionFormFields: Ref<IntakeFormField[]>;
  /** Both fetches succeeded and neither is in flight. */
  isLoaded: Ref<boolean>;
  /** Either fetch failed with a non-404 error. */
  isError: Ref<boolean>;
  retry: () => Promise<void>;
}

/**
 * Official useMetricIntakeForm (components/Metric/AddMetric/
 * useMetricIntakeForm.ts) equivalent: two parallel fetches — the intake
 * form for the metric entity type, and the metric custom properties
 * (the product's listCustomProperties endpoint is verbatim the
 * official getCustomPropertiesByEntityType one).
 *
 * `isLoaded` requires both fetches to have succeeded and neither to be
 * in flight; a fetch error sets `isError` and offers `retry` (the
 * drawer shows the error state with a retry button). A missing intake
 * form (404 → null) is NOT an error: the field set is then empty and
 * the drawer still submits.
 */
export function useMetricIntakeForm(enabled: Ref<boolean>): MetricIntakeFormState {
  const intakeForm = ref<IntakeForm | null>(null);
  const customProperties = ref<CustomPropertyDef[]>([]);
  const requiredNativeFields = ref(new Map<string, IntakeFormField>());
  const extensionFormFields = ref<IntakeFormField[]>([]);
  const isLoaded = ref(false);
  const isError = ref(false);
  const fetching = ref(false);
  let loadSeq = 0;

  async function load(): Promise<void> {
    const token = ++loadSeq;
    fetching.value = true;
    isError.value = false;
    try {
      const [form, properties] = await Promise.all([
        getIntakeFormByEntityType('metric'),
        listCustomProperties('metric'),
      ]);
      if (token !== loadSeq) {
        return;
      }
      intakeForm.value = form;
      customProperties.value = properties;
      const split = splitIntakeFormFields(getIntakeFormFields(form));
      requiredNativeFields.value = split.requiredNativeFields;
      extensionFormFields.value = split.extensionFormFields;
      isLoaded.value = true;
    } catch {
      if (token !== loadSeq) {
        return;
      }
      isError.value = true;
      isLoaded.value = false;
    } finally {
      if (token === loadSeq) {
        fetching.value = false;
      }
    }
  }

  async function retry(): Promise<void> {
    isLoaded.value = false;
    await load();
  }

  watch(
    enabled,
    (value) => {
      if (value) {
        void load();
      }
    },
    { immediate: true },
  );

  return {
    intakeForm,
    customProperties,
    requiredNativeFields,
    extensionFormFields,
    isLoaded,
    isError,
    retry,
  };
}
