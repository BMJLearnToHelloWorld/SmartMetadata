<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { Button, Checkbox, Descriptions, Form, Input, Modal, Select, Tag, message } from 'ant-design-vue';
import { listRoles } from '@/api/roles';
import { listTeams } from '@/api/teams';
import { assignUserRolesPatch, deactivateUser, getUser, patchUser, restoreUser, updateUser } from '@/api/users';
import EntityDetailShell from '@/features/crud/EntityDetailShell.vue';
import { entityLabel, joinRefNames } from '@/features/crud/paging';
import type { EntityBreadcrumb, EntityDetailTab } from '@/features/crud/types';
import type { AdminRole, AdminTeam, AdminUser } from '@/types/admin';

const props = defineProps<{ id: string }>();
const { t } = useI18n();
const loading = ref(false);
const errorMessage = ref('');
const user = ref<AdminUser | null>(null);
const activeTab = ref('overview');
const editOpen = ref(false);
const saving = ref(false);
const teams = ref<AdminTeam[]>([]);
const roles = ref<AdminRole[]>([]);

function idsOf(refs: { id?: string }[]): string[] {
  return refs.map((item) => item.id).filter((id): id is string => Boolean(id));
}

const editForm = reactive({
  displayName: '',
  email: '',
  description: '',
  isAdmin: false,
  teamIds: [] as string[],
  roleIds: [] as string[],
});

const breadcrumbs = computed<EntityBreadcrumb[]>(() => [
  { label: t('admin.users.title'), to: { name: 'admin-users' } },
  { label: entityLabel(user.value) || t('admin.users.title') },
]);

const tabs = computed<EntityDetailTab[]>(() => [
  { key: 'overview', label: t('crud.overview'), testId: 'user-tab-overview' },
  { key: 'roles', label: t('admin.users.rolesTab'), testId: 'user-tab-roles' },
]);

async function load(): Promise<void> {
  loading.value = true;
  errorMessage.value = '';
  try {
    user.value = await getUser(props.id, 'all');
    editForm.roleIds = idsOf(user.value.roles);
    editForm.teamIds = idsOf(user.value.teams);
  } catch (error) {
    user.value = null;
    errorMessage.value = error instanceof Error ? error.message : t('crud.loadFailed');
  } finally {
    loading.value = false;
  }
}

function openEdit(): void {
  if (!user.value) {
    return;
  }
  editForm.displayName = user.value.displayName || '';
  editForm.email = user.value.email || '';
  editForm.description = user.value.description || '';
  editForm.isAdmin = Boolean(user.value.isAdmin);
  editForm.teamIds = idsOf(user.value.teams);
  editForm.roleIds = idsOf(user.value.roles);
  editOpen.value = true;
}

async function onSave(): Promise<void> {
  if (!user.value) {
    return;
  }
  saving.value = true;
  try {
    await updateUser({
      name: user.value.name,
      email: editForm.email.trim(),
      displayName: editForm.displayName.trim() || undefined,
      description: editForm.description.trim() || undefined,
      isAdmin: editForm.isAdmin,
      teams: editForm.teamIds,
      roles: editForm.roleIds,
    });
    editOpen.value = false;
    message.success(t('admin.users.updated'));
    await load();
  } catch (error) {
    message.error(error instanceof Error ? error.message : t('crud.updateFailed'));
  } finally {
    saving.value = false;
  }
}

async function onDeactivate(): Promise<void> {
  if (!user.value) {
    return;
  }
  try {
    await deactivateUser(user.value.id);
    message.success(t('admin.users.deactivated'));
    await load();
  } catch (error) {
    message.error(error instanceof Error ? error.message : t('crud.updateFailed'));
  }
}

async function onRestore(): Promise<void> {
  if (!user.value) {
    return;
  }
  try {
    await restoreUser(user.value.id);
    message.success(t('admin.users.restored'));
    await load();
  } catch (error) {
    message.error(error instanceof Error ? error.message : t('crud.updateFailed'));
  }
}

async function onAssignRoles(roleIds: string[]): Promise<void> {
  if (!user.value) {
    return;
  }
  try {
    await patchUser(user.value.id, assignUserRolesPatch(user.value.roles, roleIds));
    message.success(t('admin.users.rolesUpdated'));
    await load();
  } catch (error) {
    message.error(error instanceof Error ? error.message : t('admin.users.roleAssignFailed'));
  }
}

