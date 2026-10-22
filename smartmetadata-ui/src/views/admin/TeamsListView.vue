<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import {
  Alert,
  Button,
  Card,
  Checkbox,
  Form,
  Input,
  Modal,
  Select,
  Space,
  Table,
  Typography,
  message,
} from 'ant-design-vue';
import { listRoles } from '@/api/roles';
import { TEAM_TYPES, createTeam, listTeams } from '@/api/teams';
import type { AdminRole, AdminTeam } from '@/types/admin';

const router = useRouter();
const loading = ref(false);
const errorMessage = ref('');
const teams = ref<AdminTeam[]>([]);
const total = ref<number | undefined>();
const roles = ref<AdminRole[]>([]);
const createOpen = ref(false);
const creating = ref(false);
const form = reactive({
  name: '',
  teamType: 'Group',
  displayName: '',
  description: '',
  isJoinable: true,
  parentIds: [] as string[],
  defaultRoleIds: [] as string[],
});

const columns = [
  { title: 'Name', dataIndex: 'name', key: 'name' },
  { title: 'Type', dataIndex: 'teamType', key: 'teamType', width: 140 },
  { title: 'Users', key: 'userCount', width: 90 },
  { title: 'Joinable', key: 'isJoinable', width: 100 },
  { title: 'Default roles', key: 'defaultRoles' },
];

async function load(): Promise<void> {
  loading.value = true;
  errorMessage.value = '';
  try {
    const page = await listTeams({ limit: 50 });
    teams.value = page.data;
    total.value = page.total;
  } catch (error) {
    teams.value = [];
    errorMessage.value = error instanceof Error ? error.message : 'Failed to load teams';
  } finally {
    loading.value = false;
  }
}

async function onCreate(): Promise<void> {
  creating.value = true;
  try {
    const created = await createTeam({
      name: form.name.trim(),
      teamType: form.teamType,
      displayName: form.displayName.trim() || undefined,
      description: form.description.trim() || undefined,
      isJoinable: form.isJoinable,
      parents: form.parentIds,
      defaultRoles: form.defaultRoleIds,
    });
    createOpen.value = false;
    message.success(`Created team ${created.name}`);
    await load();
  } catch (error) {
    message.error(error instanceof Error ? error.message : 'Create team failed');
  } finally {
    creating.value = false;
  }
}

onMounted(() => {
  void load();
  void listRoles(100)
    .then((page) => {
      roles.value = page.data;
    })
    .catch(() => undefined);
});
</script>

<template>
  <Card>
    <Space direction="vertical" size="middle" style="width: 100%">
      <div class="admin-head">
        <div>
          <Typography.Title :level="4">Teams</Typography.Title>
          <Typography.Paragraph type="secondary">
            GET/POST /api/v1/teams. Only <code>Group</code> teams hold direct users.
          </Typography.Paragraph>
        </div>
        <Button type="primary" data-testid="create-team" @click="createOpen = true">Create team</Button>
      </div>
      <Alert v-if="errorMessage" type="error" show-icon :message="errorMessage" />
      <Table
        row-key="id"
        data-testid="admin-teams-table"
        :columns="columns"
        :data-source="teams"
        :loading="loading"
        :pagination="false"
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'name'">
            <a href="#" @click.prevent="router.push({ name: 'admin-team', params: { id: (record as AdminTeam).id } })">
              {{ (record as AdminTeam).displayName || (record as AdminTeam).name }}
            </a>
          </template>
          <template v-else-if="column.key === 'userCount'">
            {{ (record as AdminTeam).userCount ?? (record as AdminTeam).users.length }}
          </template>
          <template v-else-if="column.key === 'isJoinable'">
            {{ (record as AdminTeam).isJoinable ? 'yes' : 'no' }}
          </template>
          <template v-else-if="column.key === 'defaultRoles'">
            {{ (record as AdminTeam).defaultRoles.map((r) => r.displayName || r.name).join(', ') || '—' }}
          </template>
        </template>
      </Table>
      <Typography.Text type="secondary">{{ teams.length }} shown<template v-if="total !== undefined"> of {{ total }}</template></Typography.Text>
    </Space>
    <Modal v-model:open="createOpen" title="Create team" :confirm-loading="creating" @ok="onCreate">
      <Form layout="vertical">
        <Form.Item label="Name" required>
          <Input v-model:value="form.name" data-testid="create-team-name" />
        </Form.Item>
        <Form.Item label="Team type" required>
          <Select v-model:value="form.teamType">
            <Select.Option v-for="type in TEAM_TYPES" :key="type" :value="type">{{ type }}</Select.Option>
          </Select>
        </Form.Item>
        <Form.Item label="Display name">
          <Input v-model:value="form.displayName" />
        </Form.Item>
        <Form.Item label="Description">
          <Input.TextArea v-model:value="form.description" :rows="2" />
        </Form.Item>
        <Form.Item>
          <Checkbox v-model:checked="form.isJoinable">Users may join this team</Checkbox>
        </Form.Item>
        <Form.Item label="Parents">
          <Select v-model:value="form.parentIds" mode="multiple" allow-clear>
            <Select.Option v-for="team in teams" :key="team.id" :value="team.id">
              {{ team.displayName || team.name }}
            </Select.Option>
          </Select>
        </Form.Item>
        <Form.Item label="Default roles">
          <Select v-model:value="form.defaultRoleIds" mode="multiple" allow-clear>
            <Select.Option v-for="role in roles" :key="role.id" :value="role.id">
              {{ role.displayName || role.name }}
            </Select.Option>
          </Select>
        </Form.Item>
      </Form>
    </Modal>
  </Card>
</template>

<style scoped>
.admin-head {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  align-items: flex-start;
}
</style>
