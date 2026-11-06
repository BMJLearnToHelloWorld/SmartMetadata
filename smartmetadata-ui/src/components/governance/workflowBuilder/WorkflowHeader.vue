<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { Button, Card, Dropdown, Input, Menu, Modal, Tag, Tooltip, Typography } from 'ant-design-vue';
import { EditOutlined, MoreOutlined } from '@ant-design/icons-vue';
import { useI18n } from 'vue-i18n';
import { useWorkflowBuilderContext } from '@/composables/useWorkflowBuilder';
import WorkflowControls from './WorkflowControls.vue';

/**
 * Official WorkflowHeader (pin a3012259ca), page variant only. The
 * product has no embedded host, so the 'actions' variant is not built.
 * The card shows the workflow icon, title + name subtitle, suspended /
 * system badges, the controls, the Edit button and the manage menu
 * (suspend/resume in view mode; delete is gated off in OSS, so the item
 * is coded but never renders). The edit-title button opens a modal with
 * the (disabled) name and an editable display name, saved via PATCH.
 */
const props = defineProps<{
  title?: string;
  workflowName?: string;
}>();

const { t } = useI18n();
const builder = useWorkflowBuilderContext();
const { mode } = builder;

const isEditModalOpen = ref(false);
const displayNameInput = ref(props.title ?? '');

watch(isEditModalOpen, (isOpen) => {
  if (isOpen) {
    displayNameInput.value = props.title ?? '';
  }
});

const suspendedBadge = computed(() => builder.isSuspended.value);
const systemBadge = computed(() => mode.isNoOp.value);
const editTitleButton = computed(
  () => !mode.isViewMode.value && !mode.isNoOp.value,
);

function handleOpenEditModal(): void {
  isEditModalOpen.value = true;
}

function handleCloseEditModal(): void {
  isEditModalOpen.value = false;
}

function handleSaveDisplayName(): void {
  if (displayNameInput.value.trim()) {
    void builder.handleUpdateDisplayName(displayNameInput.value.trim());
  }
  isEditModalOpen.value = false;
}

function handleToggleSuspend(): void {
  void builder.handleToggleSuspend();
}

const manageMenuItems = computed(() => {
  const items: Array<{ key: string; label: string; danger?: boolean }> = [];
  if (mode.showEditButton.value) {
    items.push({
      key: 'suspend',
      label: suspendedBadge.value
        ? t('workflows.builder.resume')
        : t('workflows.builder.suspend'),
    });
  }
  if (mode.showDeleteButton.value) {
    items.push({
      key: 'delete',
      label: t('crud.delete'),
      danger: true,
    });
  }
  return items;
});

function handleManageMenuClick(key: string): void {
  if (key === 'suspend') {
    handleToggleSuspend();
  } else if (key === 'delete') {
    builder.handleShowDeleteModal();
  }
}
</script>

<template>
  <Card data-testid="workflow-header" :body-style="{ padding: '16px 24px' }">
    <div style="display: flex; align-items: center; justify-content: space-between; gap: 16px">
      <div style="display: flex; align-items: center; gap: 12px; min-width: 0">
        <div style="min-width: 0" data-testid="workflow-title-section">
          <div style="display: flex; align-items: center; gap: 8px">
            <div style="min-width: 0">
              <Typography.Text
                data-testid="workflow-title"
                style="
                  margin: 0 0 4px;
                  font-size: 16px;
                  font-weight: 600;
                  color: var(--sm-text-primary);
                "
                :ellipsis="{ tooltip: true }"
              >
                {{ title }}
              </Typography.Text>
            </div>
            <Button
              v-if="editTitleButton"
              type="text"
              data-testid="edit-workflow-title-button"
              :title="t('workflows.builder.editWorkflowTitle')"
              @click="handleOpenEditModal"
            >
              <EditOutlined />
            </Button>
          </div>
          <Typography.Text
            v-if="workflowName"
            data-testid="workflow-description"
            type="secondary"
            style="margin: 0; font-size: 14px; max-width: 600px"
            :ellipsis="{ tooltip: true }"
          >
            {{ workflowName }}
          </Typography.Text>
        </div>
      </div>

      <div style="display: flex; flex-shrink: 0; gap: 12px; align-items: center">
        <Tag
          v-if="suspendedBadge"
          color="warning"
          data-testid="workflow-suspended-badge"
        >
          {{ t('workflows.builder.suspended') }}
        </Tag>
        <Tooltip
          v-if="systemBadge"
          :title="t('workflows.builder.systemWorkflowEditRestriction')"
        >
          <Tag data-testid="system-workflow-badge">{{ t('workflows.builder.system') }}</Tag>
        </Tooltip>
        <WorkflowControls
          :is-run-loading="builder.isRunLoading.value"
          :on-cancel-workflow="mode.showCancelButton.value ? mode.enterViewMode : undefined"
          :on-revert-and-cancel="mode.showCancelButton.value ? builder.handleRevertAndCancel : undefined"
          :on-run-workflow="builder.handleRunWorkflow"
          :on-save-workflow="
            mode.showSaveButton.value
              ? () => void builder.handleSaveWorkflowWithSnapshot()
              : undefined
          "
          :on-test-workflow="
            mode.showTestButton.value
              ? () => void builder.actions.handleTestWorkflow()
              : undefined
          "
        />
        <Button
          v-if="mode.showEditButton.value"
          type="primary"
          data-testid="edit-workflow-button"
          @click="mode.enterEditMode"
        >
          {{ t('workflows.builder.editWorkflow') }}
        </Button>
        <Dropdown
          v-if="manageMenuItems.length > 0"
          :trigger="['click']"
        >
          <Button
            type="text"
            data-testid="workflow-manage-button"
            :title="t('workflows.builder.moreActions')"
          >
            <MoreOutlined />
          </Button>
          <template #overlay>
            <Menu @click="({ key }) => handleManageMenuClick(String(key))">
              <Menu.Item
                v-for="item in manageMenuItems"
                :key="item.key"
                :data-testid="item.key === 'suspend' ? (suspendedBadge ? 'resume-workflow-button' : 'suspend-workflow-button') : 'delete-workflow-button'"
                :danger="item.danger"
              >
                {{ item.label }}
              </Menu.Item>
            </Menu>
          </template>
        </Dropdown>
      </div>
    </div>
  </Card>

  <Modal
    :open="isEditModalOpen"
    :title="t('workflows.builder.editDisplayName')"
    :width="480"
    @cancel="handleCloseEditModal"
  >
    <div style="margin-bottom: 16px">
      <label style="display: block; margin-bottom: 4px; font-size: 14px">{{ t('workflows.builder.name') }}</label>
      <Input disabled :value="workflowName" />
    </div>
    <div>
      <label style="display: block; margin-bottom: 4px; font-size: 14px">{{ t('workflows.builder.displayName') }}</label>
      <Input
        :value="displayNameInput"
        :placeholder="t('workflows.builder.enterDisplayName')"
        @update:value="(value) => { displayNameInput = value; }"
      />
    </div>
    <template #footer>
      <Button data-testid="cancel-button" @click="handleCloseEditModal">
        {{ t('crud.cancel') }}
      </Button>
      <Button type="primary" data-testid="save-button" @click="handleSaveDisplayName">
        {{ t('crud.save') }}
      </Button>
    </template>
  </Modal>
</template>
