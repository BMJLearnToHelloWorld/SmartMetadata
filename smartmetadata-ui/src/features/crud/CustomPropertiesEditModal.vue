<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { reactive, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { Form, Input, InputNumber, Switch } from 'ant-design-vue';
import FormModal from '@/components/shared/FormModal.vue';
import type { CustomPropertyDef } from '@/types/collaboration';

const props = defineProps<{
  open: boolean;
  defs: CustomPropertyDef[];
  values: Record<string, unknown>;
  saving: boolean;
}>();

const emit = defineEmits<{
  (event: 'save', next: Record<string, unknown>): void;
  (event: 'cancel'): void;
}>();

const { t } = useI18n();
// One form record per input kind so vue-tsc sees exact types: text stays
// string, numbers stay number|null, booleans stay boolean|undefined
// (undefined = untouched/absent, so saving without touching a boolean
// switch does not invent a false value).
const form = reactive<Record<string, string>>({});
const numForm = reactive<Record<string, number | null>>({});
const boolForm = reactive<Record<string, boolean | undefined>>({});

function isNumberDef(def: CustomPropertyDef): boolean {
  return def.propertyType === 'integer' || def.propertyType === 'number';
}

function isBooleanDef(def: CustomPropertyDef): boolean {
  return def.propertyType === 'boolean';
}

watch(
  () => props.open,
  (open) => {
    if (!open) {
      return;
    }
    for (const key of Object.keys(form)) {
      delete form[key];
    }
    for (const key of Object.keys(numForm)) {
      delete numForm[key];
    }
    for (const key of Object.keys(boolForm)) {
      delete boolForm[key];
    }
    for (const def of props.defs) {
      const current = props.values[def.name];
      if (isBooleanDef(def)) {
        boolForm[def.name] = current === undefined || current === null ? undefined : current === true;
      } else if (isNumberDef(def)) {
        const parsed = typeof current === 'number' ? current : Number(current);
        numForm[def.name] = current === undefined || current === null || !Number.isFinite(parsed) ? null : parsed;
      } else {
        form[def.name] = current === undefined || current === null ? '' : String(current);
      }
    }
  },
  // The modal is often mounted already open (parent renders it with
  // :open="true" from the start); without immediate the form stays blank.
  { immediate: true },
);

function onSave(): void {
  const next: Record<string, unknown> = { ...(props.values || {}) };
  for (const def of props.defs) {
    if (isBooleanDef(def)) {
      const value = boolForm[def.name];
      if (value === undefined) {
        delete next[def.name];
      } else {
        next[def.name] = value;
      }
      continue;
    }
    if (isNumberDef(def)) {
      const value = numForm[def.name];
      if (value === null || value === undefined) {
        delete next[def.name];
      } else {
        next[def.name] = value;
      }
      continue;
    }
    const typed = form[def.name]?.trim() ?? '';
    if (!typed) {
      delete next[def.name];
      continue;
    }
    next[def.name] = typed;
  }
  emit('save', next);
}
</script>

<template>
  <FormModal
    :open="open"
    :title="t('asset.editCustomProperties')"
    :ok-text="t('crud.save')"
    :cancel-text="t('crud.cancel')"
    :confirm-loading="saving"
    @ok="onSave"
    @cancel="emit('cancel')"
  >
    <Form layout="vertical">
      <Form.Item
        v-for="def in defs"
        :key="def.name"
        :label="def.displayName || def.name"
        :extra="def.description"
      >
        <Switch
          v-if="isBooleanDef(def)"
          v-model:checked="boolForm[def.name]"
          :data-testid="`custom-prop-${def.name}`"
        />
        <InputNumber
          v-else-if="isNumberDef(def)"
          v-model:value="numForm[def.name]"
          style="width: 100%"
          :data-testid="`custom-prop-${def.name}`"
        />
        <Input v-else v-model:value="form[def.name]" :data-testid="`custom-prop-${def.name}`" />
      </Form.Item>
    </Form>
    <p v-if="!defs.length">{{ t('asset.noCustomProperties') }}</p>
  </FormModal>
</template>
