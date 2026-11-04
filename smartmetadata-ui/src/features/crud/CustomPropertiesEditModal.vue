<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { reactive, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { Form, Input } from 'ant-design-vue';
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
const form = reactive<Record<string, string>>({});

watch(
  () => props.open,
  (open) => {
    if (!open) {
      return;
    }
    for (const key of Object.keys(form)) {
      delete form[key];
    }
    for (const def of props.defs) {
      const current = props.values[def.name];
      form[def.name] = current === undefined || current === null ? '' : String(current);
    }
  },
  // The modal is often mounted already open (parent renders it with
  // :open="true" from the start); without immediate the form stays blank.
  { immediate: true },
);

function onSave(): void {
  const next: Record<string, unknown> = { ...(props.values || {}) };
  for (const def of props.defs) {
    const typed = form[def.name]?.trim() ?? '';
    if (!typed) {
      delete next[def.name];
      continue;
    }
    if (def.propertyType === 'integer' || def.propertyType === 'number') {
      const parsed = Number(typed);
      next[def.name] = Number.isFinite(parsed) ? parsed : typed;
    } else {
      next[def.name] = typed;
    }
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
        <Input v-model:value="form[def.name]" :data-testid="`custom-prop-${def.name}`" />
      </Form.Item>
    </Form>
    <p v-if="!defs.length">{{ t('asset.noCustomProperties') }}</p>
  </FormModal>
</template>
