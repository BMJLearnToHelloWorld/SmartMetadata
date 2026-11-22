<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { Button, Modal, Space, Typography } from 'ant-design-vue';

/**
 * Delete confirmation for lineage nodes and edges, mapped from the
 * official `LineageNodeDeleteModal` (pin a3012259ca) — title
 * `label.delete-entity {entity}`, body `message.remove-lineage-node`
 * ("Remove {entity} from lineage? All its lineage edges visible here
 * will be deleted."), Cancel/Delete buttons,
 * `data-testid="delete-node-confirmation-modal"`.
 *
 * Pin has no separate edge modal (the edge delete goes through the
 * provider's delete modal with the edge's text); the product reuses this
 * one component for both, with the edge kinds naming the edge endpoints
 * instead of a node.
 */
const props = defineProps<{
  open: boolean;
  deleting?: boolean;
  /** Node delete, entity-edge delete, or single column-mapping delete. */
  kind?: 'node' | 'edge' | 'column';
  /** Node display name (node kind). */
  name?: string;
  /** Edge endpoints (edge/column kinds). */
  from?: string;
  to?: string;
}>();

const emit = defineEmits<{
  cancel: [];
  confirm: [];
}>();

const { t } = useI18n();

const title = computed(() => {
  if (props.kind === 'edge') {
    return t('lineage.deleteEdgeTitle');
  }
  if (props.kind === 'column') {
    return t('lineage.deleteColumnEdgeTitle');
  }
  return t('lineage.deleteNodeTitle', { name: props.name ?? '' });
});

const message = computed(() => {
  if (props.kind === 'edge') {
    return t('lineage.deleteEdgeMessage', { from: props.from ?? '', to: props.to ?? '' });
  }
  if (props.kind === 'column') {
    return t('lineage.deleteColumnEdgeMessage', { from: props.from ?? '', to: props.to ?? '' });
  }
  return t('lineage.deleteNodeMessage', { name: props.name ?? '' });
});
</script>

<template>
  <Modal
    :open="open"
    :title="title"
    :confirm-loading="deleting"
    :closable="!deleting"
    :mask-closable="!deleting"
    :keyboard="!deleting"
    @cancel="emit('cancel')"
  >
    <Typography.Paragraph type="secondary">{{ message }}</Typography.Paragraph>
    <template #footer>
      <Space>
        <Button data-testid="delete-node-cancel" :disabled="deleting" @click="emit('cancel')">
          {{ t('label.cancel') }}
        </Button>
        <Button
          type="primary"
          danger
          data-testid="delete-node-confirm"
          :loading="deleting"
          @click="emit('confirm')"
        >
          {{ t('label.delete') }}
        </Button>
      </Space>
    </template>
  </Modal>
</template>
