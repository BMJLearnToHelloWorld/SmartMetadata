<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { Alert, Card, Input, Space, Table, Typography } from 'ant-design-vue';
import { listRoles, searchRoles } from '@/api/roles';
import type { AdminRole } from '@/types/admin';

const router = useRouter();
const loading = ref(false);
const errorMessage = ref('');
const roles = ref<AdminRole[]>([]);
const total = ref<number | undefined>();
const query = ref('');

const columns = [
  { title: 'Name', dataIndex: 'name', key: 'name' },
  { title: 'Policies', key: 'policies' },
  { title: 'Users', key: 'users', width: 90 },
  { title: 'Teams', key: 'teams', width: 90 },
];

async function load(): Promise<void> {
  loading.value = true;
  errorMessage.value = '';
  try {
    const page = query.value.trim() ? await searchRoles(query.value.trim()) : await listRoles(100);
    roles.value = page.data;
    total.value = page.total;
  } catch (error) {
    roles.value = [];
    errorMessage.value = error instanceof Error ? error.message : 'Failed to load roles';
  } finally {
    loading.value = false;
  }
}

onMounted(() => {
  void load();
});
</script>

<template>
  <Card>
    <Space direction="vertical" size="middle" style="width: 100%">
      <div>
        <Typography.Title :level="4">Roles</Typography.Title>
        <Typography.Paragraph type="secondary">
          GET /api/v1/roles and GET /api/v1/roles/search. Role assignment happens on the user/team
          entities; this page does not invent an authorization engine.
        </Typography.Paragraph>
      </div>
      <Input.Search
        v-model:value="query"
        placeholder="Search roles"
        allow-clear
        style="width: 280px"
        @search="load"
      />
      <Alert v-if="errorMessage" type="error" show-icon :message="errorMessage" />
      <Table
        row-key="id"
        data-testid="admin-roles-table"
        :columns="columns"
        :data-source="roles"
        :loading="loading"
        :pagination="false"
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'name'">
            <a href="#" @click.prevent="router.push({ name: 'admin-role', params: { id: (record as AdminRole).id } })">
              {{ (record as AdminRole).displayName || (record as AdminRole).name }}
            </a>
          </template>
          <template v-else-if="column.key === 'policies'">
            {{ (record as AdminRole).policies.map((p) => p.displayName || p.name).join(', ') || '—' }}
          </template>
          <template v-else-if="column.key === 'users'">
            {{ (record as AdminRole).users.length }}
          </template>
          <template v-else-if="column.key === 'teams'">
            {{ (record as AdminRole).teams.length }}
          </template>
        </template>
      </Table>
      <Typography.Text type="secondary">{{ roles.length }} shown<template v-if="total !== undefined"> of {{ total }}</template></Typography.Text>
    </Space>
  </Card>
</template>
