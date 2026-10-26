<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { Button, Descriptions, Select, Space, Table, message } from 'ant-design-vue';
import { getRole } from '@/api/roles';
import { assignTeamDefaultRolesPatch, getTeam, listTeams, patchTeam } from '@/api/teams';
import { assignUserRolesPatch, getUser, listUsers, patchUser } from '@/api/users';
import EntityDetailShell from '@/features/crud/EntityDetailShell.vue';
import { entityLabel, joinRefNames } from '@/features/crud/paging';
import type { EntityBreadcrumb, EntityDetailTab, EntityListColumn } from '@/features/crud/types';
import type { AdminRole, AdminTeam, AdminUser } from '@/types/admin';
import type { EntityRef } from '@/types/api';

const props = defineProps<{ id: string }>();
const { t } = useI18n();
const router = useRouter();
const loading = ref(false);
const errorMessage = ref('');
const role = ref<AdminRole | null>(null);
const users = ref<AdminUser[]>([]);
const teams = ref<AdminTeam[]>([]);
const assignUserId = ref<string | undefined>();
const assignTeamId = ref<string | undefined>();
const activeTab = ref('overview');

const breadcrumbs = computed<EntityBreadcrumb[]>(() => [
  { label: t('admin.roles.title'), to: { name: 'admin-roles' } },
  { label: entityLabel(role.value) || t('admin.roles.title') },
]);

const tabs = computed<EntityDetailTab[]>(() => [
  { key: 'overview', label: t('crud.overview'), testId: 'role-tab-overview' },
  { key: 'users', label: t('admin.roles.usersTab'), testId: 'role-tab-users' },
  { key: 'teams', label: t('admin.roles.teamsTab'), testId: 'role-tab-teams' },
]);

const memberColumns = computed<EntityListColumn[]>(() => [
  { title: t('crud.name'), dataIndex: 'name', key: 'name' },
  { title: t('crud.type'), dataIndex: 'type', key: 'type', width: 100 },
]);

async function load(): Promise<void> {
  loading.value = true;
  errorMessage.value = '';
  try {
    role.value = await getRole(props.id);
  } catch (error) {
    role.value = null;
    errorMessage.value = error instanceof Error ? error.message : t('crud.loadFailed');
  } finally {
    loading.value = false;
  }
}

async function onAssignUser(): Promise<void> {
  if (!role.value || !assignUserId.value) {
    return;
  }
  try {
    const target = await getUser(assignUserId.value);
    const ids = target.roles.map((item) => item.id).filter((id): id is string => Boolean(id));
    if (!ids.includes(role.value.id)) {
      ids.push(role.value.id);
    }
    await patchUser(target.id, assignUserRolesPatch(target.roles, ids));
    message.success(t('admin.roles.assignedUser', { role: role.value.name, name: target.name }));
    assignUserId.value = undefined;
    await load();
  } catch (error) {
    message.error(error instanceof Error ? error.message : t('admin.roles.assignUserFailed'));
  }
}

async function onAssignTeam(): Promise<void> {
  if (!role.value || !assignTeamId.value) {
    return;
  }
  try {
    const target = await getTeam(assignTeamId.value);
    const ids = target.defaultRoles.map((item) => item.id).filter((id): id is string => Boolean(id));
    if (!ids.includes(role.value.id)) {
      ids.push(role.value.id);
    }
    await patchTeam(target.id, assignTeamDefaultRolesPatch(target.defaultRoles, ids));
    message.success(t('admin.roles.assignedTeam', { role: role.value.name, name: target.name }));
    assignTeamId.value = undefined;
    await load();
  } catch (error) {
    message.error(error instanceof Error ? error.message : t('admin.roles.assignTeamFailed'));
  }
}

onMounted(() => {
  void load();
  void Promise.all([listUsers({ limit: 100, isBot: false }), listTeams({ limit: 100 })])
    .then(([userPage, teamPage]) => {
      users.value = userPage.data;
      teams.value = teamPage.data;
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
    :title="entityLabel(role) || t('admin.roles.title')"
    :name="role?.name"
    :lead="t('admin.roles.detailLead')"
    :loading="loading"
    :error="errorMessage"
    :empty="!role && !loading && !errorMessage"
    :breadcrumbs="breadcrumbs"
    :tabs="role ? tabs : []"
    v-model:active-tab="activeTab"
  >
    <template #overview>
      <Descriptions v-if="role" bordered :column="1" size="small">
        <Descriptions.Item :label="t('crud.name')">{{ role.name }}</Descriptions.Item>
        <Descriptions.Item :label="t('crud.description')">{{ role.description || '—' }}</Descriptions.Item>
        <Descriptions.Item :label="t('admin.roles.policies')">
          {{ joinRefNames(role.policies) || '—' }}
        </Descriptions.Item>
      </Descriptions>
    </template>
    <template #users>
      <p class="entity-detail__tab-lead">{{ t('admin.roles.assignUser') }}</p>
      <Space>
        <Select
          v-model:value="assignUserId"
          show-search
          :placeholder="t('admin.roles.selectUser')"
          style="width: 280px"
          :options="users.map((u) => ({ value: u.id, label: entityLabel(u) }))"
        />
        <Button type="primary" data-testid="assign-role-user" @click="onAssignUser">
          {{ t('admin.roles.assign') }}
        </Button>
      </Space>
      <Table
        row-key="id"
        :columns="memberColumns"
        :data-source="role?.users ?? []"
        :pagination="false"
        size="small"
        style="margin-top: 16px"
        :row-class-name="() => 'role-user-row'"
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'name'">
            <a
              v-if="(record as EntityRef).id"
              href="#"
              @click.prevent="router.push({ name: 'admin-user', params: { id: (record as EntityRef).id } })"
            >
              {{ entityLabel(record as EntityRef) }}
            </a>
            <span v-else>{{ entityLabel(record as EntityRef) }}</span>
          </template>
        </template>
      </Table>
    </template>
    <template #teams>
      <p class="entity-detail__tab-lead">{{ t('admin.roles.assignTeam') }}</p>
      <Space>
        <Select
          v-model:value="assignTeamId"
          show-search
          :placeholder="t('admin.roles.selectTeam')"
          style="width: 280px"
          :options="teams.map((item) => ({ value: item.id, label: entityLabel(item) }))"
        />
        <Button data-testid="assign-role-team" @click="onAssignTeam">
          {{ t('admin.roles.addDefaultRole') }}
        </Button>
      </Space>
      <Table
        row-key="id"
        :columns="memberColumns"
        :data-source="role?.teams ?? []"
        :pagination="false"
        size="small"
        style="margin-top: 16px"
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
          </template>
        </template>
      </Table>
    </template>
  </EntityDetailShell>
</template>

<style scoped>
.entity-detail__tab-lead {
  color: var(--ant-color-text-secondary, #8c8c8c);
  margin-bottom: 12px;
}
</style>
