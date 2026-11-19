<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<!--
  Vue port of pin AddEditPersonaForm (AddEditPersona.component.tsx):
  create-only modal, width 750, non-dismissable, OK `label.create`.
  Fields in order: name, displayName, description (rich text, initial
  empty, sent as-is), users. Validation runs on change: name required
  + max 128 + ENTITY_NAME_REGEX, displayName max 128 only. Submit
  sends trimmed name, trimmed-or-undefined displayName, the raw
  description, and always an array of user ids (empty when none
  selected), then refreshes the current user (fields: personas) and
  calls onSave. No success toast; failures toast and keep the modal
  open. There is no FormModal 750/non-dismissable variant in the
  shared table (forbidden file), so antd Modal is used directly with
  a named width constant; see the convergence request in the batch
  report.
-->
<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { Button, Input, Modal, message } from 'ant-design-vue';
import { PlusOutlined } from '@ant-design/icons-vue';
import { createPersona } from '@/api/persona';
import SmRichTextEditor from '@/components/shared/SmRichTextEditor.vue';
import { useAuthStore } from '@/stores/auth';
import type { EntityRef } from '@/types/api';
import { ENTITY_NAME_REGEX } from '@/utils/entityName';
import { fetchCurrentUserAfterPersonaCreate } from './currentUserRefresh';
import UserSelectableList from './UserSelectableList.vue';
import UserTag from './UserTag.vue';

const CREATE_MODAL_WIDTH = 750;
const ENTITY_NAME_MAX_LENGTH = 128;

const props = defineProps<{
  open: boolean;
  onSave: () => void;
  onCancel: () => void;
}>();

const { t } = useI18n();
const authStore = useAuthStore();

const name = ref('');
const displayName = ref('');
const description = ref('');
const selectedUsers = ref<EntityRef[]>([]);
const isSaving = ref(false);
const submitAttempted = ref(false);
const dirty = reactive({ name: false, displayName: false });

function getEntityName(entity?: { name?: string; displayName?: string }): string {
  return entity?.displayName || entity?.name || '';
}

function sizeMessage(entityKey: string): string {
  return t('message.entity-size-in-between', {
    entity: t(entityKey),
    min: 1,
    max: ENTITY_NAME_MAX_LENGTH,
  });
}

function nameError(value: string): string | null {
  if (value.length === 0) {
    return t('label.field-required', { field: t('label.name') });
  }
  if (value.length > ENTITY_NAME_MAX_LENGTH) {
    return sizeMessage('label.name');
  }
  if (!ENTITY_NAME_REGEX.test(value)) {
    return t('message.entity-name-validation');
  }
  return null;
}

function displayNameError(value: string): string | null {
  if (value.length > ENTITY_NAME_MAX_LENGTH) {
    return sizeMessage('label.display-name');
  }
  return null;
}

const visibleNameError = computed(() =>
  dirty.name || submitAttempted.value ? nameError(name.value) : null,
);
const visibleDisplayNameError = computed(() =>
  dirty.displayName || submitAttempted.value
    ? displayNameError(displayName.value)
    : null,
);

function resetForm(): void {
  name.value = '';
  displayName.value = '';
  description.value = '';
  selectedUsers.value = [];
  isSaving.value = false;
  submitAttempted.value = false;
  dirty.name = false;
  dirty.displayName = false;
}

watch(
  () => props.open,
  (open) => {
    if (open) {
      resetForm();
    }
  },
);

function handleUsersUpdate(users: EntityRef[] | EntityRef): Promise<void> {
  selectedUsers.value = Array.isArray(users) ? users : [users];
  return Promise.resolve();
}

async function handleSubmit(): Promise<void> {
  submitAttempted.value = true;
  if (nameError(name.value) !== null || displayNameError(displayName.value) !== null) {
    return;
  }
  isSaving.value = true;
  try {
    await createPersona({
      name: name.value.trim(),
      displayName: displayName.value.trim() || undefined,
      description: description.value,
      users: selectedUsers.value.map((user) => user.id ?? ''),
    });
    await fetchCurrentUserAfterPersonaCreate(authStore);
    props.onSave();
  } catch (error) {
    message.error(error instanceof Error ? error.message : String(error));
  } finally {
    isSaving.value = false;
  }
}

function handleCancel(): void {
  props.onCancel();
}
</script>

<template>
  <Modal
    :open="open"
    :width="CREATE_MODAL_WIDTH"
    :mask-closable="false"
    :closable="false"
    :keyboard="false"
    :confirm-loading="isSaving"
    :ok-text="t('label.create')"
    :cancel-text="t('label.cancel')"
    :title="t('label.add-entity', { entity: t('label.persona') })"
    @ok="void handleSubmit()"
    @cancel="handleCancel"
  >
    <div data-testid="add-edit-persona-modal">
      <div style="display: flex; flex-direction: column; gap: 16px">
        <div>
          <label for="persona-create-name" style="display: block; margin-bottom: 4px">
            {{ t('label.name') }} *
          </label>
          <Input
            id="persona-create-name"
            :value="name"
            data-testid="name"
            autocomplete="off"
            :placeholder="t('label.name')"
            :status="visibleNameError ? 'error' : undefined"
            @update:value="(value) => { name = value; dirty.name = true; }"
          />
          <div v-if="visibleNameError" style="margin-top: 4px; color: var(--sm-color-error-text)">
            {{ visibleNameError }}
          </div>
        </div>
        <div>
          <label for="persona-create-display-name" style="display: block; margin-bottom: 4px">
            {{ t('label.display-name') }}
          </label>
          <Input
            id="persona-create-display-name"
            :value="displayName"
            data-testid="displayName"
            autocomplete="off"
            :placeholder="t('label.display-name')"
            :status="visibleDisplayNameError ? 'error' : undefined"
            @update:value="(value) => { displayName = value; dirty.displayName = true; }"
          />
          <div
            v-if="visibleDisplayNameError"
            style="margin-top: 4px; color: var(--sm-color-error-text)"
          >
            {{ visibleDisplayNameError }}
          </div>
        </div>
        <div>
          <label style="display: block; margin-bottom: 4px">{{ t('label.description') }}</label>
          <div data-testid="description">
            <SmRichTextEditor
              :key="open ? 'open' : 'closed'"
              initial-value=""
              @text-change="(value) => { description = value; }"
            />
          </div>
        </div>
        <div>
          <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 4px">
            <span>{{ t('label.user-plural') }}</span>
            <UserSelectableList
              :has-permission="true"
              :multi-select="true"
              :selected-users="selectedUsers"
              :on-update="handleUsersUpdate"
            >
              <Button
                type="primary"
                size="small"
                data-testid="add-users"
                :aria-label="t('label.add-entity', { entity: t('label.user-plural') })"
              >
                <PlusOutlined />
              </Button>
            </UserSelectableList>
          </div>
          <div
            v-if="selectedUsers.length > 0"
            data-testid="users-container"
            style="display: flex; flex-wrap: wrap; gap: 8px; align-items: center"
          >
            <UserTag
              v-for="user in selectedUsers"
              :key="user.id"
              :id="user.name ?? user.id"
              :name="getEntityName(user)"
            />
          </div>
        </div>
      </div>
    </div>
  </Modal>
</template>
