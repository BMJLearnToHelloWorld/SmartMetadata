<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { Checkbox, Form, Input } from 'ant-design-vue';
import {
  serviceFilterFieldsForKind,
  type ServiceFilterFieldDef,
  type ServiceFilterValues,
} from '@/ingestion/serviceFilterFields';
import type { ServiceKind } from '@/types/ingestion';

const props = defineProps<{ kind: ServiceKind; values: ServiceFilterValues }>();
const { t } = useI18n();

const fields = computed(() => serviceFilterFieldsForKind(props.kind));
const record = computed(() => props.values as unknown as Record<string, unknown>);

function stringValue(field: ServiceFilterFieldDef): string {
  const value = record.value[field.key];
  return typeof value === 'string' ? value : '';
}

function setField(field: ServiceFilterFieldDef, value: unknown): void {
  record.value[field.key] = value;
}
</script>

<template>
  <Form.Item
    v-for="field in fields"
    :key="field.key"
    :label="field.control === 'checkbox' ? undefined : t(field.labelKey)"
    :extra="field.helpKey ? t(field.helpKey) : undefined"
  >
    <Checkbox
      v-if="field.control === 'checkbox'"
      :checked="record[field.key] === true"
      :data-testid="field.testId"
      @update:checked="(checked) => setField(field, checked)"
    >
      {{ t(field.labelKey) }}
    </Checkbox>
    <Input
      v-else
      :value="stringValue(field)"
      :data-testid="field.testId"
      @update:value="(value) => setField(field, value)"
    />
  </Form.Item>
</template>
