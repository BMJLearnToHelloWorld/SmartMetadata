<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { Modal, Radio } from 'ant-design-vue';
import type { DeleteType } from '@/ingestion/serviceDelete';

const props = withDefaults(
  defineProps<{
    open: boolean;
    entityName: string;
    entityTypeLabel: string;
    allowSoftDelete?: boolean;
    loading?: boolean;
  }>(),
  { allowSoftDelete: true, loading: false },
);
const emit = defineEmits<{
  cancel: [];
  confirm: [deleteType: DeleteType];
}>();

const { t } = useI18n();

/**
 * Official DeleteEntityModal (components/common/DeleteWidget/
 * DeleteEntityModal.tsx, pin a3012259ca): a radio choice between soft
 * delete (default when allowed) and permanent delete, with distinct
 * copy per choice and no type-to-confirm. When soft delete is not
 * allowed — the pin renders the hard-only DeleteModal for an already
 * soft-deleted entity — this modal shows the permanent copy alone,
 * with no radio. The caller owns the delete call and the loading
 * state; while loading, both buttons are disabled and the overlay is
 * non-dismissable. Visuals follow dev_ui (antd modal); only the
 * structure and copy follow the pin.
 */
const selected = ref<DeleteType>(props.allowSoftDelete ? 'soft-delete' : 'hard-delete');

function resetSelection(): void {
  selected.value = props.allowSoftDelete ? 'soft-delete' : 'hard-delete';
}

watch(
  () => props.open,
  (open) => {
    if (open) {
      resetSelection();
    }
  },
);
watch(
  () => props.allowSoftDelete,
  () => {
    resetSelection();
  },
);

/**
 * Title by variant: the radio variant keeps the pin DeleteEntityModal
 * header (`Delete "{name}" {entity type}`); the hard-only variant is
 * the pin DeleteModal header (`Delete {entityTitle}` — no quotes, no
 * entity type), composed from the pin's own label + title.
 */
const modalTitle = computed(() =>
  props.allowSoftDelete
    ? t('crud.deleteEntityTitle', { name: props.entityName, entity: props.entityTypeLabel })
    : t('crud.delete') + ' ' + props.entityName,
);

function handleCancel(): void {
  resetSelection();
  emit('cancel');
}

function handleConfirm(): void {
  emit('confirm', props.allowSoftDelete ? selected.value : 'hard-delete');
}
</script>

<template>
  <Modal
    :open="open"
    :title="modalTitle"
    :ok-text="t('crud.delete')"
    :cancel-text="t('crud.cancel')"
    :confirm-loading="loading"
    :ok-button-props="{ danger: true }"
    :cancel-button-props="{ disabled: loading }"
    :mask-closable="!loading"
    :closable="!loading"
    :keyboard="!loading"
    data-testid="delete-entity-modal"
    @ok="handleConfirm"
    @cancel="handleCancel"
  >
    <template v-if="allowSoftDelete">
      <Radio.Group v-model:value="selected" :disabled="loading" data-testid="delete-type-options">
        <Radio value="soft-delete" data-testid="delete-option-soft">
          <span class="delete-entity-modal__option-title">{{ t('crud.softDelete') }}</span>
          <span class="delete-entity-modal__option-description">
            {{ t('crud.softDeleteMessage', { entity: entityTypeLabel.toLowerCase() }) }}
          </span>
        </Radio>
        <Radio value="hard-delete" data-testid="delete-option-hard">
          <span class="delete-entity-modal__option-title">{{ t('crud.permanentlyDelete') }}</span>
          <span class="delete-entity-modal__option-description">
            {{ t('crud.permanentlyDeleteMessage', { entity: entityTypeLabel.toLowerCase() }) }}
          </span>
        </Radio>
      </Radio.Group>
    </template>
    <p v-else data-testid="delete-entity-hard-only-message">
      {{ t('crud.permanentlyDeleteMessage', { entity: entityName.toLowerCase() }) }}
    </p>
  </Modal>
</template>

<style scoped>
.delete-entity-modal__option-title {
  display: block;
  font-weight: 600;
}

.delete-entity-modal__option-description {
  display: block;
  color: var(--sm-text-secondary);
  white-space: normal;
}
</style>
