<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import { Button, Dropdown, Menu } from 'ant-design-vue';
import { MoreOutlined } from '@ant-design/icons-vue';

/**
 * Node ⋮ menu, mapped from the official `LineageNodeMenu` (pin a3012259ca)
 * — Edit upstream / Edit downstream / Delete (only when `canDelete`) —
 * and `LineageColumnMenu` — the same two edit items, no delete — which
 * the product serves with the same component via the `columnFqn` prop:
 * a column edit names the column being edited, so there is no node to
 * delete. The trigger carries `nodrag nopan` so Vue Flow never drags
 * the node or pans the canvas from a menu click.
 */
const props = defineProps<{
  /** When set, this is a per-column menu (pin LineageColumnMenu). */
  columnFqn?: string;
  /** Node variant only: the node may be deleted (not the center node). */
  canDelete?: boolean;
}>();

const emit = defineEmits<{
  edit: [direction: 'upstream' | 'downstream'];
  delete: [];
}>();

const { t } = useI18n();

function onMenuClick(payload: { key: string | number }): void {
  if (payload.key === 'delete') {
    emit('delete');
    return;
  }
  emit('edit', payload.key === 'upstream' ? 'upstream' : 'downstream');
}
</script>

<template>
  <Dropdown :trigger="['click']">
    <Button
      type="text"
      size="small"
      class="lineage-node-menu nodrag nopan"
      :data-testid="props.columnFqn ? 'lineage-column-menu' : 'lineage-node-menu'"
      :aria-label="t('lineage.nodeOptions')"
      @click.stop
    >
      <template #icon><MoreOutlined /></template>
    </Button>
    <template #overlay>
      <Menu @click="onMenuClick">
        <Menu.Item key="upstream" data-testid="lineage-menu-edit-upstream">
          {{ t('lineage.editUpstream') }}
        </Menu.Item>
        <Menu.Item key="downstream" data-testid="lineage-menu-edit-downstream">
          {{ t('lineage.editDownstream') }}
        </Menu.Item>
        <Menu.Item
          v-if="!props.columnFqn && props.canDelete"
          key="delete"
          danger
          data-testid="lineage-menu-delete"
        >
          {{ t('label.delete') }}
        </Menu.Item>
      </Menu>
    </template>
  </Dropdown>
</template>

<style scoped>
.lineage-node-menu {
  flex-shrink: 0;
  padding: 0 2px;
  color: var(--sm-text-tertiary);
}
</style>
