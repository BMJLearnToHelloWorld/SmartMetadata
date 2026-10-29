<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { Button, Checkbox, Form, Input, Modal, Select, message } from 'ant-design-vue';
import { createPolicy, deletePolicy, listPolicies } from '@/api/policies';
import EntityListShell from '@/features/crud/EntityListShell.vue';
import { confirmDelete } from '@/features/crud/confirmDelete';
import { requiredField } from '@/features/crud/formRules';
import {
  DEFAULT_PAGE_SIZE,
  canGoNext,
  canGoPrev,
  createCursorPager,
  entityLabel,
  goNext,
  goPrev,
  resetCursor,
  type CursorPager,
} from '@/features/crud/paging';
import type { EntityListColumn } from '@/features/crud/types';
import type { AdminPolicy } from '@/types/admin';

const { t } = useI18n();
const router = useRouter();
const loading = ref(false);
const errorMessage = ref('');
const policies = ref<AdminPolicy[]>([]);
const total = ref<number | undefined>();
const pageAfter = ref<string | undefined>();
const cursor = ref<CursorPager>(createCursorPager());
const createOpen = ref(false);
const creating = ref(false);
const form = reactive({
  name: '',
  displayName: '',
  description: '',
  enabled: true,
  ruleName: '',
  effect: 'allow' as 'allow' | 'deny',
  operations: ['ViewAll'] as string[],
  resources: ['All'] as string[],
});

const columns = computed<EntityListColumn[]>(() => [
  { title: t('crud.name'), dataIndex: 'name', key: 'name' },
  { title: t('admin.policies.rules'), key: 'rules', width: 90 },
  { title: t('admin.policies.roles'), key: 'roles', width: 90 },
  { title: t('admin.policies.teams'), key: 'teams', width: 90 },
  { title: t('crud.enabled'), key: 'enabled', width: 100 },
]);

const hasNext = computed(() => canGoNext(pageAfter.value));
const hasPrev = computed(() => canGoPrev(cursor.value));

function resetForm(): void {
  form.name = '';
  form.displayName = '';
  form.description = '';
  form.enabled = true;
  form.ruleName = '';
  form.effect = 'allow';
  form.operations = ['ViewAll'];
  form.resources = ['All'];
}

async function load(): Promise<void> {
  loading.value = true;
  errorMessage.value = '';
  try {
    const page = await listPolicies({ limit: DEFAULT_PAGE_SIZE, after: cursor.value.after });
    policies.value = page.data;
    total.value = page.total;
    pageAfter.value = page.after;
  } catch (error) {
    policies.value = [];
    errorMessage.value = error instanceof Error ? error.message : t('crud.loadFailed');
  } finally {
    loading.value = false;
  }
}

function onNext(): void {
  if (!pageAfter.value) {
    return;
  }
  cursor.value = goNext(cursor.value, pageAfter.value);
  void load();
}

function onPrev(): void {
  cursor.value = goPrev(cursor.value);
  void load();
}

function onRefresh(): void {
  cursor.value = resetCursor();
  void load();
}

function openDetail(policy: AdminPolicy): void {
  void router.push({ name: 'admin-policy', params: { id: policy.id } });
}

async function onCreate(): Promise<void> {
  const name = form.name.trim();
  const ruleName = (form.ruleName.trim() || `${name}Rule`).trim();
  if (!name || !form.operations.length || !form.resources.length) {
    message.error(t('admin.policies.createInvalid'));
    return;
  }
  creating.value = true;
  try {
    const created = await createPolicy({
      name,
      displayName: form.displayName.trim() || undefined,
      description: form.description.trim() || undefined,
      enabled: form.enabled,
      rules: [
        {
          name: ruleName,
          effect: form.effect,
          operations: [...form.operations],
          resources: [...form.resources],
        },
      ],
    });
    createOpen.value = false;
    resetForm();
    message.success(t('admin.policies.created', { name: created.name }));
    await load();
  } catch (error) {
    message.error(error instanceof Error ? error.message : t('crud.createFailed'));
  } finally {
    creating.value = false;
  }
}

async function onDelete(policy: AdminPolicy): Promise<void> {
  const confirmed = await confirmDelete({
    title: t('crud.deleteTitle'),
    content: t('admin.policies.deleteConfirm', { name: policy.name }),
    okText: t('crud.delete'),
    cancelText: t('crud.cancel'),
  });
  if (!confirmed) {
    return;
  }
  try {
    await deletePolicy(policy.id);
    message.success(t('admin.policies.deleted', { name: policy.name }));
    await load();
  } catch (error) {
    message.error(error instanceof Error ? error.message : t('crud.deleteFailed'));
  }
}

