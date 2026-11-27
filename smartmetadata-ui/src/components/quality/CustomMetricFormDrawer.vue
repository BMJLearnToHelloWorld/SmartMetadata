<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
  Official CustomMetricForm + CustomMetricFormDrawer (table-level from
  the QualityTab 添加 menu, where formType is TABLE unless the caller
  is on COLUMN_PROFILE). Vue3 + ant-design-vue. No CCL React/CSS copy.
  Official ShowHintToggle + TableProfilerChart (showHeader=false)
  preview for the table-level QualityTab path. Column-level
  SingleColumnProfile stays on the official column-profile path.
-->
<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { Form, Input, Select, message } from 'ant-design-vue';
import type { FormInstance, Rule } from 'ant-design-vue/es/form';
import SmDrawer from '@/components/shared/SmDrawer.vue';
import SmCodeEditor from '@/components/shared/SmCodeEditor.vue';
import ShowHintToggle from '@/components/quality/ShowHintToggle.vue';
import TableProfilerChartPreview from '@/components/quality/TableProfilerChartPreview.vue';
import { listTableCustomMetricNames, putCustomMetric, type CustomMetricRecord } from '@/api/customMetrics';
import { ENTITY_NAME_REGEX } from '@/utils/entityName';
import { CSMode } from '@/utils/codeMirrorUtils';

const props = withDefaults(
  defineProps<{
    open: boolean;
    tableId?: string;
    /** Official entityFqn passed into TableProfilerChart for the preview. */
    entityFqn?: string;
    /** Official isColumnMetric; QualityTab 添加 always opens table-level (false). */
    isColumnMetric?: boolean;
    existingNames?: string[];
    /** Official metric being edited; omit to add a new one. */
    metric?: CustomMetricRecord;
    /** Official activeColumnFqn seeds a new column metric's columnName. */
    activeColumnFqn?: string;
    columns?: Array<{ name: string; dataType?: string; fullyQualifiedName?: string; displayName?: string }>;
  }>(),
  {
    tableId: undefined,
    entityFqn: undefined,
    isColumnMetric: false,
    existingNames: () => [],
    metric: undefined,
    activeColumnFqn: undefined,
    columns: () => [],
  },
);

const emit = defineEmits<{
  (event: 'close'): void;
  (event: 'success'): void;
}>();

const { t } = useI18n();
const formRef = ref<FormInstance>();
const form = reactive({ name: '', expression: '', columnName: '' });
const isEditMode = computed(() => Boolean(props.metric));
const submitting = ref(false);
const loadedNames = ref<string[]>([]);
/** Official ShowHintToggle default is true. */
const showHint = ref(true);

const metricNames = computed(() => (loadedNames.value.length > 0 ? loadedNames.value : props.existingNames));
const previewMetrics = computed(() => metricNames.value.map((name) => ({ name })));
const drawerWidthKey = computed(() => (showHint.value ? 'formWithHint' : 'formWithoutHint'));

const title = computed(() =>
  isEditMode.value
    ? t('label.edit-entity', { entity: props.metric?.name })
    : t('label.add-entity-metric', {
        entity: props.isColumnMetric ? t('label.column') : t('label.table'),
      }),
);
const submitLabel = computed(() => (isEditMode.value ? t('label.save') : t('label.create')));

function columnNameFromActiveFqn(): string {
  const match = props.columns.find((column) => column.fullyQualifiedName === props.activeColumnFqn);
  return match?.name || props.metric?.columnName || '';
}

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
      if (value && !isEditMode.value && metricNames.value.includes(value)) {
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
    form.name = props.metric?.name ?? '';
    form.expression = props.metric?.expression ?? '';
    form.columnName = props.metric?.columnName ?? columnNameFromActiveFqn();
    showHint.value = true;
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
  form.columnName = '';
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
      ...(props.isColumnMetric && form.columnName ? { columnName: form.columnName } : {}),
    });
    message.success(
      t(isEditMode.value ? 'server.update-entity-success' : 'server.create-entity-success', {
        entity: form.name.trim(),
      }),
    );
    emit('success');
    onClose();
  } catch (error) {
    message.error(
      error instanceof Error
        ? error.message
        : t(isEditMode.value ? 'server.update-entity-error' : 'server.create-entity-error', { entity: form.name.trim() || t('label.custom-metric') }),
    );
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <SmDrawer
    :open="open"
    :title="title"
    :ok-text="submitLabel"
    :cancel-text="t('label.cancel')"
    :confirm-loading="submitting"
    :ok-disabled="!tableId"
    :width-key="drawerWidthKey"
    test-id="custom-metric-form-drawer"
    ok-test-id="submit-button"
    cancel-test-id="cancel-button"
    :mask-closable="false"
    :keyboard="false"
    @cancel="onClose"
    @ok="onSubmit"
  >
    <template #headerActions>
      <ShowHintToggle v-model="showHint" />
    </template>
    <div class="custom-metric-form-layout">
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
          :disabled="isEditMode"
          :placeholder="t('label.enter-entity', { entity: t('label.name') })"
        />
      </Form.Item>
      <Form.Item
        v-if="isColumnMetric"
        name="columnName"
        :label="t('label.column')"
        required
        :rules="[{ required: true, message: t('label.field-required', { field: t('label.column') }) }]"
      >
        <Select
          v-model:value="form.columnName"
          data-testid="custom-metric-column"
          :disabled="isEditMode"
          :placeholder="t('label.enter-entity', { entity: t('label.column') })"
          :options="columns.map((column) => ({ value: column.name, label: column.displayName || column.name }))"
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
    <div
      v-if="showHint && !isColumnMetric"
      class="custom-metric-form-layout__preview"
      data-testid="custom-metric-profile-preview"
    >
      <TableProfilerChartPreview :entity-fqn="entityFqn" :custom-metrics="previewMetrics" />
    </div>
    </div>
  </SmDrawer>
</template>

<style scoped>
.custom-metric-form-layout {
  display: flex;
  gap: 24px;
  align-items: flex-start;
}
.custom-metric-form-layout > form {
  flex: 1 1 0;
  min-width: 0;
}
.custom-metric-form-layout__preview {
  flex: 1 1 0;
  min-width: 0;
}
</style>
