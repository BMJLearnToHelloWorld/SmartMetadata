<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<!--
  Vue port of pin ManageButton reduced to the persona call site
  (PersonaDetailsPage.tsx:366-381, ManageButton.tsx:165-288,311-329):
  Rename (only when editDisplayNamePermission), the set/remove-default
  extra item (no permission condition), and Delete (only when
  canDelete), in that order. No announcement, restore, or profiler
  items exist for this call site; an empty menu renders no button.
  The menu owns the Rename modal (EntityNameModal: width 520,
  non-dismissable, name field disabled, displayName min 1 / max 128)
  and the permanent-delete modal (DeleteModal: width 400, dismissable
  only while not deleting). The caller passes canDelete already OR-ed
  as `canEditAll || hasDeletePermission`, and passes
  `canEditDescription` as the rename permission, exactly as pin does.
-->
<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { Button, Dropdown, Input, Modal, message } from 'ant-design-vue';
import {
  CheckCircleOutlined,
  CloseCircleOutlined,
  DeleteOutlined,
  DownOutlined,
  EditOutlined,
} from '@ant-design/icons-vue';
import { deletePersona } from '@/api/persona';
import type { Persona } from '@/types/persona';

const RENAME_MODAL_WIDTH = 520;
const DELETE_MODAL_WIDTH = 400;
const ENTITY_NAME_MAX_LENGTH = 128;

const props = defineProps<{
  persona: Persona;
  canEditDescription: boolean;
  canDelete: boolean;
  onEditDisplayName: (data: { name: string; displayName: string }) => Promise<unknown>;
  onDefaultActionClick: () => void;
  afterDeleteAction: () => Promise<void> | void;
}>();

const { t } = useI18n();

const menuOpen = ref(false);
const isRenameOpen = ref(false);
const isRenaming = ref(false);
const renameName = ref('');
const renameDisplayName = ref('');
const renameDirty = ref(false);
const renameSubmitAttempted = ref(false);
const isDelete = ref(false);
const isDeleting = ref(false);

const entityTitle = computed(() => props.persona.displayName ?? props.persona.name);

interface MenuItemDef {
  key: string;
  id: string;
  name: string;
  description: string;
  icon: 'edit' | 'check' | 'close' | 'delete';
  visible: boolean;
  onClick: () => void;
}

const menuItems = computed<MenuItemDef[]>(() => {
  const isDefault = props.persona.default === true;
  const items: MenuItemDef[] = [
    {
      key: 'rename-button',
      id: 'rename-button',
      name: t('label.rename'),
      description: t('message.update-displayName-entity', { entity: props.persona.name }),
      icon: 'edit',
      visible: props.canEditDescription,
      onClick: () => {
        isRenameOpen.value = true;
      },
    },
    {
      key: isDefault ? 'remove-default' : 'set-as-default',
      id: isDefault ? 'remove-default-button' : 'set-as-default-button',
      name: isDefault ? t('label.remove-default') : t('label.set-as-default'),
      description: isDefault
        ? t('message.remove-default-persona-description')
        : t('message.set-default-persona-menu-description'),
      icon: isDefault ? 'close' : 'check',
      visible: true,
      onClick: () => {
        props.onDefaultActionClick();
      },
    },
    {
      key: 'delete-button',
      id: 'delete-button',
      name: t('label.delete'),
      description: t('message.delete-entity-type-action-description', { entityType: 'persona' }),
      icon: 'delete',
      visible: props.canDelete,
      onClick: () => {
        isDelete.value = true;
      },
    },
  ];
  return items.filter((item) => item.visible);
});

function handleMenuItemClick(item: MenuItemDef): void {
  menuOpen.value = false;
  item.onClick();
}

watch(isRenameOpen, (open) => {
  if (open) {
    renameName.value = props.persona.name;
    renameDisplayName.value = props.persona.displayName ?? '';
    renameDirty.value = false;
    renameSubmitAttempted.value = false;
  }
});

function displayNameError(value: string): string | null {
  if (value.length < 1 || value.length > ENTITY_NAME_MAX_LENGTH) {
    return t('message.entity-size-in-between', {
      entity: t('label.display-name'),
      min: 1,
      max: ENTITY_NAME_MAX_LENGTH,
    });
  }
  return null;
}

const visibleRenameError = computed(() =>
  renameDirty.value || renameSubmitAttempted.value
    ? displayNameError(renameDisplayName.value)
    : null,
);

async function handleRenameSave(): Promise<void> {
  renameSubmitAttempted.value = true;
  if (displayNameError(renameDisplayName.value) !== null) {
    return;
  }
  isRenaming.value = true;
  try {
    await props.onEditDisplayName({
      name: renameName.value,
      displayName: renameDisplayName.value,
    });
  } catch (error) {
    message.error(error instanceof Error ? error.message : String(error));
  } finally {
    isRenaming.value = false;
    isRenameOpen.value = false;
  }
}

async function handleHardDelete(): Promise<void> {
  isDeleting.value = true;
  try {
    await deletePersona(props.persona.id);
    message.success(
      t('server.entity-deleted-successfully', { entity: entityTitle.value }),
    );
    await props.afterDeleteAction();
  } catch {
    message.error(t('server.delete-entity-error', { entity: entityTitle.value }));
  } finally {
    isDelete.value = false;
    isDeleting.value = false;
  }
}
</script>

