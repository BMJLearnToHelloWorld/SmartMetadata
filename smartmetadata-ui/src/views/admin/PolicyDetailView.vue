<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import {
  Button,
  Checkbox,
  Descriptions,
  Form,
  Input,
  Modal,
  Select,
  Table,
  message,
} from 'ant-design-vue';
import { deletePolicy, getPolicy, updatePolicy } from '@/api/policies';
import EntityDetailShell from '@/features/crud/EntityDetailShell.vue';
import { confirmDelete } from '@/features/crud/confirmDelete';
import { entityLabel, joinRefNames } from '@/features/crud/paging';
import type { EntityBreadcrumb, EntityDetailTab, EntityListColumn } from '@/features/crud/types';
import type { AdminPolicy, CreatePolicyRuleRequest, PolicyRule } from '@/types/admin';
import type { EntityRef } from '@/types/api';

const props = defineProps<{ id: string }>();
const { t } = useI18n();
const router = useRouter();
const loading = ref(false);
const errorMessage = ref('');
const policy = ref<AdminPolicy | null>(null);
const activeTab = ref('overview');
const editOpen = ref(false);
const saving = ref(false);
const form = reactive({
  displayName: '',
  description: '',
  enabled: true,
  rules: [] as CreatePolicyRuleRequest[],
});

const breadcrumbs = computed<EntityBreadcrumb[]>(() => [
  { label: t('admin.policies.title'), to: { name: 'admin-policies' } },
  { label: entityLabel(policy.value) || t('admin.policies.title') },
]);

const tabs = computed<EntityDetailTab[]>(() => [
  { key: 'overview', label: t('crud.overview'), testId: 'policy-tab-overview' },
  { key: 'rules', label: t('admin.policies.rulesTab'), testId: 'policy-tab-rules' },
  { key: 'roles', label: t('admin.policies.rolesTab'), testId: 'policy-tab-roles' },
  { key: 'teams', label: t('admin.policies.teamsTab'), testId: 'policy-tab-teams' },
]);

const ruleColumns = computed<EntityListColumn[]>(() => [
  { title: t('crud.name'), dataIndex: 'name', key: 'name' },
  { title: t('admin.policies.effect'), dataIndex: 'effect', key: 'effect', width: 100 },
  { title: t('admin.policies.operations'), key: 'operations' },
  { title: t('admin.policies.resources'), key: 'resources' },
  { title: t('admin.policies.condition'), dataIndex: 'condition', key: 'condition' },
]);

const refColumns = computed<EntityListColumn[]>(() => [
  { title: t('crud.name'), dataIndex: 'name', key: 'name' },
  { title: t('crud.type'), dataIndex: 'type', key: 'type', width: 100 },
]);

async function load(): Promise<void> {
  loading.value = true;
  errorMessage.value = '';
  try {
    policy.value = await getPolicy(props.id);
  } catch (error) {
    policy.value = null;
    errorMessage.value = error instanceof Error ? error.message : t('crud.loadFailed');
  } finally {
    loading.value = false;
  }
}

function openEdit(): void {
  const current = policy.value;
  if (!current) {
    return;
  }
  form.displayName = current.displayName || '';
  form.description = current.description || '';
  form.enabled = current.enabled !== false;
  form.rules = current.rules.map((rule) => ({
    name: rule.name,
    effect: (rule.effect === 'deny' ? 'deny' : 'allow') as 'allow' | 'deny',
    operations: [...rule.operations],
    resources: [...rule.resources],
    description: rule.description,
    condition: rule.condition,
  }));
  if (!form.rules.length) {
    form.rules.push({
      name: `${current.name}Rule`,
      effect: 'allow',
      operations: ['ViewAll'],
      resources: ['All'],
    });
  }
  editOpen.value = true;
}

async function onSave(): Promise<void> {
  const current = policy.value;
  if (!current) {
    return;
  }
  if (!form.rules.length || form.rules.some((r) => !r.name.trim() || !r.operations.length || !r.resources.length)) {
    message.error(t('admin.policies.createInvalid'));
    return;
  }
  saving.value = true;
  try {
    const updated = await updatePolicy({
      name: current.name,
      displayName: form.displayName.trim() || undefined,
      description: form.description.trim() || undefined,
      enabled: form.enabled,
      rules: form.rules.map((rule) => ({
        name: rule.name.trim(),
        effect: rule.effect,
        operations: [...rule.operations],
        resources: [...rule.resources],
        description: rule.description,
        condition: rule.condition,
      })),
    });
    editOpen.value = false;
    policy.value = updated;
    message.success(t('admin.policies.updated', { name: updated.name }));
  } catch (error) {
    message.error(error instanceof Error ? error.message : t('crud.updateFailed'));
  } finally {
    saving.value = false;
  }
}

async function onDelete(): Promise<void> {
  const current = policy.value;
  if (!current) {
    return;
  }
  const confirmed = await confirmDelete({
    title: t('crud.deleteTitle'),
    content: t('admin.policies.deleteConfirm', { name: current.name }),
    okText: t('crud.delete'),
    cancelText: t('crud.cancel'),
  });
  if (!confirmed) {
    return;
  }
  try {
    await deletePolicy(current.id);
    message.success(t('admin.policies.deleted', { name: current.name }));
    await router.push({ name: 'admin-policies' });
  } catch (error) {
    message.error(error instanceof Error ? error.message : t('crud.deleteFailed'));
  }
}

