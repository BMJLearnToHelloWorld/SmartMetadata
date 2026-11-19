<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { Button } from 'ant-design-vue';
import { nextTick, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { HIDDEN_SCHEMA_PATHS, type JsonSchema } from './appAssets';
import AppSchemaField from './AppSchemaField.vue';
import { formatFormDataForRender } from './formDataFormat';
import {
  fieldIdForPath,
  omitExtraData,
  seedSchemaDefaults,
  validateSchemaForm,
  type SchemaFormError,
} from './schemaFormUtils';

const props = withDefaults(
  defineProps<{
    schema: JsonSchema;
    formData: Record<string, unknown>;
    okText?: string;
    cancelText?: string;
    isLoading?: boolean;
    isSubmitDisabled?: boolean;
    hideCancelButton?: boolean;
    hideFooter?: boolean;
    status?: string;
    disabled?: boolean;
    readonly?: boolean;
    hiddenPaths?: ReadonlySet<string>;
    isFieldReadonly?: (dotPath: string) => boolean;
    flatPropertyLayout?: boolean;
  }>(),
  {
    okText: undefined,
    cancelText: undefined,
    isLoading: false,
    isSubmitDisabled: false,
    hideCancelButton: false,
    hideFooter: false,
    status: 'initial',
    disabled: false,
    readonly: false,
    hiddenPaths: () => HIDDEN_SCHEMA_PATHS,
    isFieldReadonly: undefined,
    flatPropertyLayout: false,
  },
);

const emit = defineEmits<{
  cancel: [];
  submit: [formData: Record<string, unknown>];
  change: [formData: Record<string, unknown>];
  focus: [id: string, meta: { title?: string; description?: string }];
}>();

const { t } = useI18n();

/**
 * Official FormBuilderV1 (components/common/FormBuilderV1/
 * FormBuilderV1.tsx, pin a3012259ca) as far as the 10 application
 * schemas reach: local state initialized from `formatFormDataForRender`
 * and re-synced whenever `formData` changes; Cancel resets to the
 * render state; submit validates (pin's transformErrors surface:
 * required/minimum/maximum only), focuses the first error, and emits
 * `omitExtraData`-cleaned data. The footer is sticky with Cancel +
 * Submit (`submit-btn`, `label.submitting` while waiting). The
 * renderer subset boundary (no AnyOf/OneOf/LayoutGrid: unreachable
 * from the bundled schemas) lives in schemaFormUtils.ts.
 */
function renderState(): Record<string, unknown> {
  return seedSchemaDefaults(props.schema, formatFormDataForRender(props.formData ?? {}));
}

const localFormData = ref<Record<string, unknown>>(renderState());
const errors = ref<SchemaFormError[]>([]);

watch(
  () => props.formData,
  () => {
    localFormData.value = renderState();
    errors.value = [];
  },
);

function onFieldChange(value: unknown): void {
  localFormData.value = value as Record<string, unknown>;
  emit('change', localFormData.value);
}

function handleCancel(): void {
  localFormData.value = renderState();
  errors.value = [];
  emit('cancel');
}

async function handleSubmit(): Promise<void> {
  const found = validateSchemaForm(props.schema, localFormData.value, props.hiddenPaths);
  errors.value = found;
  if (found.length > 0) {
    await nextTick();
    const first = document.getElementById(fieldIdForPath(found[0].path.split('.')));
    first?.scrollIntoView?.({ behavior: 'smooth', block: 'center' });
    first
      ?.querySelector<HTMLElement>('input, textarea, select, [tabindex]')
      ?.focus();
    return;
  }
  emit('submit', omitExtraData(props.schema, localFormData.value));
}

function forwardFocus(id: string, meta: { title?: string; description?: string }): void {
  emit('focus', id, meta);
}

const isSubmitting = () => props.status === 'waiting';
</script>

<template>
  <form novalidate @submit.prevent="handleSubmit">
    <AppSchemaField
      :disabled="disabled"
      :errors="errors"
      field-name=""
      :flat-property-layout="flatPropertyLayout"
      :hidden-paths="hiddenPaths"
      :is-field-readonly="isFieldReadonly"
      :model-value="localFormData"
      :path="[]"
      :readonly="readonly"
      :schema="schema"
      @focus="forwardFocus"
      @update:model-value="onFieldChange"
    />
    <div
      v-if="!hideFooter"
      style="
        position: sticky;
        bottom: 0;
        z-index: 10;
        margin-top: 16px;
        border-top: 1px solid #d9d9d9;
        background: #fff;
        padding-top: 16px;
        padding-bottom: 4px;
        display: flex;
        justify-content: flex-end;
        gap: 8px;
      "
    >
      <Button v-if="!hideCancelButton" html-type="button" @click="handleCancel">
        {{ cancelText ?? t('label.cancel') }}
      </Button>
      <Button
        data-testid="submit-btn"
        :disabled="isSubmitting() || isLoading || isSubmitDisabled"
        html-type="submit"
        type="primary"
      >
        {{ isSubmitting() ? t('label.submitting') : (okText ?? t('label.submit')) }}
      </Button>
    </div>
  </form>
</template>
