<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { Button, Card, Checkbox, Input, Select, Typography } from 'ant-design-vue';
import {
  buildDesignerSchema,
  createEmptyDesignerField,
  getDesignerPreviewPayload,
  TASK_FORM_FIELD_TYPES,
  TASK_FORM_FIELD_TYPE_LABELS,
  withFieldType,
  type TaskFormDesignerField,
  type TaskFormDesignerFieldType,
} from '@/views/admin/taskFormDesigner';
import type { JsonSchemaObject } from '@/api/taskFormSchemas';

const props = defineProps<{
  title: string;
  description?: string;
  fields: TaskFormDesignerField[];
  testIdPrefix: string;
  baseFormSchema?: JsonSchemaObject;
  baseUiSchema?: JsonSchemaObject;
}>();

const emit = defineEmits<{ change: [fields: TaskFormDesignerField[]] }>();

const { t } = useI18n();

const previewConfig = computed(() =>
  buildDesignerSchema(props.fields, props.baseFormSchema, props.baseUiSchema),
);
const previewPayload = computed(() => getDesignerPreviewPayload(props.fields));

function updateField(
  index: number,
  updater: (field: TaskFormDesignerField) => TaskFormDesignerField,
): void {
  emit(
    'change',
    props.fields.map((field, currentIndex) =>
      currentIndex === index ? updater(field) : field,
    ),
  );
}

function fieldSummary(field: TaskFormDesignerField): string {
  return [
    `${t('taskForms.inputType')}: ${TASK_FORM_FIELD_TYPE_LABELS[field.type]}`,
    field.required ? t('taskForms.required') : undefined,
    field.hidden ? t('taskForms.hidden') : undefined,
  ]
    .filter(Boolean)
    .join(' • ');
}
</script>

