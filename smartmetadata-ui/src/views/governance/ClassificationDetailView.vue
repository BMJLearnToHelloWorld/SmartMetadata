<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import {Button, Checkbox, Descriptions, Form, Input, Select, Switch, Table, message} from 'ant-design-vue';
import SmDrawer from '@/components/shared/SmDrawer.vue';
import { deleteClassification, getClassification, patchClassification, updateClassification } from '@/api/classifications';
import { confirmDelete } from '@/features/crud/confirmDelete';
import { setFieldPatch } from '@/admin/jsonPatch';
import { createTag, listTags } from '@/api/tags';
import EntityDetailShell from '@/features/crud/EntityDetailShell.vue';
import { entityLabel } from '@/features/crud/paging';
import type { EntityBreadcrumb, EntityDetailTab } from '@/features/crud/types';
import type { Classification, ClassificationTag } from '@/types/governance';

const props = defineProps<{ id: string }>();
const { t } = useI18n();
const router = useRouter();
const loading = ref(false);
const errorMessage = ref('');
const classification = ref<Classification | null>(null);
const tags = ref<ClassificationTag[]>([]);
const activeTab = ref('overview');
const editOpen = ref(false);
const createTagOpen = ref(false);
const saving = ref(false);
const creating = ref(false);
const editForm = reactive({
  displayName: '',
  description: '',
  mutuallyExclusive: false,
});
const tagForm = reactive({
  name: '',
  displayName: '',
  description: '',
  parent: undefined as string | undefined,
  mutuallyExclusive: false,
});

const breadcrumbs = computed<EntityBreadcrumb[]>(() => [
  { label: t('governance.classifications.title'), to: { name: 'governance-classifications' } },
  { label: entityLabel(classification.value) || t('governance.classifications.title') },
]);

const tabs = computed<EntityDetailTab[]>(() => [
  { key: 'overview', label: t('crud.overview'), testId: 'classification-tab-overview' },
  { key: 'tags', label: t('governance.classifications.tagsTab'), testId: 'classification-tab-tags' },
]);

const tagColumns = computed(() => [
  { title: t('crud.name'), dataIndex: 'name', key: 'name' },
  { title: t('crud.fqn'), dataIndex: 'fullyQualifiedName', key: 'fullyQualifiedName' },
  { title: t('governance.classifications.usage'), key: 'usageCount', width: 90 },
]);

async function load(): Promise<void> {
  loading.value = true;
  errorMessage.value = '';
  try {
    classification.value = await getClassification(props.id);
    const parent = classification.value.fullyQualifiedName || classification.value.name;
    tags.value = (await listTags({ parent, limit: 100 })).data;
  } catch (error) {
    classification.value = null;
    tags.value = [];
    errorMessage.value = error instanceof Error ? error.message : t('crud.loadFailed');
  } finally {
    loading.value = false;
  }
}

async function onDeleteClassification(): Promise<void> {
  if (!classification.value) {
    return;
  }
  const confirmed = await confirmDelete({
    title: t('crud.deleteTitle'),
    content: t('crud.deleteConfirm', { name: classification.value.displayName || classification.value.name }),
    okText: t('crud.delete'),
    cancelText: t('crud.cancel'),
  });
  if (!confirmed) {
    return;
  }
  try {
    await deleteClassification(classification.value.id);
    message.success(t('crud.deletedName', { name: classification.value.displayName || classification.value.name }));
    await router.push({ name: 'governance-classifications' });
  } catch (error) {
    message.error(error instanceof Error ? error.message : t('crud.deleteFailed'));
  }
}

async function onToggleDisabled(disabled: boolean): Promise<void> {
  if (!classification.value) {
    return;
  }
  const previous = classification.value.disabled === true;
  classification.value = { ...classification.value, disabled };
  try {
    await patchClassification(
      classification.value.id,
      setFieldPatch('/disabled', previous, disabled),
    );
    message.success(t('crud.updated'));
  } catch (error) {
    classification.value = { ...classification.value, disabled: previous };
    message.error(error instanceof Error ? error.message : t('crud.updateFailed'));
  }
}

function openEdit(): void {
  if (!classification.value) {
    return;
  }
  editForm.displayName = classification.value.displayName || '';
  editForm.description = classification.value.description || '';
  editForm.mutuallyExclusive = Boolean(classification.value.mutuallyExclusive);
  editOpen.value = true;
}

async function onSave(): Promise<void> {
  if (!classification.value) {
    return;
  }
  saving.value = true;
  try {
    await updateClassification({
      name: classification.value.name,
      description: editForm.description.trim(),
      displayName: editForm.displayName.trim() || undefined,
      mutuallyExclusive: editForm.mutuallyExclusive,
    });
    editOpen.value = false;
    message.success(t('governance.classifications.updated'));
    await load();
  } catch (error) {
    message.error(error instanceof Error ? error.message : t('crud.updateFailed'));
  } finally {
    saving.value = false;
  }
}

