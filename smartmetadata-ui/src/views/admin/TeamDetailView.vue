<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import {
  Alert,
  Button,
  Checkbox,
  Descriptions,
  Form,
  Input,
  Modal,
  Select,
  Space,
  Table,
  message,
} from 'ant-design-vue';
import { listRoles } from '@/api/roles';
import {
  TEAM_TYPES,
  assignTeamDefaultRolesPatch,
  getTeam,
  patchTeam,
  removeTeamUser,
  replaceTeamUsers,
  updateTeam,
} from '@/api/teams';
import { listUsers } from '@/api/users';
import EntityDetailShell from '@/features/crud/EntityDetailShell.vue';
import { entityLabel, joinRefNames } from '@/features/crud/paging';
import type { EntityBreadcrumb, EntityDetailTab } from '@/features/crud/types';
import type { AdminRole, AdminTeam, AdminUser } from '@/types/admin';
import type { EntityRef } from '@/types/api';

const props = defineProps<{ id: string }>();
const { t } = useI18n();
const loading = ref(false);
const errorMessage = ref('');
const team = ref<AdminTeam | null>(null);
const activeTab = ref('overview');
const roles = ref<AdminRole[]>([]);
const users = ref<AdminUser[]>([]);
const addUserId = ref<string | undefined>();
const editOpen = ref(false);
const saving = ref(false);
const form = reactive({
  displayName: '',
  description: '',
  teamType: 'Group',
  isJoinable: true,
  defaultRoleIds: [] as string[],
});

function idsOf(refs: { id?: string }[]): string[] {
  return refs.map((item) => item.id).filter((id): id is string => Boolean(id));
}

const canHoldUsers = computed(() => team.value?.teamType === 'Group');

const breadcrumbs = computed<EntityBreadcrumb[]>(() => [
  { label: t('admin.teams.title'), to: { name: 'admin-teams' } },
  { label: entityLabel(team.value) || t('admin.teams.title') },
]);

const tabs = computed<EntityDetailTab[]>(() => [
  { key: 'overview', label: t('crud.overview'), testId: 'team-tab-overview' },
  { key: 'members', label: t('admin.teams.membersTab'), testId: 'team-tab-members' },
]);

const memberColumns = computed(() => [
  { title: t('crud.name'), dataIndex: 'name', key: 'name' },
  { title: t('admin.teams.type'), dataIndex: 'type', key: 'type', width: 100 },
  { title: '', key: 'actions', width: 120 },
]);

async function load(): Promise<void> {
  loading.value = true;
  errorMessage.value = '';
  try {
    team.value = await getTeam(props.id, 'all');
    form.defaultRoleIds = idsOf(team.value.defaultRoles);
  } catch (error) {
    team.value = null;
    errorMessage.value = error instanceof Error ? error.message : t('crud.loadFailed');
  } finally {
    loading.value = false;
  }
}

function openEdit(): void {
  if (!team.value) {
    return;
  }
  form.displayName = team.value.displayName || '';
  form.description = team.value.description || '';
  form.teamType = team.value.teamType;
  form.isJoinable = team.value.isJoinable !== false;
  form.defaultRoleIds = idsOf(team.value.defaultRoles);
  editOpen.value = true;
}

async function onSave(): Promise<void> {
  if (!team.value) {
    return;
  }
  saving.value = true;
  try {
    await updateTeam({
      name: team.value.name,
      teamType: form.teamType,
      displayName: form.displayName.trim() || undefined,
      description: form.description.trim() || undefined,
      isJoinable: form.isJoinable,
      defaultRoles: form.defaultRoleIds,
    });
    editOpen.value = false;
    message.success(t('admin.teams.updated'));
    await load();
  } catch (error) {
    message.error(error instanceof Error ? error.message : t('crud.updateFailed'));
  } finally {
    saving.value = false;
  }
}

async function onAddMember(): Promise<void> {
  if (!team.value || !addUserId.value) {
    return;
  }
  const existing = idsOf(team.value.users);
  if (existing.includes(addUserId.value)) {
    message.info(t('admin.teams.alreadyMember'));
    return;
  }
  try {
    await replaceTeamUsers(team.value.id, [...existing, addUserId.value]);
    addUserId.value = undefined;
    message.success(t('admin.teams.memberAdded'));
    await load();
  } catch (error) {
    message.error(error instanceof Error ? error.message : t('admin.teams.addFailed'));
  }
}

async function onRemoveMember(user: EntityRef): Promise<void> {
  if (!team.value || !user.id) {
    return;
  }
  try {
    await removeTeamUser(team.value.id, user.id);
    message.success(t('admin.teams.memberRemoved'));
    await load();
  } catch (error) {
    message.error(error instanceof Error ? error.message : t('admin.teams.removeFailed'));
  }
}

async function onDefaultRoles(roleIds: string[]): Promise<void> {
  if (!team.value) {
    return;
  }
  try {
    await patchTeam(team.value.id, assignTeamDefaultRolesPatch(team.value.defaultRoles, roleIds));
    message.success(t('admin.teams.rolesUpdated'));
    await load();
  } catch (error) {
    message.error(error instanceof Error ? error.message : t('admin.teams.rolesFailed'));
  }
}

