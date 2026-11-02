<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { Checkbox, Form, Input, InputNumber, Select, Typography } from 'ant-design-vue';
import { requiredField } from '@/features/crud/formRules';
import {
  connectionFieldPlaceholder,
  connectionFieldsForType,
  connectionPasswordPlaceholder,
  isConnectionFieldVisible,
  type ConnectionFieldDef,
} from '@/ingestion/connectionFields';
import type { ServiceFormValues } from '@/types/ingestion';

const props = defineProps<{ form: ServiceFormValues }>();
const { t } = useI18n();

const type = computed(() => props.form.serviceType);
const fields = computed(() => connectionFieldsForType(type.value));
const record = computed(() => props.form as unknown as Record<string, unknown>);

function visible(field: ConnectionFieldDef): boolean {
  return isConnectionFieldVisible(field, record.value);
}

function placeholder(field: ConnectionFieldDef): string {
  if (field.placeholderKey) {
    return t(field.placeholderKey);
  }
  if (field.passwordPlaceholder) {
    return connectionPasswordPlaceholder(type.value);
  }
  return connectionFieldPlaceholder(field, type.value);
}

function stringValue(field: ConnectionFieldDef): string {
  const value = record.value[field.key];
  return typeof value === 'string' ? value : '';
}

function numberValue(field: ConnectionFieldDef): number | undefined {
  const value = record.value[field.key];
  return typeof value === 'number' ? value : undefined;
}

function booleanValue(field: ConnectionFieldDef): boolean {
  return record.value[field.key] === true;
}

function setField(field: ConnectionFieldDef, value: unknown): void {
  record.value[field.key] = value;
}

function optionLabel(option: { value: string; labelKey?: string }): string {
  return option.labelKey ? t(option.labelKey) : option.value;
}
</script>

<template>
  <template v-for="field in fields" :key="field.key || field.textKey">
    <Typography.Paragraph v-if="field.control === 'note'" type="secondary">
      {{ field.textKey ? t(field.textKey) : '' }}
    </Typography.Paragraph>
    <Form.Item
      v-else-if="visible(field)"
      :label="field.hideItemLabel ? undefined : t(field.labelKey)"
      :rules="field.required ? requiredField(t, t(field.labelKey)) : undefined"
      :extra="field.extraKey ? t(field.extraKey) : undefined"
    >
      <Input
        v-if="field.control === 'text'"
        :value="stringValue(field)"
        :data-testid="field.testId"
        :placeholder="placeholder(field)"
        autocomplete="off"
        @update:value="(value) => setField(field, value)"
      />
      <Input.Password
        v-else-if="field.control === 'password'"
        :value="stringValue(field)"
        :data-testid="field.testId"
        :placeholder="placeholder(field)"
        autocomplete="new-password"
        @update:value="(value) => setField(field, value)"
      />
      <Select
        v-else-if="field.control === 'select'"
        :value="stringValue(field) || undefined"
        :data-testid="field.testId"
        :placeholder="placeholder(field)"
        :options="(field.options ?? []).map((option) => ({ value: option.value, label: optionLabel(option) }))"
        allow-clear
        @update:value="(value) => setField(field, value)"
      />
      <Checkbox
        v-else-if="field.control === 'checkbox'"
        :checked="booleanValue(field)"
        :data-testid="field.testId"
        @update:checked="(checked) => setField(field, checked)"
      >
        {{ t(field.labelKey) }}
      </Checkbox>
      <InputNumber
        v-else-if="field.control === 'number'"
        :value="numberValue(field)"
        :data-testid="field.testId"
        :min="field.min"
        :max="field.max"
        style="width: 100%"
        @update:value="(value) => setField(field, value)"
      />
      <Typography.Paragraph v-if="field.hintKey" type="secondary" class="svc-hint">
        {{ t(field.hintKey) }}
      </Typography.Paragraph>
    </Form.Item>
  </template>
</template>

<style scoped>
.svc-hint {
  margin-top: 8px;
  margin-bottom: 0;
}
</style>
