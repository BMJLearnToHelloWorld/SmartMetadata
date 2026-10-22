<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { onMounted, reactive, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import {
  Alert,
  Button,
  Card,
  Checkbox,
  Descriptions,
  Form,
  Input,
  Modal,
  Select,
  Space,
  Spin,
  Tag,
  Typography,
  message,
} from 'ant-design-vue';
import { listRoles } from '@/api/roles';
import { listTeams } from '@/api/teams';
import { assignUserRolesPatch, deactivateUser, getUser, patchUser, restoreUser, updateUser } from '@/api/users';
import type { AdminRole, AdminTeam, AdminUser } from '@/types/admin';

const props = defineProps<{ id: string }>();
const router = useRouter();
const loading = ref(false);
const errorMessage = ref('');
const user = ref<AdminUser | null>(null);
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

async function load(): Promise<void> {
  loading.value = true;
  errorMessage.value = '';
  try {
    user.value = await getUser(props.id, 'all');
    editForm.roleIds = idsOf(user.value.roles);
    editForm.teamIds = idsOf(user.value.teams);
  } catch (error) {
    user.value = null;
    errorMessage.value = error instanceof Error ? error.message : 'Failed to load user';
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
    message.success('User updated');
    await load();
  } catch (error) {
    message.error(error instanceof Error ? error.message : 'Update failed');
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
    message.success('User deactivated (soft-deleted)');
    await load();
  } catch (error) {
    message.error(error instanceof Error ? error.message : 'Deactivate failed');
  }
}

async function onRestore(): Promise<void> {
  if (!user.value) {
    return;
  }
  try {
    await restoreUser(user.value.id);
    message.success('User restored');
    await load();
  } catch (error) {
    message.error(error instanceof Error ? error.message : 'Restore failed');
  }
}

async function onAssignRoles(roleIds: string[]): Promise<void> {
  if (!user.value) {
    return;
  }
  try {
    await patchUser(user.value.id, assignUserRolesPatch(user.value.roles, roleIds));
    message.success('Roles updated');
    await load();
  } catch (error) {
    message.error(error instanceof Error ? error.message : 'Role assignment failed');
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
  <Card>
    <Button type="link" style="padding-left: 0" @click="router.push({ name: 'admin-users' })">
      ← Users
    </Button>
    <Spin :spinning="loading">
      <Alert v-if="errorMessage" type="error" show-icon :message="errorMessage" />
      <template v-if="user">
        <Space class="admin-head">
          <Typography.Title :level="4">{{ user.displayName || user.name }}</Typography.Title>
          <Space>
            <Button data-testid="edit-user" @click="openEdit">Edit</Button>
            <Button v-if="!user.deleted" danger data-testid="deactivate-user" @click="onDeactivate">
              Deactivate
            </Button>
            <Button v-else type="primary" data-testid="restore-user" @click="onRestore">Restore</Button>
          </Space>
        </Space>
        <Typography.Paragraph type="secondary">
          GET /api/v1/users/{id}. Deactivate is DELETE (soft). Restore is PUT /api/v1/users/restore.
        </Typography.Paragraph>
        <Descriptions bordered :column="2">
          <Descriptions.Item label="Name">{{ user.name }}</Descriptions.Item>
          <Descriptions.Item label="Email">{{ user.email || '—' }}</Descriptions.Item>
          <Descriptions.Item label="Admin">
            <Tag v-if="user.isAdmin" color="blue">admin</Tag>
            <span v-else>—</span>
          </Descriptions.Item>
          <Descriptions.Item label="Bot">
            <Tag v-if="user.isBot">bot</Tag>
            <span v-else>—</span>
          </Descriptions.Item>
          <Descriptions.Item label="Status">
            <Tag :color="user.deleted ? 'red' : 'green'">{{ user.deleted ? 'deactivated' : 'active' }}</Tag>
          </Descriptions.Item>
          <Descriptions.Item label="Description" :span="2">{{ user.description || '—' }}</Descriptions.Item>
          <Descriptions.Item label="Teams" :span="2">
            {{ user.teams.map((t) => t.displayName || t.name).join(', ') || '—' }}
          </Descriptions.Item>
          <Descriptions.Item label="Roles" :span="2">
            {{ user.roles.map((r) => r.displayName || r.name).join(', ') || '—' }}
          </Descriptions.Item>
        </Descriptions>
        <Typography.Title :level="5" style="margin-top: 24px">Assign roles</Typography.Title>
        <Typography.Paragraph type="secondary">
          PATCH /api/v1/users/{id} with RFC 6902 replace of <code>/roles</code>.
        </Typography.Paragraph>
        <Space direction="vertical" style="width: 100%">
          <Select
            v-model:value="editForm.roleIds"
            mode="multiple"
            style="width: 100%"
            placeholder="Select roles"
            data-testid="user-roles-select"
          >
            <Select.Option v-for="role in roles" :key="role.id" :value="role.id">
              {{ role.displayName || role.name }}
            </Select.Option>
          </Select>
          <Button type="primary" data-testid="save-user-roles" @click="onAssignRoles(editForm.roleIds)">
            Save roles
          </Button>
        </Space>
      </template>
    </Spin>
    <Modal v-model:open="editOpen" title="Edit user" :confirm-loading="saving" @ok="onSave">
      <Form layout="vertical">
        <Form.Item label="Display name">
          <Input v-model:value="editForm.displayName" />
        </Form.Item>
        <Form.Item label="Email">
          <Input v-model:value="editForm.email" />
        </Form.Item>
        <Form.Item label="Description">
          <Input.TextArea v-model:value="editForm.description" :rows="2" />
        </Form.Item>
        <Form.Item>
          <Checkbox v-model:checked="editForm.isAdmin">Administrator</Checkbox>
        </Form.Item>
        <Form.Item label="Teams">
          <Select v-model:value="editForm.teamIds" mode="multiple" allow-clear>
            <Select.Option v-for="team in teams" :key="team.id" :value="team.id">
              {{ team.displayName || team.name }}
            </Select.Option>
          </Select>
        </Form.Item>
        <Form.Item label="Roles">
          <Select v-model:value="editForm.roleIds" mode="multiple" allow-clear>
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
  width: 100%;
  margin-bottom: 8px;
}
</style>
