<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { Button, Dropdown, Empty, Menu, Space, Tooltip, Typography, message } from 'ant-design-vue';
import PageHeader from '@/components/shared/PageHeader.vue';
import FormModal from '@/components/shared/FormModal.vue';
import {
  createIntakeForm,
  createOrUpdateIntakeForm,
  deleteIntakeForm,
  listIntakeForms,
  patchIntakeForm,
  type CreateIntakeForm,
  type IntakeForm,
  type TargetEntityType,
} from '@/api/intakeForms';
import { ENTITY_TYPE_LABEL_KEYS } from '@/views/admin/intakeFormDesigner';
import IntakeFormsTable from './IntakeFormsTable.vue';
import IntakeFormDesignerModal from './IntakeFormDesignerModal.vue';

const { t } = useI18n();

/**
 * Official page shape (pages/IntakeForms): one form per entity type, an
 * add menu that disables already-configured types, a table of entity
 * type / fields / enabled / actions, an enabled toggle that PATCHes only
 * /enabled, a delete confirm, and a designer that edits the native and
 * custom-property field rows.
 */
const ENTITY_TYPES: TargetEntityType[] = [
  'dataProduct',
  'domain',
  'glossary',
  'glossaryTerm',
  'metric',
];

const forms = ref<IntakeForm[]>([]);
const loading = ref(false);
const errorMessage = ref('');
const saving = ref(false);
const deleting = ref(false);

const modalState = ref<{
  open: boolean;
  entityType: TargetEntityType;
  initialValue: IntakeForm | null;
}>({ open: false, entityType: 'dataProduct', initialValue: null });
const deleteTarget = ref<IntakeForm | null>(null);

const existingEntityTypes = computed(() => new Set(forms.value.map((form) => form.entityType)));
const allEntityTypesCovered = computed(
  () => existingEntityTypes.value.size === ENTITY_TYPES.length,
);

async function fetchForms(): Promise<void> {
  loading.value = true;
  errorMessage.value = '';
  try {
    const page = await listIntakeForms({ fields: 'owners,formFields,requiredFields' });
    forms.value = page.data;
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : t('crud.loadFailed');
  } finally {
    loading.value = false;
  }
}

function handleCreate(entityType: TargetEntityType): void {
  modalState.value = { open: true, entityType, initialValue: null };
}

function handleEdit(form: IntakeForm): void {
  modalState.value = { open: true, entityType: form.entityType, initialValue: form };
}

function closeModal(): void {
  modalState.value = { open: false, entityType: 'dataProduct', initialValue: null };
}

async function handleSubmit(payload: CreateIntakeForm): Promise<void> {
  saving.value = true;
  try {
    if (modalState.value.initialValue) {
      await createOrUpdateIntakeForm(payload);
      message.success(t('intakeForms.updated'));
    } else {
      await createIntakeForm(payload);
      message.success(t('intakeForms.created'));
    }
    closeModal();
    await fetchForms();
  } catch (error) {
    message.error(error instanceof Error ? error.message : t('crud.loadFailed'));
  } finally {
    saving.value = false;
  }
}

async function handleToggleEnabled(form: IntakeForm, enabled: boolean): Promise<void> {
  try {
    await patchIntakeForm(form.id, [{ op: 'replace', path: '/enabled', value: enabled }]);
    message.success(t('intakeForms.updated'));
    await fetchForms();
  } catch (error) {
    message.error(error instanceof Error ? error.message : t('crud.loadFailed'));
  }
}

async function handleDeleteConfirm(): Promise<void> {
  const form = deleteTarget.value;
  if (!form) {
    return;
  }
  deleting.value = true;
  try {
    await deleteIntakeForm(form.id);
    message.success(t('intakeForms.deleted'));
    deleteTarget.value = null;
    await fetchForms();
  } catch (error) {
    message.error(error instanceof Error ? error.message : t('crud.loadFailed'));
  } finally {
    deleting.value = false;
  }
}

onMounted(() => {
  void fetchForms();
});
</script>

<template>
  <div data-testid="intake-forms">
    <PageHeader :header="t('intakeForms.title')" :sub-header="t('intakeForms.lead')" />
    <Typography.Text v-if="errorMessage" type="danger" data-testid="intake-forms-error">
      {{ errorMessage }}
    </Typography.Text>
    <Space style="width: 100%; justify-content: flex-end; margin-bottom: 16px">
      <Tooltip v-if="allEntityTypesCovered" :title="t('intakeForms.allTypesCovered')">
        <Button type="primary" disabled data-testid="add-intake-form">
          {{ t('intakeForms.add') }}
        </Button>
      </Tooltip>
      <Dropdown v-else>
        <Button type="primary" data-testid="add-intake-form">
          {{ t('intakeForms.add') }}
        </Button>
        <template #overlay>
          <Menu>
            <Menu.Item
              v-for="entityType in ENTITY_TYPES"
              :key="entityType"
              :disabled="existingEntityTypes.has(entityType)"
              :data-testid="`add-${entityType}`"
              @click="handleCreate(entityType)"
            >
              {{
                existingEntityTypes.has(entityType)
                  ? `${t(ENTITY_TYPE_LABEL_KEYS[entityType])} (${t('intakeForms.alreadyConfigured')})`
                  : t(ENTITY_TYPE_LABEL_KEYS[entityType])
              }}
            </Menu.Item>
          </Menu>
        </template>
      </Dropdown>
    </Space>
    <Empty
      v-if="!loading && forms.length === 0 && !errorMessage"
      data-testid="intake-forms-empty"
    >
      <template #description>
        <Typography.Title :level="5">{{ t('intakeForms.emptyTitle') }}</Typography.Title>
        <Typography.Paragraph type="secondary">{{ t('intakeForms.emptyDescription') }}</Typography.Paragraph>
      </template>
    </Empty>
    <IntakeFormsTable
      v-else
      :forms="forms"
      :loading="loading"
      @edit="handleEdit"
      @delete="(form: IntakeForm) => { deleteTarget = form; }"
      @toggle-enabled="handleToggleEnabled"
    />
    <FormModal
      :get-container="false"
      :open="deleteTarget !== null"
      :title="t('intakeForms.deleteTitle', { entity: deleteTarget ? t(ENTITY_TYPE_LABEL_KEYS[deleteTarget.entityType]) : '' })"
      :ok-text="t('crud.delete')"
      :cancel-text="t('crud.cancel')"
      :confirm-loading="deleting"
      @ok="handleDeleteConfirm"
      @cancel="deleteTarget = null"
    >
      <Typography.Paragraph>{{ t('intakeForms.deleteConfirm') }}</Typography.Paragraph>
    </FormModal>
    <IntakeFormDesignerModal
      :open="modalState.open"
      :entity-type="modalState.entityType"
      :initial-value="modalState.initialValue"
      :confirm-loading="saving"
      @cancel="closeModal"
      @submit="handleSubmit"
    />
  </div>
</template>
