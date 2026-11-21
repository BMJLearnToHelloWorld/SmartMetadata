<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { Button, Input, Modal, Typography, message } from 'ant-design-vue';
import { DeleteOutlined, PlusOutlined } from '@ant-design/icons-vue';
import type { TermReference } from '@/types/governance';
import {
  filterSavableReferences,
  validateReference,
  type ReferenceError,
} from '@/governance/glossaryTermWidgets';

/**
 * References edit modal (D-2 batch 5a). Pin
 * `U/components/Glossary/GlossaryTerms/GlossaryTermReferencesModal.component.tsx`:
 * one row per reference (name + endpoint), add/remove rows, name
 * required, endpoint required + http(s) + parsable; only rows with
 * both fields are saved. A failed save keeps the modal open.
 */
const props = defineProps<{
  open: boolean;
  references: TermReference[];
  onSave: (references: TermReference[]) => Promise<unknown>;
  onClose: () => void;
}>();

const { t } = useI18n();

const rows = ref<TermReference[]>([]);
const errors = ref<Array<ReferenceError | undefined>>([]);
const saving = ref(false);

function reset(): void {
  rows.value =
    props.references.length > 0
      ? props.references.map((ref) => ({ ...ref }))
      : [{ name: '', endpoint: '' }];
  errors.value = rows.value.map(() => undefined);
}

watch(
  () => props.open,
  (open) => {
    if (open) {
      reset();
    }
  },
  { immediate: true },
);

function errorMessage(error: ReferenceError | undefined): string {
  switch (error) {
    case 'nameRequired':
      return t('crud.fieldRequired', { field: t('terms.referenceName') });
    case 'endpointRequired':
      return t('crud.fieldRequired', { field: t('terms.referenceEndpoint') });
    case 'urlScheme':
      return t('terms.referenceEndpointHint');
    case 'urlParsable':
      return t('terms.referenceInvalidUrl');
    default:
      return '';
  }
}

function addRow(): void {
  rows.value = [...rows.value, { name: '', endpoint: '' }];
  errors.value = [...errors.value, undefined];
}

function removeRow(index: number): void {
  rows.value = rows.value.filter((_, i) => i !== index);
  errors.value = errors.value.filter((_, i) => i !== index);
}

async function save(): Promise<void> {
  const nextErrors = rows.value.map((row) => validateReference(row));
  errors.value = nextErrors;
  if (nextErrors.some((error) => error !== undefined)) {
    return;
  }
  const next = filterSavableReferences(rows.value);
  if (JSON.stringify(next) === JSON.stringify(filterSavableReferences(props.references))) {
    props.onClose();
    return;
  }
  saving.value = true;
  try {
    await props.onSave(next);
    props.onClose();
  } catch (error) {
    message.error(error instanceof Error ? error.message : t('crud.updateFailed'));
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <Modal
    :open="open"
    :closable="false"
    :mask-closable="false"
    :keyboard="false"
    :title="t('terms.references')"
    data-testid="glossary-term-references-modal"
    @cancel="onClose"
  >
    <div
      v-for="(row, index) in rows"
      :key="index"
      class="widget-references-modal__row"
    >
      <div class="widget-references-modal__field">
        <Input
          v-model:value="row.name"
          :data-testid="`reference-name-${index}`"
          :placeholder="t('terms.referenceName')"
          :status="errors[index] === 'nameRequired' ? 'error' : undefined"
        />
        <Typography.Text v-if="errors[index] === 'nameRequired'" type="danger">
          {{ errorMessage(errors[index]) }}
        </Typography.Text>
      </div>
      <div class="widget-references-modal__field">
        <Input
          v-model:value="row.endpoint"
          :data-testid="`reference-endpoint-${index}`"
          :placeholder="t('terms.referenceEndpoint')"
          :status="errors[index] && errors[index] !== 'nameRequired' ? 'error' : undefined"
        />
        <Typography.Text
          v-if="errors[index] && errors[index] !== 'nameRequired'"
          type="danger"
        >
          {{ errorMessage(errors[index]) }}
        </Typography.Text>
      </div>
      <Button
        type="text"
        danger
        data-testid="delete-ref-btn"
        @click="removeRow(index)"
      >
        <DeleteOutlined />
      </Button>
    </div>
    <Button type="link" data-testid="add-references-button" @click="addRow">
      <PlusOutlined /> {{ t('terms.addReference') }}
    </Button>
    <template #footer>
      <Button data-testid="cancel-btn" @click="onClose">{{ t('crud.cancel') }}</Button>
      <Button type="primary" data-testid="save-btn" :loading="saving" @click="save">
        {{ t('crud.save') }}
      </Button>
    </template>
  </Modal>
</template>

<style scoped>
.widget-references-modal__row {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  margin-bottom: 12px;
}
.widget-references-modal__field {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
</style>
