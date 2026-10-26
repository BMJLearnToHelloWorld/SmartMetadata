<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { Button, Checkbox, Descriptions, Form, Input, Modal, Select, Table, message } from 'ant-design-vue';
import { getGlossary, updateGlossary } from '@/api/glossaries';
import { createGlossaryTerm, listGlossaryTerms } from '@/api/glossaryTerms';
import EntityDetailShell from '@/features/crud/EntityDetailShell.vue';
import { entityLabel, joinRefNames } from '@/features/crud/paging';
import type { EntityBreadcrumb, EntityDetailTab } from '@/features/crud/types';
import type { Glossary, GlossaryTerm } from '@/types/governance';

const props = defineProps<{ id: string }>();
const { t } = useI18n();
const router = useRouter();
const loading = ref(false);
const errorMessage = ref('');
const glossary = ref<Glossary | null>(null);
const terms = ref<GlossaryTerm[]>([]);
const activeTab = ref('overview');
const editOpen = ref(false);
const createTermOpen = ref(false);
const saving = ref(false);
const creating = ref(false);
const editForm = reactive({
  displayName: '',
  description: '',
  mutuallyExclusive: false,
});
const termForm = reactive({
  name: '',
  displayName: '',
  description: '',
  parent: undefined as string | undefined,
  mutuallyExclusive: false,
});

const breadcrumbs = computed<EntityBreadcrumb[]>(() => [
  { label: t('governance.glossaries.title'), to: { name: 'governance-glossaries' } },
  { label: entityLabel(glossary.value) || t('governance.glossaries.title') },
]);

const tabs = computed<EntityDetailTab[]>(() => [
  { key: 'overview', label: t('crud.overview'), testId: 'glossary-tab-overview' },
  { key: 'terms', label: t('governance.glossaries.termsTab'), testId: 'glossary-tab-terms' },
]);

const termColumns = computed(() => [
  { title: t('crud.name'), dataIndex: 'name', key: 'name' },
  { title: t('crud.fqn'), dataIndex: 'fullyQualifiedName', key: 'fullyQualifiedName' },
  { title: t('governance.glossaries.parent'), key: 'parent' },
  { title: t('governance.glossaries.related'), key: 'relatedTerms' },
]);

async function load(): Promise<void> {
  loading.value = true;
  errorMessage.value = '';
  try {
    glossary.value = await getGlossary(props.id);
    const page = await listGlossaryTerms({ glossary: props.id, limit: 100 });
    terms.value = page.data;
  } catch (error) {
    glossary.value = null;
    terms.value = [];
    errorMessage.value = error instanceof Error ? error.message : t('crud.loadFailed');
  } finally {
    loading.value = false;
  }
}

function openEdit(): void {
  if (!glossary.value) {
    return;
  }
  editForm.displayName = glossary.value.displayName || '';
  editForm.description = glossary.value.description || '';
  editForm.mutuallyExclusive = Boolean(glossary.value.mutuallyExclusive);
  editOpen.value = true;
}

async function onSave(): Promise<void> {
  if (!glossary.value) {
    return;
  }
  saving.value = true;
  try {
    await updateGlossary({
      name: glossary.value.name,
      description: editForm.description.trim(),
      displayName: editForm.displayName.trim() || undefined,
      mutuallyExclusive: editForm.mutuallyExclusive,
    });
    editOpen.value = false;
    message.success(t('governance.glossaries.updated'));
    await load();
  } catch (error) {
    message.error(error instanceof Error ? error.message : t('crud.updateFailed'));
  } finally {
    saving.value = false;
  }
}

