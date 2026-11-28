<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
  Official ManageButton dropdown (edit/rename + delete), Vue3 + ant-design-vue.
  No CCL React/CSS copy.
-->
<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { Button, Dropdown, Menu } from 'ant-design-vue';

const props = defineProps<{
  entityLabel: string;
  deleted?: boolean;
  canDelete?: boolean;
  canRename?: boolean;
  renameTestId?: string;
  deleteTestId?: string;
}>();

const emit = defineEmits<{
  rename: [];
  delete: [];
}>();

const { t } = useI18n();

const items = computed(() => {
  const result: Array<{ key: string; label: string; testId: string; danger?: boolean; onClick: () => void }> = [];
  if (props.canRename && !props.deleted) {
    result.push({
      key: 'rename-button',
      label: t('label.rename'),
      testId: props.renameTestId ?? 'manage-rename-button',
      onClick: () => emit('rename'),
    });
  }
  if (props.canDelete && !props.deleted) {
    result.push({
      key: 'delete-button',
      label: t('label.delete'),
      testId: props.deleteTestId ?? 'manage-delete-button',
      danger: true,
      onClick: () => emit('delete'),
    });
  }
  return result;
});
</script>

<template>
  <Dropdown v-if="items.length" :trigger="['click']">
    <Button data-testid="manage-button">
      {{ t('label.manage-entity', { entity: entityLabel }) }}
    </Button>
    <template #overlay>
      <Menu>
        <Menu.Item
          v-for="item in items"
          :key="item.key"
          :danger="item.danger"
          @click="item.onClick"
        >
          <span :data-testid="item.testId">{{ item.label }}</span>
        </Menu.Item>
      </Menu>
    </template>
  </Dropdown>
</template>