async function onCreateTag(): Promise<void> {
  if (!classification.value) {
    return;
  }
  creating.value = true;
  try {
    const created = await createTag({
      name: tagForm.name.trim(),
      description: tagForm.description.trim(),
      classification: classification.value.fullyQualifiedName || classification.value.name,
      displayName: tagForm.displayName.trim() || undefined,
      parent: tagForm.parent,
      mutuallyExclusive: tagForm.mutuallyExclusive,
    });
    createTagOpen.value = false;
    message.success(t('governance.classifications.tagCreated', { name: created.name }));
    await load();
  } catch (error) {
    message.error(error instanceof Error ? error.message : t('governance.classifications.tagCreateFailed'));
  } finally {
    creating.value = false;
  }
}

watch(
  () => props.id,
  () => {
    void load();
  },
);

onMounted(() => {
  void load();
});
</script>

<template>
  <EntityDetailShell
    :title="entityLabel(classification) || t('governance.classifications.title')"
    :name="classification?.name"
    :fqn="classification?.fullyQualifiedName"
    :lead="t('governance.classifications.lead')"
    :loading="loading"
    :error="errorMessage"
    :empty="!classification && !loading && !errorMessage"
    :breadcrumbs="breadcrumbs"
    :tabs="classification ? tabs : []"
    v-model:active-tab="activeTab"
  >
    <template #actions>
      <Button type="primary" :disabled="!classification" data-testid="edit-classification" @click="openEdit">
        {{ t('crud.edit') }}
      </Button>
      <Button danger :disabled="!classification" data-testid="delete-classification" @click="onDeleteClassification">{{ t('crud.delete') }}</Button>
      <Button :disabled="!classification" data-testid="create-tag" @click="createTagOpen = true">
        {{ t('governance.classifications.createTag') }}
      </Button>
    </template>
    <template #overview>
      <Descriptions v-if="classification" bordered :column="1" size="small">
        <Descriptions.Item :label="t('crud.name')">{{ classification.name }}</Descriptions.Item>
        <Descriptions.Item :label="t('crud.description')">{{ classification.description || '—' }}</Descriptions.Item>
        <Descriptions.Item :label="t('crud.disabled')">
          <Switch
            :checked="classification.disabled === true"
            data-testid="classification-disabled"
            @change="(value: boolean | string | number) => onToggleDisabled(value === true)"
          />
        </Descriptions.Item>
        <Descriptions.Item :label="t('governance.classifications.exclusive')">
          {{ classification.mutuallyExclusive ? t('crud.yes') : t('crud.no') }}
        </Descriptions.Item>
      </Descriptions>
    </template>
    <template #tags>
      <Table
        row-key="id"
        data-testid="classification-tags-table"
        :columns="tagColumns"
        :data-source="tags"
        :pagination="false"
        size="small"
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'name'">
            <a
              href="#"
              @click.prevent="router.push({ name: 'governance-tag', params: { id: (record as ClassificationTag).id } })"
            >
              {{ entityLabel(record as ClassificationTag) }}
            </a>
          </template>
          <template v-else-if="column.key === 'usageCount'">
            {{ (record as ClassificationTag).usageCount ?? '—' }}
          </template>
        </template>
      </Table>
    </template>
  </EntityDetailShell>
  <SmDrawer
    :open="editOpen"
    :title="t('governance.classifications.editTitle')"
    :ok-text="t('crud.edit')"
    :cancel-text="t('crud.cancel')"
    :confirm-loading="saving"
    @ok="onSave"
    @cancel="editOpen = false"
  >
    <Form layout="vertical">
      <Form.Item :label="t('crud.displayName')" :extra="t('crud.displayNameHelp')">
        <Input v-model:value="editForm.displayName" />
      </Form.Item>
      <Form.Item :label="t('crud.description')" required>
        <Input.TextArea v-model:value="editForm.description" :rows="3" />
      </Form.Item>
      <Form.Item>
        <Checkbox v-model:checked="editForm.mutuallyExclusive">
          {{ t('governance.classifications.exclusiveEdit') }}
        </Checkbox>
      </Form.Item>
    </Form>
  </SmDrawer>
  <SmDrawer
    :open="createTagOpen"
    :title="t('governance.classifications.createTagTitle')"
    :ok-text="t('crud.create')"
    :cancel-text="t('crud.cancel')"
    :confirm-loading="creating"
    @ok="onCreateTag"
    @cancel="createTagOpen = false"
  >
    <Form layout="vertical">
      <Form.Item :label="t('crud.name')" required>
        <Input v-model:value="tagForm.name" data-testid="create-tag-name" />
      </Form.Item>
      <Form.Item :label="t('crud.description')" required>
        <Input.TextArea v-model:value="tagForm.description" :rows="3" />
      </Form.Item>
      <Form.Item :label="t('crud.displayName')" :extra="t('crud.displayNameHelp')">
        <Input v-model:value="tagForm.displayName" />
      </Form.Item>
      <Form.Item :label="t('governance.classifications.parentTag')">
        <Select v-model:value="tagForm.parent" allow-clear>
          <Select.Option v-for="tag in tags" :key="tag.id" :value="tag.fullyQualifiedName || tag.name">
            {{ entityLabel(tag) }}
          </Select.Option>
        </Select>
      </Form.Item>
      <Form.Item>
        <Checkbox v-model:checked="tagForm.mutuallyExclusive">
          {{ t('governance.classifications.childExclusive') }}
        </Checkbox>
      </Form.Item>
    </Form>
  </SmDrawer>
</template>