<template>
  <div>
    <Dropdown
      v-if="menuItems.length > 0"
      :open="menuOpen"
      trigger="click"
      @open-change="(open) => { menuOpen = open; }"
    >
      <Button>
        {{ t('label.manage-entity', { entity: t('label.persona') }) }}
        <DownOutlined />
      </Button>
      <template #overlay>
        <div
          style="
            min-width: 280px;
            padding: 4px;
            background: var(--sm-surface, #fff);
            border: 1px solid var(--sm-border, #e5e5e5);
            border-radius: 8px;
            box-shadow: var(--sm-widget-shadow, 0 4px 16px rgba(0, 0, 0, 0.12));
          "
        >
          <div
            v-for="item in menuItems"
            :key="item.key"
            :data-testid="item.id"
            style="display: flex; gap: 8px; padding: 8px; cursor: pointer; border-radius: 6px"
            @click="handleMenuItemClick(item)"
          >
            <EditOutlined v-if="item.icon === 'edit'" style="margin-top: 2px" />
            <CheckCircleOutlined v-if="item.icon === 'check'" style="margin-top: 2px" />
            <CloseCircleOutlined v-if="item.icon === 'close'" style="margin-top: 2px" />
            <DeleteOutlined v-if="item.icon === 'delete'" style="margin-top: 2px" />
            <span style="min-width: 0">
              <span style="display: block; font-weight: 600">{{ item.name }}</span>
              <span style="display: block; color: var(--sm-text-secondary); font-size: 12px">
                {{ item.description }}
              </span>
            </span>
          </div>
        </div>
      </template>
    </Dropdown>

    <Modal
      :open="isRenameOpen"
      :width="RENAME_MODAL_WIDTH"
      :mask-closable="false"
      :closable="false"
      :keyboard="false"
      :footer="null"
      :title="null"
    >
      <div data-testid="entity-name-modal">
        <h3 data-testid="header" style="font-weight: 600; margin-bottom: 16px">
          {{ t('label.edit-entity', { entity: t('label.display-name') }) }}
        </h3>
        <div style="display: flex; flex-direction: column; gap: 16px">
          <div>
            <label for="persona-rename-name" style="display: block; margin-bottom: 4px">
              {{ t('label.name') }}
            </label>
            <Input
              id="persona-rename-name"
              :value="renameName"
              data-testid="name"
              disabled
              :placeholder="
                t('label.enter-entity-name', { entity: t('label.glossary') })
              "
            />
          </div>
          <div>
            <label for="persona-rename-display-name" style="display: block; margin-bottom: 4px">
              {{ t('label.display-name') }}
            </label>
            <Input
              id="persona-rename-display-name"
              :value="renameDisplayName"
              data-testid="displayName"
              :placeholder="t('message.enter-display-name')"
              :status="visibleRenameError ? 'error' : undefined"
              @update:value="(value) => { renameDisplayName = value; renameDirty = true; }"
            />
            <div
              v-if="visibleRenameError"
              style="margin-top: 4px; color: var(--sm-color-error-text)"
            >
              {{ visibleRenameError }}
            </div>
          </div>
        </div>
        <div style="display: flex; justify-content: flex-end; gap: 8px; margin-top: 20px">
          <Button @click="isRenameOpen = false">{{ t('label.cancel') }}</Button>
          <Button
            type="primary"
            data-testid="save-button"
            :loading="isRenaming"
            @click="void handleRenameSave()"
          >
            {{ t('label.save') }}
          </Button>
        </div>
      </div>
    </Modal>

    <Modal
      :open="isDelete"
      :width="DELETE_MODAL_WIDTH"
      :mask-closable="!isDeleting"
      :closable="!isDeleting"
      :keyboard="!isDeleting"
      :footer="null"
      :title="null"
    >
      <div data-testid="delete-modal">
        <div style="display: flex; justify-content: center; margin-bottom: 16px">
          <span
            style="
              display: flex;
              align-items: center;
              justify-content: center;
              width: 48px;
              height: 48px;
              border-radius: 50%;
              background: var(--sm-color-error-bg, #fdecea);
              color: var(--sm-color-error-text, #c62828);
            "
          >
            <DeleteOutlined style="font-size: 24px" />
          </span>
        </div>
        <div data-testid="modal-header" style="display: flex; flex-direction: column; gap: 2px">
          <span
            style="
              font-weight: 600;
              overflow: hidden;
              text-overflow: ellipsis;
              white-space: nowrap;
            "
          >
            {{ t('label.delete') }} {{ entityTitle }}
          </span>
          <p style="color: var(--sm-text-secondary); overflow-wrap: break-word">
            {{
              t('message.permanently-delete-common-message', {
                entity: (entityTitle ?? '').toLowerCase(),
              })
            }}
          </p>
        </div>
        <div data-testid="modal-footer" style="display: flex; gap: 12px; margin-top: 24px">
          <Button block data-testid="cancel-button" :disabled="isDeleting" @click="isDelete = false">
            {{ t('label.cancel') }}
          </Button>
          <Button
            block
            danger
            type="primary"
            data-testid="confirm-button"
            :disabled="isDeleting"
            :loading="isDeleting"
            @click="void handleHardDelete()"
          >
            {{ t('label.delete') }}
          </Button>
        </div>
      </div>
    </Modal>
  </div>
</template>
