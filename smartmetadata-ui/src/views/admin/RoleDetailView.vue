<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { Alert, Button, Card, Descriptions, Select, Space, Spin, Table, Typography, message } from 'ant-design-vue';
import { getRole } from '@/api/roles';
import { getTeam, listTeams, patchTeam, assignTeamDefaultRolesPatch } from '@/api/teams';
import { assignUserRolesPatch, getUser, listUsers, patchUser } from '@/api/users';
import type { AdminRole, AdminTeam, AdminUser } from '@/types/admin';
import type { EntityRef } from '@/types/api';

const props = defineProps<{ id: string }>();
const router = useRouter();
const loading = ref(false);
const errorMessage = ref('');
const role = ref<AdminRole | null>(null);
const users = ref<AdminUser[]>([]);
const teams = ref<AdminTeam[]>([]);
const assignUserId = ref<string | undefined>();
const assignTeamId = ref<string | undefined>();

const columns = [
  { title: 'Name', dataIndex: 'name', key: 'name' },
  { title: 'Type', dataIndex: 'type', key: 'type', width: 100 },
];

async function load(): Promise<void> {
  loading.value = true;
  errorMessage.value = '';
  try {
    role.value = await getRole(props.id);
  } catch (error) {
    role.value = null;
    errorMessage.value = error instanceof Error ? error.message : 'Failed to load role';
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
    message.success(`Assigned ${role.value.name} to ${target.name}`);
    assignUserId.value = undefined;
    await load();
  } catch (error) {
    message.error(error instanceof Error ? error.message : 'Assign role to user failed');
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
    message.success(`Added ${role.value.name} as a default role on ${target.name}`);
    assignTeamId.value = undefined;
    await load();
  } catch (error) {
    message.error(error instanceof Error ? error.message : 'Assign role to team failed');
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
  <Card>
    <Button type="link" style="padding-left: 0" @click="router.push({ name: 'admin-roles' })">
      ← Roles
    </Button>
    <Spin :spinning="loading">
      <Alert v-if="errorMessage" type="error" show-icon :message="errorMessage" />
      <template v-if="role">
        <Typography.Title :level="4">{{ role.displayName || role.name }}</Typography.Title>
        <Typography.Paragraph type="secondary">
          GET /api/v1/roles/{id}. Assignment uses PATCH on the user or team entity.
        </Typography.Paragraph>
        <Descriptions bordered :column="1">
          <Descriptions.Item label="Name">{{ role.name }}</Descriptions.Item>
          <Descriptions.Item label="Description">{{ role.description || '—' }}</Descriptions.Item>
          <Descriptions.Item label="Policies">
            {{ role.policies.map((p) => p.displayName || p.name).join(', ') || '—' }}
          </Descriptions.Item>
        </Descriptions>
        <Typography.Title :level="5" style="margin-top: 24px">Assign to a user</Typography.Title>
        <Space>
          <Select
            v-model:value="assignUserId"
            show-search
            placeholder="Select user"
            style="width: 280px"
            :options="users.map((u) => ({ value: u.id, label: u.displayName || u.name }))"
          />
          <Button type="primary" data-testid="assign-role-user" @click="onAssignUser">Assign</Button>
        </Space>
        <Typography.Title :level="5" style="margin-top: 24px">Add as a team default role</Typography.Title>
        <Space>
          <Select
            v-model:value="assignTeamId"
            show-search
            placeholder="Select team"
            style="width: 280px"
            :options="teams.map((t) => ({ value: t.id, label: t.displayName || t.name }))"
          />
          <Button data-testid="assign-role-team" @click="onAssignTeam">Add default role</Button>
        </Space>
        <Typography.Title :level="5" style="margin-top: 24px">Users with this role</Typography.Title>
        <Table
          row-key="id"
          :columns="columns"
          :data-source="role.users"
          :pagination="false"
          :row-class-name="() => 'role-user-row'"
        >
          <template #bodyCell="{ column, record }">
            <template v-if="column.key === 'name'">
              <a
                v-if="(record as EntityRef).id"
                href="#"
                @click.prevent="router.push({ name: 'admin-user', params: { id: (record as EntityRef).id } })"
              >
                {{ (record as EntityRef).displayName || (record as EntityRef).name }}
              </a>
              <span v-else>{{ (record as EntityRef).displayName || (record as EntityRef).name }}</span>
            </template>
          </template>
        </Table>
        <Typography.Title :level="5" style="margin-top: 24px">Teams with this default role</Typography.Title>
        <Table row-key="id" :columns="columns" :data-source="role.teams" :pagination="false">
          <template #bodyCell="{ column, record }">
            <template v-if="column.key === 'name'">
              <a
                v-if="(record as EntityRef).id"
                href="#"
                @click.prevent="router.push({ name: 'admin-team', params: { id: (record as EntityRef).id } })"
              >
                {{ (record as EntityRef).displayName || (record as EntityRef).name }}
              </a>
            </template>
          </template>
        </Table>
      </template>
    </Spin>
  </Card>
</template>