<template>
  <div>
    <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 16px">
      <div>
        <Typography.Title :level="5" style="margin: 0">{{ title }}</Typography.Title>
        <Typography.Paragraph v-if="description" type="secondary" style="margin: 0">
          {{ description }}
        </Typography.Paragraph>
      </div>
      <Button
        :data-testid="`${testIdPrefix}-add-field`"
        @click="emit('change', [...fields, createEmptyDesignerField()])"
      >
        {{ t('taskForms.addField') }}
      </Button>
    </div>
    <div v-if="fields.length > 0">
      <Card
        v-for="(field, index) in fields"
        :key="field.key"
        :data-testid="`${testIdPrefix}-field-card-${index}`"
        size="small"
        style="margin-bottom: 12px"
      >
        <template #title>
          <div>
            <Typography.Text strong>{{ field.label || field.name || `${t('taskForms.field')} ${index + 1}` }}</Typography.Text>
            <br />
            <Typography.Text type="secondary">{{ fieldSummary(field) }}</Typography.Text>
          </div>
        </template>
        <template #extra>
          <Button
            danger
            type="link"
            size="small"
            :data-testid="`${testIdPrefix}-field-remove-${index}`"
            @click="emit('change', fields.filter((_, currentIndex) => currentIndex !== index))"
          >
            {{ t('crud.delete') }}
          </Button>
        </template>
        <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 12px">
          <div>
            <Typography.Text>{{ t('taskForms.fieldName') }}</Typography.Text>
            <Input
              :value="field.name"
              :data-testid="`${testIdPrefix}-field-name-${index}`"
              placeholder="requestReason"
              @change="(event: { target: { value: string } }) => updateField(index, (current) => ({ ...current, name: event.target.value }))"
            />
          </div>
          <div>
            <Typography.Text>{{ t('taskForms.fieldLabel') }}</Typography.Text>
            <Input
              :value="field.label"
              :data-testid="`${testIdPrefix}-field-label-${index}`"
              placeholder="Request Reason"
              @change="(event: { target: { value: string } }) => updateField(index, (current) => ({ ...current, label: event.target.value }))"
            />
          </div>
          <div>
            <Typography.Text>{{ t('taskForms.fieldType') }}</Typography.Text>
            <Select
              :value="field.type"
              :data-testid="`${testIdPrefix}-field-type-${index}`"
              style="width: 100%"
              @change="(value: TaskFormDesignerFieldType) => updateField(index, (current) => withFieldType(current, value))"
            >
              <Select.Option v-for="option in TASK_FORM_FIELD_TYPES" :key="option.id" :value="option.id">
                {{ option.label }}
              </Select.Option>
            </Select>
          </div>
        </div>
        <div v-if="field.type === 'json'" style="margin-top: 12px">
          <Typography.Text>{{ t('taskForms.jsonShape') }}</Typography.Text>
          <Select
            :value="field.schemaType ?? 'object'"
            :data-testid="`${testIdPrefix}-field-schema-type-${index}`"
            style="width: 100%"
            @change="(value: 'object' | 'array') => updateField(index, (current) => ({ ...current, schemaType: value }))"
          >
            <Select.Option value="object">Object</Select.Option>
            <Select.Option value="array">Array</Select.Option>
          </Select>
        </div>
        <div v-if="field.type === 'singleSelect' || field.type === 'multiSelect'" style="margin-top: 12px">
          <Typography.Text>{{ t('taskForms.options') }}</Typography.Text>
          <Input.TextArea
            :value="field.options.join('\n')"
            :data-testid="`${testIdPrefix}-field-options-${index}`"
            :rows="3"
            :placeholder="t('taskForms.optionsPlaceholder')"
            @change="(event: { target: { value: string } }) => updateField(index, (current) => ({ ...current, options: event.target.value.split('\n').map((line) => line.trim()).filter(Boolean) }))"
          />
        </div>
        <div style="margin-top: 12px">
          <Typography.Text>{{ t('taskForms.helpText') }}</Typography.Text>
          <Input.TextArea
            :value="field.description ?? ''"
            :data-testid="`${testIdPrefix}-field-description-${index}`"
            :rows="2"
            :placeholder="t('taskForms.helpTextPlaceholder')"
            @change="(event: { target: { value: string } }) => updateField(index, (current) => ({ ...current, description: event.target.value }))"
          />
        </div>
        <div style="margin-top: 12px; display: flex; gap: 24px">
          <Checkbox
            :checked="field.required"
            :data-testid="`${testIdPrefix}-field-required-${index}`"
            @change="(event: { target: { checked: boolean } }) => updateField(index, (current) => ({ ...current, required: event.target.checked }))"
          >
            {{ t('taskForms.required') }}
          </Checkbox>
          <Checkbox
            :checked="field.hidden"
            :data-testid="`${testIdPrefix}-field-hidden-${index}`"
            @change="(event: { target: { checked: boolean } }) => updateField(index, (current) => ({ ...current, hidden: event.target.checked }))"
          >
            {{ t('taskForms.hidden') }}
          </Checkbox>
        </div>
      </Card>
    </div>
    <Typography.Paragraph v-else type="secondary" :data-testid="`${testIdPrefix}-empty`">
      {{ t('taskForms.noFieldsConfigured') }}
    </Typography.Paragraph>
    <Card size="small" :data-testid="`${testIdPrefix}-preview`">
      <template #title>{{ t('taskForms.preview') }}</template>
      <div v-if="fields.length > 0">
        <div v-for="field in fields" :key="field.key" style="margin-bottom: 8px">
          <Typography.Text strong>{{ field.label || field.name }}</Typography.Text>
          <Typography.Text type="secondary" style="margin-left: 8px">
            ({{ (previewConfig.formSchema.properties as Record<string, { type?: string }>)[field.name.trim()]?.type ?? '' }})
          </Typography.Text>
          <Typography.Text type="secondary" style="margin-left: 8px">
            {{ JSON.stringify(previewPayload[field.name.trim()] ?? '') }}
          </Typography.Text>
        </div>
      </div>
      <Typography.Text v-else type="secondary">{{ t('taskForms.addFieldsToPreview') }}</Typography.Text>
    </Card>
  </div>
</template>
