<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import {Alert, Button, Checkbox, Descriptions, Form, Input, Popconfirm, Select, Space, Tag, message} from 'ant-design-vue';
import FormModal from '@/components/shared/FormModal.vue';
import SmTable from '@/components/shared/SmTable.vue';
import { listRoles } from '@/api/roles';
import { listTeams } from '@/api/teams';
import {
  JWT_TOKEN_EXPIRY_OPTIONS,
  assignUserRolesPatch,
  createPersonalToken,
  deactivateUser,
  generateUserToken,
  getUser,
  listPersonalTokens,
  patchUser,
  restoreUser,
  revokePersonalTokens,
  updateUser,
  type JwtTokenExpiry,
  type PersonalAccessToken,
} from '@/api/users';
import EntityDetailShell from '@/features/crud/EntityDetailShell.vue';
import { entityLabel, joinRefNames } from '@/features/crud/paging';
import MyPermissionsPanel from '@/views/admin/MyPermissionsPanel.vue';
import type { EntityBreadcrumb, EntityDetailTab } from '@/features/crud/types';
import type { AdminRole, AdminTeam, AdminUser } from '@/types/admin';
import { useAuthStore } from '@/stores/auth';
import { usePermissionStore } from '@/stores/permissions';

const props = defineProps<{ id: string }>();
const { t } = useI18n();
/** Official Users gating line: edit/deactivate/restore need an admin. */
const isAdminUser = computed(() => usePermissionStore().isAdminUser);
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

const isOwnProfile = computed(() => useAuthStore().user?.id === props.id);
const showTokensTab = computed(() => isOwnProfile.value || isAdminUser.value);
const tabs = computed<EntityDetailTab[]>(() => {
  const base: EntityDetailTab[] = [
    { key: 'overview', label: t('crud.overview'), testId: 'user-tab-overview' },
    { key: 'roles', label: t('admin.users.rolesTab'), testId: 'user-tab-roles' },
  ];
  if (showTokensTab.value) {
    base.push({ key: 'tokens', label: t('tokens.title'), testId: 'user-tab-tokens' });
  }
  // Self-service permissions: the own profile only. Other users'
  // profiles never show this tab — admins use the debugger page.
  if (isOwnProfile.value) {
    base.push({ key: 'permissions', label: t('permissionDebugger.myPermissions'), testId: 'user-tab-permissions' });
  }
  return base;
});

// Personal access tokens: the profile page IS the product's profile view
// (AppShell routes profile to admin-user), so both PAT landings live here.
const tokens = ref<PersonalAccessToken[]>([]);
const tokensError = ref('');
const createdSecret = ref('');
const newTokenName = ref('');
const newTokenExpiry = ref<JwtTokenExpiry>('30');
const adminExpiry = ref<JwtTokenExpiry>('30');
const adminGeneratedSecret = ref('');

const tokenColumns = computed(() => [
  { title: t('tokens.name'), dataIndex: 'tokenName', key: 'tokenName' },
  { title: t('tokens.type'), dataIndex: 'tokenType', key: 'tokenType' },
  { title: t('tokens.expiryDate'), dataIndex: 'expiryDate', key: 'expiryDate' },
  { title: t('tokens.actions'), dataIndex: 'actions', key: 'actions' },
]);

const expiryLabel = (value: JwtTokenExpiry): string => {
  if (value === 'OneHour') {
    return t('tokens.expiryOneHour');
  }
  if (value === 'Unlimited') {
    return t('tokens.expiryUnlimited');
  }
  return t('tokens.expiryDays', { days: value });
};

async function loadTokens(): Promise<void> {
  if (!isOwnProfile.value) {
    return;
  }
  try {
    const page = await listPersonalTokens();
    tokens.value = page.data;
    tokensError.value = '';
  } catch (error) {
    tokens.value = [];
    tokensError.value = error instanceof Error ? error.message : t('tokens.loadFailed');
  }
}

async function onCreateToken(): Promise<void> {
  if (!newTokenName.value.trim()) {
    return;
  }
  try {
    const created = await createPersonalToken(newTokenName.value.trim(), newTokenExpiry.value);
    createdSecret.value = created?.secret ?? '';
    newTokenName.value = '';
    await loadTokens();
    message.success(t('tokens.created'));
  } catch (error) {
    message.error(error instanceof Error ? error.message : t('tokens.createFailed'));
  }
}

async function onRevokeToken(token: PersonalAccessToken): Promise<void> {
  try {
    await revokePersonalTokens([token.token]);
    await loadTokens();
    message.success(t('tokens.revoked'));
  } catch (error) {
    message.error(error instanceof Error ? error.message : t('tokens.revokeFailed'));
  }
}

async function onGenerateAdminToken(): Promise<void> {
  if (!user.value?.id) {
    return;
  }
  try {
    const created = await generateUserToken(user.value.id, adminExpiry.value);
    adminGeneratedSecret.value = created?.secret ?? '';
    message.success(t('tokens.generated'));
  } catch (error) {
    message.error(error instanceof Error ? error.message : t('tokens.generateFailed'));
  }
}

async function onRevokeAllTokens(): Promise<void> {
  if (!user.value?.name) {
    return;
  }
  try {
    await revokePersonalTokens([], { username: user.value.name, removeAll: true });
    message.success(t('tokens.revokedAll'));
  } catch (error) {
    message.error(error instanceof Error ? error.message : t('tokens.revokeFailed'));
  }
}

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