async function onCreateTerm(): Promise<void> {
  if (!glossary.value) {
    return;
  }
  creating.value = true;
  try {
    const created = await createGlossaryTerm({
      glossary: glossary.value.fullyQualifiedName || glossary.value.name,
      name: termForm.name.trim(),
      description: termForm.description.trim(),
      displayName: termForm.displayName.trim() || undefined,
      parent: termForm.parent,
      mutuallyExclusive: termForm.mutuallyExclusive,
    });
    createTermOpen.value = false;
    message.success(t('governance.glossaries.termCreated', { name: created.name }));
    await load();
  } catch (error) {
    message.error(error instanceof Error ? error.message : t('governance.glossaries.termCreateFailed'));
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
    :title="entityLabel(glossary) || t('governance.glossaries.title')"
    :name="glossary?.name"
    :fqn="glossary?.fullyQualifiedName"
    :lead="t('governance.glossaries.lead')"
    :loading="loading"
    :error="errorMessage"
    :empty="!glossary && !loading && !errorMessage"
    :breadcrumbs="breadcrumbs"
    :tabs="glossary ? tabs : []"
    v-model:active-tab="activeTab"
  >
    <template #actions>
      <Button type="primary" data-testid="edit-glossary" :disabled="!glossary" @click="openEdit">
        {{ t('crud.edit') }}
      </Button>
      <Button data-testid="create-term" :disabled="!glossary" @click="createTermOpen = true">
        {{ t('governance.glossaries.createTerm') }}
      </Button>
    </template>
    <template #overview>
      <Descriptions v-if="glossary" bordered :column="1" size="small">
        <Descriptions.Item :label="t('crud.name')">{{ glossary.name }}</Descriptions.Item>
        <Descriptions.Item :label="t('crud.fqn')">{{ glossary.fullyQualifiedName }}</Descriptions.Item>
        <Descriptions.Item :label="t('crud.description')">{{ glossary.description || '—' }}</Descriptions.Item>
        <Descriptions.Item :label="t('governance.glossaries.exclusive')">
          {{ glossary.mutuallyExclusive ? t('crud.yes') : t('crud.no') }}
        </Descriptions.Item>
        <Descriptions.Item :label="t('governance.glossaries.termCount')">
          {{ glossary.termCount ?? terms.length }}
        </Descriptions.Item>
      </Descriptions>
    </template>
    <template #terms>
      <Table
        row-key="id"
        data-testid="glossary-terms-table"
        :columns="termColumns"
        :data-source="terms"
        :pagination="false"
        size="small"
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'name'">
            <a
              href="#"
              @click.prevent="router.push({ name: 'governance-term', params: { id: (record as GlossaryTerm).id } })"
            >
              {{ entityLabel(record as GlossaryTerm) }}
            </a>
          </template>
          <template v-else-if="column.key === 'parent'">
            {{ (record as GlossaryTerm).parent?.name || '—' }}
          </template>
          <template v-else-if="column.key === 'relatedTerms'">
            {{ joinRefNames((record as GlossaryTerm).relatedTerms) || '—' }}
          </template>
        </template>
      </Table>
    </template>
  </EntityDetailShell>
  <Modal
    v-model:open="editOpen"
    :title="t('governance.glossaries.editTitle')"
    :ok-text="t('crud.edit')"
    :cancel-text="t('crud.cancel')"
    :confirm-loading="saving"
    @ok="onSave"
  >
    <Form layout="vertical">
      <Form.Item :label="t('crud.displayName')">
        <Input v-model:value="editForm.displayName" />
      </Form.Item>
      <Form.Item :label="t('crud.description')" required>
        <Input.TextArea v-model:value="editForm.description" :rows="3" />
      </Form.Item>
      <Form.Item>
        <Checkbox v-model:checked="editForm.mutuallyExclusive">
          {{ t('governance.glossaries.exclusiveHint') }}
        </Checkbox>
      </Form.Item>
    </Form>
  </Modal>
  <Modal
    v-model:open="createTermOpen"
    :title="t('governance.glossaries.createTermTitle')"
    :ok-text="t('crud.create')"
    :cancel-text="t('crud.cancel')"
    :confirm-loading="creating"
    @ok="onCreateTerm"
  >
    <Form layout="vertical">
      <Form.Item :label="t('crud.name')" required>
        <Input v-model:value="termForm.name" data-testid="create-term-name" />
      </Form.Item>
      <Form.Item :label="t('crud.description')" required>
        <Input.TextArea v-model:value="termForm.description" data-testid="create-term-description" :rows="3" />
      </Form.Item>
      <Form.Item :label="t('crud.displayName')">
        <Input v-model:value="termForm.displayName" />
      </Form.Item>
      <Form.Item :label="t('governance.glossaries.parentTerm')">
        <Select v-model:value="termForm.parent" allow-clear>
          <Select.Option v-for="term in terms" :key="term.id" :value="term.fullyQualifiedName || term.name">
            {{ entityLabel(term) }}
          </Select.Option>
        </Select>
      </Form.Item>
      <Form.Item>
        <Checkbox v-model:checked="termForm.mutuallyExclusive">
          {{ t('governance.glossaries.exclusiveHint') }}
        </Checkbox>
      </Form.Item>
    </Form>
  </Modal>
</template>