onMounted(() => {
  void load();
});
</script>

<template>
  <EntityListShell
    :title="t('admin.policies.title')"
    :lead="t('admin.policies.lead')"
    :loading="loading"
    :error="errorMessage"
    :columns="columns"
    :data-source="policies"
    table-test-id="admin-policies-table"
    show-row-actions
    show-edit-action
    show-delete-action
    :total="total"
    :has-next="hasNext"
    :has-prev="hasPrev"
    @refresh="onRefresh"
    @next="onNext"
    @prev="onPrev"
    @view="(record) => openDetail(record as AdminPolicy)"
    @edit="(record) => openDetail(record as AdminPolicy)"
    @delete="(record) => onDelete(record as AdminPolicy)"
  >
    <template #actions>
      <Button type="primary" data-testid="create-policy" @click="createOpen = true">
        {{ t('admin.policies.create') }}
      </Button>
    </template>
    <template #bodyCell="{ column, record }">
      <template v-if="column.key === 'name'">
        <a
          href="#"
          :data-testid="`policy-row-${(record as AdminPolicy).id}`"
          @click.prevent="openDetail(record as AdminPolicy)"
        >
          {{ entityLabel(record as AdminPolicy) }}
        </a>
      </template>
      <template v-else-if="column.key === 'rules'">
        {{ (record as AdminPolicy).rules.length }}
      </template>
      <template v-else-if="column.key === 'roles'">
        {{ (record as AdminPolicy).roles.length }}
      </template>
      <template v-else-if="column.key === 'teams'">
        {{ (record as AdminPolicy).teams.length }}
      </template>
      <template v-else-if="column.key === 'enabled'">
        {{
          (record as AdminPolicy).enabled === undefined
            ? '—'
            : (record as AdminPolicy).enabled
              ? t('settings.system.enabled')
              : t('settings.system.disabled')
        }}
      </template>
    </template>
  </EntityListShell>
  <Modal
    v-model:open="createOpen"
    :title="t('admin.policies.createTitle')"
    :ok-text="t('crud.create')"
    :cancel-text="t('crud.cancel')"
    :confirm-loading="creating"
    destroy-on-close
    :get-container="false"
    @ok="onCreate"
  >
    <Form layout="vertical">
      <Form.Item :label="t('crud.name')" :rules="requiredField(t, t('crud.name'))">
        <Input v-model:value="form.name" data-testid="create-policy-name" />
      </Form.Item>
      <Form.Item :label="t('crud.displayName')" :extra="t('crud.displayNameHelp')">
        <Input v-model:value="form.displayName" />
      </Form.Item>
      <Form.Item :label="t('crud.description')">
        <Input.TextArea v-model:value="form.description" :rows="2" />
      </Form.Item>
      <Form.Item>
        <Checkbox v-model:checked="form.enabled">{{ t('admin.policies.enabledHint') }}</Checkbox>
      </Form.Item>
      <Form.Item :label="t('admin.policies.ruleName')" :extra="t('admin.policies.ruleNameHelp')">
        <Input v-model:value="form.ruleName" data-testid="create-policy-rule-name" />
      </Form.Item>
      <Form.Item :label="t('admin.policies.effect')" required>
        <Select
          v-model:value="form.effect"
          data-testid="create-policy-effect"
          :options="[
            { value: 'allow', label: t('admin.policies.effectAllow') },
            { value: 'deny', label: t('admin.policies.effectDeny') },
          ]"
        />
      </Form.Item>
      <Form.Item :label="t('admin.policies.operations')" :extra="t('admin.policies.operationsHelp')" required>
        <Select
          v-model:value="form.operations"
          mode="tags"
          data-testid="create-policy-operations"
          :token-separators="[',']"
          style="width: 100%"
        />
      </Form.Item>
      <Form.Item :label="t('admin.policies.resources')" :extra="t('admin.policies.resourcesHelp')" required>
        <Select
          v-model:value="form.resources"
          mode="tags"
          data-testid="create-policy-resources"
          :token-separators="[',']"
          style="width: 100%"
        />
      </Form.Item>
    </Form>
  </Modal>
</template>
