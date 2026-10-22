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
  Tag,
  Typography,
  message,
} from 'ant-design-vue';
import { listRoles } from '@/api/roles';
import { listTeams } from '@/api/teams';
import { createUser, listUsers, searchUsers } from '@/api/users';
import type { AdminRole, AdminTeam, AdminUser, IncludeFilter } from '@/types/admin';

const router = useRouter();
const loading = ref(false);
const errorMessage = ref('');
const users = ref<AdminUser[]>([]);
const total = ref<number | undefined>();
const after = ref<string | undefined>();
const query = ref('');
const isAdminOnly = ref(false);
const isBotOnly = ref(false);
const include = ref<IncludeFilter>('non-deleted');
const createOpen = ref(false);
const creating = ref(false);
const teams = ref<AdminTeam[]>([]);
const roles = ref<AdminRole[]>([]);
const createForm = reactive({
  name: '',
  email: '',
  displayName: '',
  description: '',
  isAdmin: false,
  password: '',
  confirmPassword: '',
  teamIds: [] as string[],
  roleIds: [] as string[],
});

const columns = [
  { title: 'Name', dataIndex: 'name', key: 'name' },
  { title: 'Email', dataIndex: 'email', key: 'email' },
  { title: 'Admin', key: 'isAdmin', width: 90 },
  { title: 'Bot', key: 'isBot', width: 80 },
  { title: 'Teams', key: 'teams' },
  { title: 'Roles', key: 'roles' },
];

async function loadUsers(): Promise<void> {
  loading.value = true;
  errorMessage.value = '';
  try {
    if (query.value.trim()) {
      const page = await searchUsers(query.value.trim());
      users.value = page.data;
      total.value = page.total;
      after.value = undefined;
    } else {
      const page = await listUsers({
        isAdmin: isAdminOnly.value ? true : undefined,
        isBot: isBotOnly.value ? true : undefined,
        include: include.value,
      });
      users.value = page.data;
      total.value = page.total;
      after.value = page.after;
    }
  } catch (error) {
    users.value = [];
    errorMessage.value = error instanceof Error ? error.message : 'Failed to load users';
  } finally {
    loading.value = false;
  }
}

async function loadLookups(): Promise<void> {
  const [teamPage, rolePage] = await Promise.all([listTeams({ limit: 100 }), listRoles(100)]);
  teams.value = teamPage.data;
  roles.value = rolePage.data;
}

function openUser(user: AdminUser): void {
  if (!user.id) {
    return;
  }
  void router.push({ name: 'admin-user', params: { id: user.id } });
}

async function onCreate(): Promise<void> {
  if (createForm.password !== createForm.confirmPassword) {
    message.error('Password and confirmation do not match');
    return;
  }
  creating.value = true;
  try {
    const created = await createUser({
      name: createForm.name.trim(),
      email: createForm.email.trim(),
      displayName: createForm.displayName.trim() || undefined,
      description: createForm.description.trim() || undefined,
      isAdmin: createForm.isAdmin,
      password: createForm.password || undefined,
      confirmPassword: createForm.confirmPassword || undefined,
      createPasswordType: createForm.password ? 'ADMIN_CREATE' : undefined,
      teams: createForm.teamIds,
      roles: createForm.roleIds,
    });
    createOpen.value = false;
    message.success(`Created user ${created.name}`);
    await loadUsers();
  } catch (error) {
    message.error(error instanceof Error ? error.message : 'Create user failed');
  } finally {
    creating.value = false;
  }
}

onMounted(() => {
  void loadUsers();
  void loadLookups().catch(() => undefined);
});
</script>