onMounted(() => {
  void load();
});

watch(
  () => props.id,
  () => {
    void load();
  },
);
</script>

<template>
  <EntityDetailShell
    :title="entityLabel(policy) || t('admin.policies.title')"
    :name="policy?.name"
    :lead="t('admin.policies.detailLead')"
    :loading="loading"
    :error="errorMessage"
    :empty="!policy && !loading && !errorMessage"
    :breadcrumbs="breadcrumbs"
    :tabs="policy ? tabs : []"
    v-model:active-tab="activeTab"
  >
    <template #actions>
      <Button v-if="policy" data-testid="edit-policy" @click="openEdit">{{ t('crud.edit') }}</Button>
      <Button v-if="policy" danger data-testid="delete-policy" @click="onDelete">{{ t('crud.delete') }}</Button>
    </template>
    <template #overview>
      <Descriptions v-if="policy" bordered :column="1" size="small">
        <Descriptions.Item :label="t('crud.name')">{{ policy.name }}</Descriptions.Item>
        <Descriptions.Item :label="t('crud.description')">{{ policy.description || '—' }}</Descriptions.Item>
        <Descriptions.Item :label="t('crud.enabled')">
          {{
            policy.enabled === undefined
              ? '—'
              : policy.enabled
                ? t('settings.system.enabled')
                : t('settings.system.disabled')
          }}
        </Descriptions.Item>
        <Descriptions.Item :label="t('crud.owners')">{{ joinRefNames(policy.owners) || '—' }}</Descriptions.Item>
      </Descriptions>
    </template>
    <template #rules>
      <Table
        row-key="name"
        data-testid="policy-rules-table"
        :columns="ruleColumns"
        :data-source="policy?.rules ?? []"
        :pagination="false"
        size="small"
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'operations'">
            {{ (record as PolicyRule).operations.join(', ') || '—' }}
          </template>
          <template v-else-if="column.key === 'resources'">
            {{ (record as PolicyRule).resources.join(', ') || '—' }}
          </template>
          <template v-else-if="column.key === 'condition'">
            {{ (record as PolicyRule).condition || '—' }}
          </template>
        </template>
      </Table>
    </template>
    <template #roles>
      <Table
        row-key="id"
        data-testid="policy-roles-table"
        :columns="refColumns"
        :data-source="policy?.roles ?? []"
        :pagination="false"
        size="small"
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'name'">
            <a
              v-if="(record as EntityRef).id"
              href="#"
              @click.prevent="router.push({ name: 'admin-role', params: { id: (record as EntityRef).id } })"
            >
              {{ entityLabel(record as EntityRef) }}
            </a>
            <span v-else>{{ entityLabel(record as EntityRef) }}</span>
          </template>
        </template>
      </Table>
    </template>
    <template #teams>
      <Table
        row-key="id"
        data-testid="policy-teams-table"
        :columns="refColumns"
        :data-source="policy?.teams ?? []"
        :pagination="false"
        size="small"
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'name'">
            <a
              v-if="(record as EntityRef).id"
              href="#"
              @click.prevent="router.push({ name: 'admin-team', params: { id: (record as EntityRef).id } })"
            >
              {{ entityLabel(record as EntityRef) }}
            </a>
            <span v-else>{{ entityLabel(record as EntityRef) }}</span>
          </template>
        </template>
      </Table>
    </template>
  </EntityDetailShell>
  <Modal
    v-model:open="editOpen"
    :title="t('admin.policies.editTitle')"
    :ok-text="t('crud.save')"
    :cancel-text="t('crud.cancel')"
    :confirm-loading="saving"
    width="720px"
    destroy-on-close
    :get-container="false"
    @ok="onSave"
  >
    <Form layout="vertical">
      <Form.Item :label="t('crud.displayName')">
        <Input v-model:value="form.displayName" data-testid="edit-policy-display-name" />
      </Form.Item>
      <Form.Item :label="t('crud.description')">
        <Input.TextArea v-model:value="form.description" :rows="2" data-testid="edit-policy-description" />
      </Form.Item>
      <Form.Item>
        <Checkbox v-model:checked="form.enabled">{{ t('admin.policies.enabledHint') }}</Checkbox>
      </Form.Item>
      <div v-for="(rule, index) in form.rules" :key="index" style="margin-bottom: 12px; padding: 8px; border: 1px solid var(--sm-border-color)">
        <Form.Item :label="t('admin.policies.ruleName')">
          <Input v-model:value="rule.name" :data-testid="`edit-policy-rule-name-${index}`" />
        </Form.Item>
        <Form.Item :label="t('admin.policies.effect')">
          <Select
            v-model:value="rule.effect"
            :options="[
              { value: 'allow', label: t('admin.policies.effectAllow') },
              { value: 'deny', label: t('admin.policies.effectDeny') },
            ]"
          />
        </Form.Item>
        <Form.Item :label="t('admin.policies.operations')">
          <Select v-model:value="rule.operations" mode="tags" :token-separators="[',']" style="width: 100%" />
        </Form.Item>
        <Form.Item :label="t('admin.policies.resources')">
          <Select v-model:value="rule.resources" mode="tags" :token-separators="[',']" style="width: 100%" />
        </Form.Item>
      </div>
    </Form>
  </Modal>
</template>
