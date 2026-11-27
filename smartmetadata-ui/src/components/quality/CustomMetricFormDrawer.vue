<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
  Official CustomMetricForm + CustomMetricFormDrawer (table-level from
  the QualityTab 添加 menu, where formType is TABLE unless the caller
  is on COLUMN_PROFILE). Vue3 + ant-design-vue. No CCL React/CSS copy.
  Official also shows a ShowHintToggle + TableProfilerChart preview;
  this drawer lands official fields, validation, and PUT, and does not
  invent a preview chart the product does not already have.
-->
<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { Form, Input, message } from 'ant-design-vue';
import type { FormInstance, Rule } from 'ant-design-vue/es/form';
import SmDrawer from '@/components/shared/SmDrawer.vue';
import SmCodeEditor from '@/components/shared/SmCodeEditor.vue';
import { listTableCustomMetricNames, putCustomMetric } from '@/api/customMetrics';
import { ENTITY_NAME_REGEX } from '@/utils/entityName';
import { CSMode } from '@/utils/codeMirrorUtils';

const props = withDefaults(
  defineProps<{
    open: boolean;
    tableId?: string;
    /** Official isColumnMetric; QualityTab 添加 always opens table-level (false). */
    isColumnMetric?: boolean;
    existingNames?: string[];
  }>(),
  {
    tableId: undefined,
    isColumnMetric: false,
    existingNames: () => [],
  },
);

const emit = defineEmits<{
  (event: 'close'): void;
  (event: 'success'): void;
}>();

const { t } = useI18n();
const formRef = ref<FormInstance>();
const form = reactive({ name: '', expression: '' });
const submitting = ref(false);
const loadedNames = ref<string[]>([]);

const metricNames = computed(() => (loadedNames.value.length > 0 ? loadedNames.value : props.existingNames));

const title = computed(() =>
  t('label.add-entity-metric', {
    entity: props.isColumnMetric ? t('label.column') : t('label.table'),
  }),
);

const nameRules: Rule[] = [
  { required: true, message: t('label.field-required', { field: t('label.name') }) },
  {
    max: 128,
    message: t('message.entity-size-in-between', { entity: t('label.name'), min: 1, max: 128 }),
  },
  {
    pattern: ENTITY_NAME_REGEX,
    message: t('message.entity-name-validation'),
  },
  {
    validator: async (_rule, value: string) => {
      if (value && metricNames.value.includes(value)) {
        return Promise.reject(new Error(t('message.entity-already-exists', { entity: t('label.custom-metric') })));
      }
      return Promise.resolve();
    },
  },
];

watch(
  () => props.open,
  (open) => {
    if (!open) {
      return;
    }
    form.name = '';
    form.expression = '';
    loadedNames.value = [...props.existingNames];
    if (props.tableId) {
      void listTableCustomMetricNames(props.tableId)
        .then((names) => {
          loadedNames.value = names;
        })
        .catch(() => {
          /* keep the names the caller already supplied */
        });
    }
  },
);

function onClose(): void {
  form.name = '';
  form.expression = '';
  emit('close');
}

async function onSubmit(): Promise<void> {
  if (submitting.value || !props.tableId) {
    return;
  }
  try {
    await formRef.value?.validate();
  } catch {
    return;
  }
  if (!form.expression.trim()) {
    message.error(t('message.field-text-is-required', { fieldText: t('label.sql-uppercase-query') }));
    return;
  }
  submitting.value = true;
  try {
    await putCustomMetric(props.tableId, {
      name: form.name.trim(),
      expression: form.expression,
    });
    message.success(t('server.create-entity-success', { entity: form.name.trim() }));
    emit('success');
    onClose();
  } catch (error) {
    message.error(error instanceof Error ? error.message : t('crud.saveFailed'));
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <SmDrawer
    :open="open"
    :title="title"
    :ok-text="t('label.create')"
    :cancel-text="t('label.cancel')"
    :confirm-loading="submitting"
    :ok-disabled="!tableId"
    test-id="custom-metric-form-drawer"
    ok-test-id="submit-button"
    cancel-test-id="cancel-button"
    :mask-closable="false"
    :keyboard="false"
    @cancel="onClose"
    @ok="onSubmit"
  >
    <Form
      id="custom-metric-form"
      ref="formRef"
      data-testid="custom-metric-form"
      layout="vertical"
      :model="form"
      @finish="onSubmit"
    >
      <Form.Item name="name" :label="t('label.name')" required :rules="nameRules">
        <Input
          v-model:value="form.name"
          data-testid="custom-metric-name"
          :placeholder="t('label.enter-entity', { entity: t('label.name') })"
        />
      </Form.Item>
      <Form.Item :label="t('label.sql-uppercase-query')" required>
        <div data-testid="sql-editor-container">
          <SmCodeEditor
            variant="code"
            :mode="{ name: CSMode.SQL }"
            :value="form.expression"
            show-copy-button
            class-name="custom-query-editor"
            @change="form.expression = $event"
          />
        </div>
      </Form.Item>
    </Form>
  </SmDrawer>
</template>
