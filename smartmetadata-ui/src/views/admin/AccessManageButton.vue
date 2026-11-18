<!--
  Copyright 2026 SmartMetadata authors.

  Licensed under the Apache License, Version 2.0 (the "License");
  you may not use this file except in compliance with the License.
  You may obtain a copy of the License at

      http://www.apache.org/licenses/LICENSE-2.0
-->
<!--
  Port of the Roles/Policies subset of
  components/common/EntityPageInfos/ManageButton/ManageButton.tsx (03 §4.4):
  a dropdown with only the rename and delete items. Restore, announcement
  and profiler items never appear: neither pin detail page passes the props
  that render them. Rename renders only when editDisplayNamePermission,
  onEditDisplayName and !deleted; delete only when canDelete; with no items
  the menu does not render at all. Delete is the pin hard-delete path
  (allowSoftDelete={false}): permanently-delete wording, the wire owned by
  the caller's onDelete, afterDeleteAction on success.
-->
<script setup lang="ts">
import { MoreOutlined } from '@ant-design/icons-vue';
import { Button, Dropdown, Form, Input, Modal, Space, Typography, message } from 'ant-design-vue';
import type { FormInstance } from 'ant-design-vue';
import { computed, reactive, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { confirmDelete } from '@/features/crud/confirmDelete';
import { getErrorText } from './accessApiErrors';

const props = defineProps<{
  name: string;
  displayName?: string;
  entityTypeLabel: string;
  deleted?: boolean;
  canDelete: boolean;
  editDisplayNamePermission: boolean;
  onEditDisplayName?: (data: { name: string; displayName: string }) => Promise<unknown> | unknown;
  onDelete: () => Promise<boolean>;
  afterDeleteAction: () => void;
}>();

const { t } = useI18n();

const entityTitle = computed(() => props.displayName ?? props.name);
const canRename = computed(
  () => props.editDisplayNamePermission && Boolean(props.onEditDisplayName) && !props.deleted,
);
const hasItems = computed(() => canRename.value || props.canDelete);

const menuOpen = ref(false);
const renameOpen = ref(false);
const renameSaving = ref(false);
const renameFormRef = ref<FormInstance | null>(null);
const renameForm = reactive({ name: '', displayName: '' });

// DISPLAY_NAME_FIELD_RULES (pin Form.constants): empty is allowed; a
// non-empty display name must be 1-128 characters.
const displayNameRules = computed(() => [
  {
    validator: (_rule: unknown, value: string) => {
      if (!value || (value.length >= 1 && value.length <= 128)) {
        return Promise.resolve();
      }
      return Promise.reject(
        t('message.entity-size-in-between', {
          entity: t('label.display-name'),
          min: 1,
          max: 128,
        }),
      );
    },
  },
]);

function openRename(): void {
  menuOpen.value = false;
  renameForm.name = props.name;
  renameForm.displayName = props.displayName ?? '';
  renameOpen.value = true;
}

async function saveRename(): Promise<void> {
  try {
    await renameFormRef.value?.validate();
  } catch {
    return;
  }
  renameSaving.value = true;
  try {
    await props.onEditDisplayName?.({ name: renameForm.name, displayName: renameForm.displayName });
  } catch (error) {
    message.error(getErrorText(error, t('crud.loadFailed')));
  } finally {
    renameSaving.value = false;
    renameOpen.value = false;
  }
}

async function requestDelete(): Promise<void> {
  menuOpen.value = false;
  await confirmDelete({
    title: `${t('label.delete')} ${entityTitle.value}`,
    content: t('message.permanently-delete-common-message', {
      entity: entityTitle.value.toLowerCase(),
    }),
    okText: t('label.delete'),
    cancelText: t('label.cancel'),
    onOk: async () => {
      const ok = await props.onDelete();
      if (ok) {
        props.afterDeleteAction();
      }
    },
  });
}
</script>

<template>
  <div v-if="hasItems">
    <Dropdown v-model:open="menuOpen" trigger="click">
      <Button data-testid="manage-button" @click.prevent>
        <template #icon><MoreOutlined /></template>
      </Button>
      <template #overlay>
        <div class="access-manage-menu">
          <button
            v-if="canRename"
            type="button"
            data-testid="rename-button"
            class="access-manage-menu__item"
            @click="openRename"
          >
            <Typography.Text strong>{{ t('label.rename') }}</Typography.Text>
            <Typography.Text type="secondary">
              {{ t('message.update-displayName-entity', { entity: entityTypeLabel }) }}
            </Typography.Text>
          </button>
          <button
            v-if="canDelete"
            type="button"
            data-testid="delete-button"
            class="access-manage-menu__item access-manage-menu__item--danger"
            @click="requestDelete"
          >
            <Typography.Text strong type="danger">{{ t('label.delete') }}</Typography.Text>
            <Typography.Text type="secondary">
              {{ t('message.delete-entity-type-action-description', { entityType: entityTypeLabel }) }}
            </Typography.Text>
          </button>
        </div>
      </template>
    </Dropdown>
    <Modal
      :open="renameOpen"
      :width="520"
      :closable="false"
      :mask-closable="false"
      :keyboard="false"
      :title="t('label.edit-entity', { entity: t('label.display-name') })"
      @cancel="renameOpen = false"
    >
      <Form ref="renameFormRef" layout="vertical" :model="renameForm">
        <Form.Item :label="t('label.name')">
          <Input v-model:value="renameForm.name" data-testid="name" disabled />
        </Form.Item>
        <Form.Item
          :label="t('label.display-name')"
          name="displayName"
          :rules="displayNameRules"
        >
          <Input
            v-model:value="renameForm.displayName"
            data-testid="displayName"
            :placeholder="t('message.enter-display-name')"
          />
        </Form.Item>
      </Form>
      <template #footer>
        <Space>
          <Button @click="renameOpen = false">{{ t('label.cancel') }}</Button>
          <Button type="primary" data-testid="save-button" :loading="renameSaving" @click="saveRename">
            {{ t('label.save') }}
          </Button>
        </Space>
      </template>
    </Modal>
  </div>
</template>

<style scoped>
.access-manage-menu {
  display: flex;
  flex-direction: column;
  min-width: 240px;
  padding: 4px;
  background: var(--sm-bg-container);
  border: 1px solid var(--sm-border-color);
  border-radius: 8px;
  box-shadow: 0 6px 16px rgb(0 0 0 / 8%);
}

.access-manage-menu__item {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
  padding: 8px 12px;
  text-align: left;
  cursor: pointer;
  background: transparent;
  border: 0;
  border-radius: 6px;
}

.access-manage-menu__item:hover {
  background: rgb(0 0 0 / 4%);
}
</style>