<template>
  <Card>
    <Space direction="vertical" size="middle" style="width: 100%">
      <div class="admin-head">
        <div>
          <Typography.Title :level="4">Users</Typography.Title>
          <Typography.Paragraph type="secondary">
            GET /api/v1/users (filters) and GET /api/v1/search/query?index=user (search). Create is
            POST /api/v1/users.
          </Typography.Paragraph>
        </div>
        <Button type="primary" data-testid="create-user" @click="createOpen = true">Create user</Button>
      </div>
      <Space wrap>
        <Input.Search
          v-model:value="query"
          data-testid="user-search"
          placeholder="Search users (user index)"
          allow-clear
          style="width: 280px"
          @search="loadUsers"
        />
        <Checkbox v-model:checked="isAdminOnly" @change="loadUsers">Admins</Checkbox>
        <Checkbox v-model:checked="isBotOnly" @change="loadUsers">Bots</Checkbox>
        <Select v-model:value="include" style="width: 160px" @change="loadUsers">
          <Select.Option value="non-deleted">Active</Select.Option>
          <Select.Option value="deleted">Deactivated</Select.Option>
          <Select.Option value="all">All</Select.Option>
        </Select>
        <Button @click="loadUsers">Refresh</Button>
      </Space>
      <Alert v-if="errorMessage" type="error" show-icon :message="errorMessage" />
      <Table
        row-key="id"
        data-testid="admin-users-table"
        :columns="columns"
        :data-source="users"
        :loading="loading"
        :pagination="false"
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'name'">
            <a
              href="#"
              :data-testid="`user-row-${(record as AdminUser).id}`"
              @click.prevent="openUser(record as AdminUser)"
            >
              {{ (record as AdminUser).displayName || (record as AdminUser).name }}
            </a>
          </template>
          <template v-else-if="column.key === 'isAdmin'">
            <Tag v-if="(record as AdminUser).isAdmin" color="blue">admin</Tag>
            <Typography.Text v-else type="secondary">—</Typography.Text>
          </template>
          <template v-else-if="column.key === 'isBot'">
            <Tag v-if="(record as AdminUser).isBot">bot</Tag>
            <Typography.Text v-else type="secondary">—</Typography.Text>
          </template>
          <template v-else-if="column.key === 'teams'">
            {{ (record as AdminUser).teams.map((t) => t.displayName || t.name).join(', ') || '—' }}
          </template>
          <template v-else-if="column.key === 'roles'">
            {{ (record as AdminUser).roles.map((r) => r.displayName || r.name).join(', ') || '—' }}
          </template>
        </template>
      </Table>
      <Typography.Text type="secondary">
        {{ users.length }} shown<template v-if="total !== undefined"> of {{ total }}</template>
        <template v-if="after"> · more pages available via cursor</template>
      </Typography.Text>
    </Space>
    <Modal
      v-model:open="createOpen"
      title="Create user"
      ok-text="Create"
      :confirm-loading="creating"
      @ok="onCreate"
    >
      <Form layout="vertical">
        <Form.Item label="Name" required>
          <Input v-model:value="createForm.name" data-testid="create-user-name" />
        </Form.Item>
        <Form.Item label="Email" required>
          <Input v-model:value="createForm.email" data-testid="create-user-email" />
        </Form.Item>
        <Form.Item label="Display name">
          <Input v-model:value="createForm.displayName" />
        </Form.Item>
        <Form.Item label="Description">
          <Input.TextArea v-model:value="createForm.description" :rows="2" />
        </Form.Item>
        <Form.Item>
          <Checkbox v-model:checked="createForm.isAdmin">Administrator</Checkbox>
        </Form.Item>
        <Form.Item label="Password (ADMIN_CREATE)">
          <Input.Password v-model:value="createForm.password" />
        </Form.Item>
        <Form.Item label="Confirm password">
          <Input.Password v-model:value="createForm.confirmPassword" />
        </Form.Item>
        <Form.Item label="Teams">
          <Select v-model:value="createForm.teamIds" mode="multiple" allow-clear>
            <Select.Option v-for="team in teams" :key="team.id" :value="team.id">
              {{ team.displayName || team.name }}
            </Select.Option>
          </Select>
        </Form.Item>
        <Form.Item label="Roles">
          <Select v-model:value="createForm.roleIds" mode="multiple" allow-clear>
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