watch(activeTab, (tab) => {
  if (tab === 'tokens') {
    void loadTokens();
  }
});
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
      <Button v-if="user && isAdminUser" data-testid="edit-user" @click="openEdit">{{ t('crud.edit') }}</Button>
      <Button v-if="user && !user.deleted && isAdminUser" danger data-testid="deactivate-user" @click="onDeactivate">
        {{ t('admin.users.deactivate') }}
      </Button>
      <Button v-if="user?.deleted && isAdminUser" type="primary" data-testid="restore-user" @click="onRestore">
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
    <template #tokens>
      <template v-if="isOwnProfile">
        <p class="entity-detail__tab-lead">{{ t('tokens.lead') }}</p>
        <Space wrap>
          <Input
            v-model:value="newTokenName"
            style="width: 240px"
            :placeholder="t('tokens.namePlaceholder')"
            data-testid="pat-name"
          />
          <Select v-model:value="newTokenExpiry" style="width: 160px" data-testid="pat-expiry">
            <Select.Option v-for="option in JWT_TOKEN_EXPIRY_OPTIONS" :key="option" :value="option">
              {{ expiryLabel(option) }}
            </Select.Option>
          </Select>
          <Button type="primary" data-testid="pat-generate" :disabled="!newTokenName.trim()" @click="onCreateToken">
            {{ t('tokens.generate') }}
          </Button>
        </Space>
        <Alert
          v-if="createdSecret"
          type="success"
          show-icon
          style="margin-top: 12px"
          :message="t('tokens.createdSecret')"
          :description="createdSecret"
          data-testid="pat-created-secret"
        />
        <Alert v-if="tokensError" type="error" show-icon style="margin-top: 12px" :message="tokensError" />
        <Empty v-else-if="!tokens.length" style="margin-top: 12px" data-testid="pat-empty" :description="t('tokens.empty')" />
        <SmTable
          v-else
          style="margin-top: 12px"
          row-key="token"
          test-id="pat-table"
          :columns="tokenColumns"
          :data-source="tokens"
          :pagination="false"
          size="small"
        >
          <template #bodyCell="{ column, record }: { column: { key: string }; record: PersonalAccessToken }">
            <template v-if="column.key === 'actions'">
              <Popconfirm :title="t('tokens.revokeConfirm')" @confirm="onRevokeToken(record)">
                <Button danger size="small" :data-testid="`pat-revoke-${record.tokenName ?? record.token}`">
                  {{ t('tokens.revoke') }}
                </Button>
              </Popconfirm>
            </template>
          </template>
        </SmTable>
      </template>
      <template v-if="isAdminUser && !isOwnProfile">
        <p class="entity-detail__tab-lead">{{ t('tokens.adminLead') }}</p>
        <Space wrap>
          <Select v-model:value="adminExpiry" style="width: 160px" data-testid="pat-admin-expiry">
            <Select.Option v-for="option in JWT_TOKEN_EXPIRY_OPTIONS" :key="option" :value="option">
              {{ expiryLabel(option) }}
            </Select.Option>
          </Select>
          <Button type="primary" data-testid="pat-admin-generate" @click="onGenerateAdminToken">
            {{ t('tokens.generate') }}
          </Button>
          <Popconfirm :title="t('tokens.revokeAllConfirm')" @confirm="onRevokeAllTokens">
            <Button danger data-testid="pat-revoke-all">{{ t('tokens.revokeAll') }}</Button>
          </Popconfirm>
        </Space>
        <Alert
          v-if="adminGeneratedSecret"
          type="success"
          show-icon
          style="margin-top: 12px"
          :message="t('tokens.createdSecret')"
          :description="adminGeneratedSecret"
          data-testid="pat-admin-secret"
        />
      </template>
    </template>
    <template #permissions>
      <template v-if="isOwnProfile">
        <p class="entity-detail__tab-lead">{{ t('permissionDebugger.myPermissionsLead') }}</p>
        <MyPermissionsPanel :active="activeTab === 'permissions'" />
      </template>
    </template>
  </EntityDetailShell>
  <FormModal
    :open="editOpen"
    :title="t('admin.users.editTitle')"
    :ok-text="t('crud.edit')"
    :cancel-text="t('crud.cancel')"
    :confirm-loading="saving"
    @ok="onSave" @cancel="editOpen = false">
    <Form layout="vertical">
      <Form.Item :label="t('crud.displayName')" :extra="t('crud.displayNameHelp')">
        <Input v-model:value="editForm.displayName" />
      </Form.Item>
      <Form.Item :label="t('crud.email')">
        <Input v-model:value="editForm.email" />
      </Form.Item>
      <Form.Item :label="t('crud.description')" :extra="t('crud.descriptionHelp')">
        <Input.TextArea v-model:value="editForm.description" :rows="2" />
      </Form.Item>
      <Form.Item>
        <Checkbox v-model:checked="editForm.isAdmin">{{ t('admin.users.administrator') }}</Checkbox>
      </Form.Item>
      <Form.Item :label="t('admin.users.teams')" :extra="t('admin.users.teamsHelp')">
        <Select v-model:value="editForm.teamIds" mode="multiple" allow-clear>
          <Select.Option v-for="team in teams" :key="team.id" :value="team.id">
            {{ entityLabel(team) }}
          </Select.Option>
        </Select>
      </Form.Item>
      <Form.Item :label="t('admin.users.roles')" :extra="t('admin.users.rolesHelp')">
        <Select v-model:value="editForm.roleIds" mode="multiple" allow-clear>
          <Select.Option v-for="role in roles" :key="role.id" :value="role.id">
            {{ entityLabel(role) }}
          </Select.Option>
        </Select>
      </Form.Item>
    </Form>
  </FormModal>
</template>

<style scoped>
.entity-detail__tab-lead {
  color: var(--sm-text-secondary);
  margin-bottom: 12px;
}
</style>
