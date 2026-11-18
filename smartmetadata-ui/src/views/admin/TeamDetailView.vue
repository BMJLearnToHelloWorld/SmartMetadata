<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import {Alert, Button, Checkbox, Descriptions, Form, Input, Select, Space, message} from 'ant-design-vue';
import SmTable from '@/components/shared/SmTable.vue';
import FormModal from '@/components/shared/FormModal.vue';
import { removeFieldPatch, setFieldPatch, type JsonPatchOp } from '@/admin/jsonPatch';
import { listRoles } from '@/api/roles';
import {
  TEAM_TYPES,
  assignTeamDefaultRolesPatch,
  getTeam,
  patchTeam,
  removeTeamUser,
  replaceTeamUsers,
} from '@/api/teams';
import { listUsers } from '@/api/users';
import EntityDetailShell from '@/features/crud/EntityDetailShell.vue';
import { entityLabel, joinRefNames } from '@/features/crud/paging';
import type { EntityBreadcrumb, EntityDetailTab } from '@/features/crud/types';
import type { AdminRole, AdminTeam, AdminUser } from '@/types/admin';
import type { OperationPermissions } from '@/api/permissions';
import { usePermissionStore } from '@/stores/permissions';
import type { EntityRef } from '@/types/api';

const props = defineProps<{ id: string }>();
const { t } = useI18n();
/**
 * Dual line for team management: isAdminUser (first line) OR an
 * EditAll grant on this team via the permission API (second line,
 * same client as the debugger). A failed query is not a grant
 * (fail closed); the server still enforces team writes.
 */
const isAdminUser = computed(() => usePermissionStore().isAdminUser);
const teamOps = ref<OperationPermissions | null>(null);
const canManageTeam = computed(
  () => isAdminUser.value || teamOps.value?.EditAll === true,
);
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

/** Order-insensitive id comparison: reordering alone is not a change. */
function sameIdSet(current: string[], next: string[]): boolean {
  if (current.length !== next.length) {
    return false;
  }
  const sortedCurrent = [...current].sort();
  const sortedNext = [...next].sort();
  return sortedCurrent.every((id, index) => id === sortedNext[index]);
}

/**
 * Ops for a trimmable text field: compare after trimming, an emptied
 * form value removes a stored value, and an already-absent value stays
 * absent without an op.
 */
function textFieldOps(path: string, current: string | undefined, formValue: string): JsonPatchOp[] {
  const next = formValue.trim() || undefined;
  const stored = current?.trim() || undefined;
  if (next === stored) {
    return [];
  }
  if (next === undefined) {
    return [removeFieldPatch(path)];
  }
  return setFieldPatch(path, current, next);
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
    teamOps.value = await usePermissionStore()
      .getEntityPermissionById('team', team.value.id)
      .catch(() => null);
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
  const current = team.value;
  if (!current) {
    return;
  }
  saving.value = true;
  try {
    // A whole-entity PUT would drop every field this form does not
    // carry (members, parents, children, policies, ...), so the edit
    // saves as a JSON Patch limited to the five fields the form owns.
    // Fields the patch never mentions keep their stored values
    // server-side.
    // ADR:2026-11-18-user-team-detail-saves-use-json-patch
    const ops: JsonPatchOp[] = [];
    ops.push(...textFieldOps('/displayName', current.displayName, form.displayName));
    ops.push(...textFieldOps('/description', current.description, form.description));
    if (form.teamType !== current.teamType) {
      ops.push(...setFieldPatch('/teamType', current.teamType, form.teamType));
    }
    // A missing stored value behaves as joinable, matching openEdit's
    // normalization, so an untouched form emits no op for it.
    if (form.isJoinable !== (current.isJoinable !== false)) {
      ops.push(...setFieldPatch('/isJoinable', current.isJoinable, form.isJoinable));
    }
    if (!sameIdSet(idsOf(current.defaultRoles), form.defaultRoleIds)) {
      ops.push(...assignTeamDefaultRolesPatch(current.defaultRoles, form.defaultRoleIds));
    }
    // Pin sends the compare() result unguarded, so an unchanged edit
    // still sends an empty patch array rather than skipping the call.
    await patchTeam(current.id, ops);
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
      <Button v-if="team && canManageTeam" data-testid="edit-team" @click="openEdit">{{ t('crud.edit') }}</Button>
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
            <Button v-if="canManageTeam" type="primary" data-testid="save-team-roles" @click="onDefaultRoles(form.defaultRoleIds)">
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
        <Button v-if="canManageTeam" type="primary" data-testid="add-team-member" @click="onAddMember">
          {{ t('admin.teams.addMember') }}
        </Button>
      </Space>
      <SmTable
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
      </SmTable>
    </template>
  </EntityDetailShell>
  <FormModal
    :open="editOpen"
    :title="t('admin.teams.editTitle')"
    :ok-text="t('crud.edit')"
    :cancel-text="t('crud.cancel')"
    :confirm-loading="saving"
    @ok="onSave" @cancel="editOpen = false">
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
  </FormModal>
</template>