onMounted(() => {
  void load();
  void Promise.all([listTeams({ limit: 100 }), listRoles(100)])
    .then(([teamPage, rolePage]) => {
      teams.value = teamPage.data;
      roles.value = rolePage.data;
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
    :title="entityLabel(user) || t('admin.users.title')"
    :name="user?.name"
    :deleted="user?.deleted"
    :lead="t('admin.users.detailLead')"
    :loading="loading"
    :error="errorMessage"
    :empty="!user && !loading && !errorMessage"
    :breadcrumbs="breadcrumbs"
    :tabs="user ? tabs : []"
    v-model:active-tab="activeTab"
  >
    <template #actions>
      <Button v-if="user" data-testid="edit-user" @click="openEdit">{{ t('crud.edit') }}</Button>
      <Button v-if="user && !user.deleted" danger data-testid="deactivate-user" @click="onDeactivate">
        {{ t('admin.users.deactivate') }}
      </Button>
      <Button v-if="user?.deleted" type="primary" data-testid="restore-user" @click="onRestore">
        {{ t('admin.users.restore') }}
      </Button>
    </template>
    <template #overview>
      <Descriptions v-if="user" bordered :column="2" size="small">
        <Descriptions.Item :label="t('crud.name')">{{ user.name }}</Descriptions.Item>
        <Descriptions.Item :label="t('crud.email')">{{ user.email || '—' }}</Descriptions.Item>
        <Descriptions.Item :label="t('admin.users.admin')">
          <Tag v-if="user.isAdmin" color="blue">{{ t('admin.users.admin') }}</Tag>
          <span v-else>—</span>
        </Descriptions.Item>
        <Descriptions.Item :label="t('admin.users.bot')">
          <Tag v-if="user.isBot">{{ t('admin.users.bot') }}</Tag>
          <span v-else>—</span>
        </Descriptions.Item>
        <Descriptions.Item :label="t('admin.users.status')">
          <Tag :color="user.deleted ? 'red' : 'green'">
            {{ user.deleted ? t('crud.deleted') : t('crud.active') }}
          </Tag>
        </Descriptions.Item>
        <Descriptions.Item :label="t('crud.description')" :span="2">{{ user.description || '—' }}</Descriptions.Item>
        <Descriptions.Item :label="t('admin.users.teams')" :span="2">
          {{ joinRefNames(user.teams) || '—' }}
        </Descriptions.Item>
        <Descriptions.Item :label="t('admin.users.roles')" :span="2">
          {{ joinRefNames(user.roles) || '—' }}
        </Descriptions.Item>
      </Descriptions>
    </template>
    <template #roles>
      <p class="entity-detail__tab-lead">{{ t('admin.users.rolesLead') }}</p>
      <Select
        v-if="user"
        v-model:value="editForm.roleIds"
        mode="multiple"
        style="width: 100%"
        :placeholder="t('admin.users.selectRoles')"
        data-testid="user-roles-select"
      >
        <Select.Option v-for="role in roles" :key="role.id" :value="role.id">
          {{ entityLabel(role) }}
        </Select.Option>
      </Select>
      <Button
        type="primary"
        style="margin-top: 12px"
        data-testid="save-user-roles"
        @click="onAssignRoles(editForm.roleIds)"
      >
        {{ t('admin.users.saveRoles') }}
      </Button>
    </template>
  </EntityDetailShell>
  <Modal
    v-model:open="editOpen"
    :title="t('admin.users.editTitle')"
    :ok-text="t('crud.edit')"
    :confirm-loading="saving"
    @ok="onSave"
  >
    <Form layout="vertical">
      <Form.Item :label="t('crud.displayName')">
        <Input v-model:value="editForm.displayName" />
      </Form.Item>
      <Form.Item :label="t('crud.email')">
        <Input v-model:value="editForm.email" />
      </Form.Item>
      <Form.Item :label="t('crud.description')">
        <Input.TextArea v-model:value="editForm.description" :rows="2" />
      </Form.Item>
      <Form.Item>
        <Checkbox v-model:checked="editForm.isAdmin">{{ t('admin.users.administrator') }}</Checkbox>
      </Form.Item>
      <Form.Item :label="t('admin.users.teams')">
        <Select v-model:value="editForm.teamIds" mode="multiple" allow-clear>
          <Select.Option v-for="team in teams" :key="team.id" :value="team.id">
            {{ entityLabel(team) }}
          </Select.Option>
        </Select>
      </Form.Item>
      <Form.Item :label="t('admin.users.roles')">
        <Select v-model:value="editForm.roleIds" mode="multiple" allow-clear>
          <Select.Option v-for="role in roles" :key="role.id" :value="role.id">
            {{ entityLabel(role) }}
          </Select.Option>
        </Select>
      </Form.Item>
    </Form>
  </Modal>
</template>

<style scoped>
.entity-detail__tab-lead {
  color: var(--ant-color-text-secondary, #8c8c8c);
  margin-bottom: 12px;
}
</style>
