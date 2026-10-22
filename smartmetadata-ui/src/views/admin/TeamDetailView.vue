<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue';
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
  Table,
  Typography,
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
import type { AdminRole, AdminTeam, AdminUser } from '@/types/admin';
import type { EntityRef } from '@/types/api';

const props = defineProps<{ id: string }>();
const router = useRouter();
const loading = ref(false);
const errorMessage = ref('');
const team = ref<AdminTeam | null>(null);
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

const memberColumns = [
  { title: 'Name', dataIndex: 'name', key: 'name' },
  { title: 'Type', dataIndex: 'type', key: 'type', width: 100 },
  { title: '', key: 'actions', width: 120 },
];

async function load(): Promise<void> {
  loading.value = true;
  errorMessage.value = '';
  try {
    team.value = await getTeam(props.id, 'all');
    form.defaultRoleIds = idsOf(team.value.defaultRoles);
  } catch (error) {
    team.value = null;
    errorMessage.value = error instanceof Error ? error.message : 'Failed to load team';
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
    message.success('Team updated');
    await load();
  } catch (error) {
    message.error(error instanceof Error ? error.message : 'Update failed');
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
    message.info('User is already a member');
    return;
  }
  try {
    await replaceTeamUsers(team.value.id, [...existing, addUserId.value]);
    addUserId.value = undefined;
    message.success('Member added');
    await load();
  } catch (error) {
    message.error(error instanceof Error ? error.message : 'Add member failed');
  }
}

async function onRemoveMember(user: EntityRef): Promise<void> {
  if (!team.value || !user.id) {
    return;
  }
  try {
    await removeTeamUser(team.value.id, user.id);
    message.success('Member removed');
    await load();
  } catch (error) {
    message.error(error instanceof Error ? error.message : 'Remove member failed');
  }
}

async function onDefaultRoles(roleIds: string[]): Promise<void> {
  if (!team.value) {
    return;
  }
  try {
    await patchTeam(team.value.id, assignTeamDefaultRolesPatch(team.value.defaultRoles, roleIds));
    message.success('Default roles updated');
    await load();
  } catch (error) {
    message.error(error instanceof Error ? error.message : 'Default roles update failed');
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
  <Card>
    <Button type="link" style="padding-left: 0" @click="router.push({ name: 'admin-teams' })">
      ← Teams
    </Button>
    <Spin :spinning="loading">
      <Alert v-if="errorMessage" type="error" show-icon :message="errorMessage" />
      <template v-if="team">
        <Space class="admin-head">
          <Typography.Title :level="4">{{ team.displayName || team.name }}</Typography.Title>
          <Button data-testid="edit-team" @click="openEdit">Edit</Button>
        </Space>
        <Typography.Paragraph type="secondary">
          GET /api/v1/teams/{id}. Membership: PUT /api/v1/teams/{id}/users and DELETE
          /api/v1/teams/{id}/users/{userId}.
        </Typography.Paragraph>
        <Descriptions bordered :column="2">
          <Descriptions.Item label="Name">{{ team.name }}</Descriptions.Item>
          <Descriptions.Item label="Type">{{ team.teamType }}</Descriptions.Item>
          <Descriptions.Item label="Joinable">{{ team.isJoinable ? 'yes' : 'no' }}</Descriptions.Item>
          <Descriptions.Item label="Parents">
            {{ team.parents.map((p) => p.displayName || p.name).join(', ') || '—' }}
          </Descriptions.Item>
          <Descriptions.Item label="Description" :span="2">{{ team.description || '—' }}</Descriptions.Item>
          <Descriptions.Item label="Policies" :span="2">
            {{ team.policies.map((p) => p.displayName || p.name).join(', ') || '—' }}
          </Descriptions.Item>
        </Descriptions>
        <Typography.Title :level="5" style="margin-top: 24px">Default roles</Typography.Title>
        <Space direction="vertical" style="width: 100%">
        <Select
          v-model:value="form.defaultRoleIds"
          mode="multiple"
          style="width: 100%"
        >
          <Select.Option v-for="role in roles" :key="role.id" :value="role.id">
            {{ role.displayName || role.name }}
          </Select.Option>
        </Select>
          <Button type="primary" data-testid="save-team-roles" @click="onDefaultRoles(form.defaultRoleIds)">
            Save default roles
          </Button>
        </Space>
        <Typography.Title :level="5" style="margin-top: 24px">Members</Typography.Title>
        <Alert
          v-if="!canHoldUsers"
          type="info"
          show-icon
          :message="`${team.teamType} teams do not hold direct users. Members listed here are inherited from descendant Groups.`"
          style="margin-bottom: 12px"
        />
        <Space v-if="canHoldUsers" style="margin-bottom: 12px">
          <Select
            v-model:value="addUserId"
            show-search
            placeholder="Select a user to add"
            style="width: 280px"
            option-filter-prop="label"
            :options="users.map((u) => ({ value: u.id, label: `${u.displayName || u.name} <${u.email || ''}>` }))"
          />
          <Button type="primary" data-testid="add-team-member" @click="onAddMember">Add member</Button>
        </Space>
        <Table row-key="id" :columns="memberColumns" :data-source="team.users" :pagination="false">
          <template #bodyCell="{ column, record }">
            <template v-if="column.key === 'name'">
              {{ (record as EntityRef).displayName || (record as EntityRef).name }}
            </template>
            <template v-else-if="column.key === 'actions'">
              <Button
                v-if="canHoldUsers && (record as EntityRef).id"
                type="link"
                danger
                @click="onRemoveMember(record as EntityRef)"
              >
                Remove
              </Button>
            </template>
          </template>
        </Table>
      </template>
    </Spin>
    <Modal v-model:open="editOpen" title="Edit team" :confirm-loading="saving" @ok="onSave">
      <Form layout="vertical">
        <Form.Item label="Display name">
          <Input v-model:value="form.displayName" />
        </Form.Item>
        <Form.Item label="Team type">
          <Select v-model:value="form.teamType">
            <Select.Option v-for="type in TEAM_TYPES" :key="type" :value="type">{{ type }}</Select.Option>
          </Select>
        </Form.Item>
        <Form.Item label="Description">
          <Input.TextArea v-model:value="form.description" :rows="2" />
        </Form.Item>
        <Form.Item>
          <Checkbox v-model:checked="form.isJoinable">Users may join this team</Checkbox>
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