onMounted(() => {
  void load();
  void Promise.all([listRoles(100), listUsers({ limit: 100, isBot: false })])
    .then(([rolePage, userPage]) => {
      roles.value = rolePage.data;
      users.value = userPage.data;
    })
    .catch(() => undefined);
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
    :title="entityLabel(team) || t('admin.teams.title')"
    :name="team?.name"
    :deleted="team?.deleted"
    :lead="t('admin.teams.detailLead')"
    :loading="loading"
    :error="errorMessage"
    :empty="!team && !loading && !errorMessage"
    :breadcrumbs="breadcrumbs"
    :tabs="team ? tabs : []"
    v-model:active-tab="activeTab"
  >
    <template #actions>
      <Button v-if="team" data-testid="edit-team" @click="openEdit">{{ t('crud.edit') }}</Button>
    </template>
    <template #overview>
      <Descriptions v-if="team" bordered :column="2" size="small">
        <Descriptions.Item :label="t('crud.name')">{{ team.name }}</Descriptions.Item>
        <Descriptions.Item :label="t('admin.teams.type')">{{ team.teamType }}</Descriptions.Item>
        <Descriptions.Item :label="t('admin.teams.joinable')">
          {{ team.isJoinable ? t('crud.yes') : t('crud.no') }}
        </Descriptions.Item>
        <Descriptions.Item :label="t('admin.teams.parents')">
          {{ joinRefNames(team.parents) || '—' }}
        </Descriptions.Item>
        <Descriptions.Item :label="t('crud.description')" :span="2">{{ team.description || '—' }}</Descriptions.Item>
        <Descriptions.Item :label="t('admin.teams.policies')" :span="2">
          {{ joinRefNames(team.policies) || '—' }}
        </Descriptions.Item>
        <Descriptions.Item :label="t('admin.teams.defaultRoles')" :span="2">
          <Space direction="vertical" style="width: 100%">
            <Select v-model:value="form.defaultRoleIds" mode="multiple" style="width: 100%">
              <Select.Option v-for="role in roles" :key="role.id" :value="role.id">
                {{ entityLabel(role) }}
              </Select.Option>
            </Select>
            <Button type="primary" data-testid="save-team-roles" @click="onDefaultRoles(form.defaultRoleIds)">
              {{ t('admin.teams.saveRoles') }}
            </Button>
          </Space>
        </Descriptions.Item>
      </Descriptions>
    </template>
    <template #members>
      <Alert
        v-if="team && !canHoldUsers"
        type="info"
        show-icon
        :message="t('admin.teams.membersInherited', { type: team.teamType })"
        style="margin-bottom: 12px"
      />
      <Space v-if="team && canHoldUsers" style="margin-bottom: 12px">
        <Select
          v-model:value="addUserId"
          show-search
          :placeholder="t('admin.teams.selectUser')"
          style="width: 280px"
          option-filter-prop="label"
          :options="users.map((u) => ({ value: u.id, label: `${entityLabel(u)} <${u.email || ''}>` }))"
        />
        <Button type="primary" data-testid="add-team-member" @click="onAddMember">
          {{ t('admin.teams.addMember') }}
        </Button>
      </Space>
      <Table
        v-if="team"
        row-key="id"
        :columns="memberColumns"
        :data-source="team.users"
        :pagination="false"
        size="small"
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'name'">
            {{ entityLabel(record as EntityRef) }}
          </template>
          <template v-else-if="column.key === 'actions'">
            <Button
              v-if="canHoldUsers && (record as EntityRef).id"
              type="link"
              danger
              @click="onRemoveMember(record as EntityRef)"
            >
              {{ t('admin.teams.remove') }}
            </Button>
          </template>
        </template>
      </Table>
    </template>
  </EntityDetailShell>
  <Modal
    v-model:open="editOpen"
    :title="t('admin.teams.editTitle')"
    :ok-text="t('crud.edit')"
    :cancel-text="t('crud.cancel')"
    :confirm-loading="saving"
    @ok="onSave"
  >
    <Form layout="vertical">
      <Form.Item :label="t('crud.displayName')" :extra="t('crud.displayNameHelp')">
        <Input v-model:value="form.displayName" />
      </Form.Item>
      <Form.Item :label="t('admin.teams.type')">
        <Select v-model:value="form.teamType">
          <Select.Option v-for="type in TEAM_TYPES" :key="type" :value="type">{{ type }}</Select.Option>
        </Select>
      </Form.Item>
      <Form.Item :label="t('crud.description')" :extra="t('crud.descriptionHelp')">
        <Input.TextArea v-model:value="form.description" :rows="2" />
      </Form.Item>
      <Form.Item>
        <Checkbox v-model:checked="form.isJoinable">{{ t('admin.teams.isJoinable') }}</Checkbox>
      </Form.Item>
    </Form>
  </Modal>
</template>
