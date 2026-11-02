<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import {Button, Checkbox, Form, Input, Select, message} from 'ant-design-vue';
import FormModal from '@/components/shared/FormModal.vue';
import { listRoles } from '@/api/roles';
import { listTeams } from '@/api/teams';
import { createUser, listUsers, searchUsers } from '@/api/users';
import EntityListShell from '@/features/crud/EntityListShell.vue';
import { requiredField } from '@/features/crud/formRules';
import {
  DEFAULT_PAGE_SIZE,
  canGoNext,
  canGoNextOffset,
  canGoPrev,
  canGoPrevOffset,
  createCursorPager,
  createOffsetPager,
  entityLabel,
  goNext,
  goNextOffset,
  goPrev,
  goPrevOffset,
  joinRefNames,
  resetCursor,
  resetOffset,
  type CursorPager,
  type OffsetPager,
} from '@/features/crud/paging';
import type { EntityListColumn } from '@/features/crud/types';
import type { AdminRole, AdminTeam, AdminUser, IncludeFilter } from '@/types/admin';

const { t } = useI18n();
const router = useRouter();
const loading = ref(false);
const errorMessage = ref('');
const users = ref<AdminUser[]>([]);
const total = ref<number | undefined>();
const pageAfter = ref<string | undefined>();
const cursor = ref<CursorPager>(createCursorPager());
const offset = ref<OffsetPager>(createOffsetPager());
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

const columns = computed<EntityListColumn[]>(() => [
  { title: t('crud.name'), dataIndex: 'name', key: 'name' },
  { title: t('crud.email'), dataIndex: 'email', key: 'email' },
  { title: t('admin.users.admin'), key: 'isAdmin', width: 90 },
  { title: t('admin.users.bot'), key: 'isBot', width: 80 },
  { title: t('admin.users.teams'), key: 'teams' },
  { title: t('admin.users.roles'), key: 'roles' },
]);

const searching = computed(() => query.value.trim().length > 0);
const hasNext = computed(() =>
  searching.value
    ? canGoNextOffset(offset.value, users.value.length, total.value)
    : canGoNext(pageAfter.value),
);
const hasPrev = computed(() => (searching.value ? canGoPrevOffset(offset.value) : canGoPrev(cursor.value)));

function resetPaging(): void {
  cursor.value = resetCursor();
  offset.value = resetOffset();
}

async function loadUsers(): Promise<void> {
  loading.value = true;
  errorMessage.value = '';
  try {
    if (searching.value) {
      const page = await searchUsers(query.value.trim(), offset.value.from, offset.value.size);
      users.value = page.data;
      total.value = page.total;
      pageAfter.value = undefined;
    } else {
      const page = await listUsers({
        limit: DEFAULT_PAGE_SIZE,
        after: cursor.value.after,
        isAdmin: isAdminOnly.value ? true : undefined,
        isBot: isBotOnly.value ? true : undefined,
        include: include.value,
      });
      users.value = page.data;
      total.value = page.total;
      pageAfter.value = page.after;
    }
  } catch (error) {
    users.value = [];
    errorMessage.value = error instanceof Error ? error.message : t('crud.loadFailed');
  } finally {
    loading.value = false;
  }
}

function onSearch(): void {
  resetPaging();
  void loadUsers();
}

function onFilterChange(): void {
  resetPaging();
  void loadUsers();
}

function onNext(): void {
  if (searching.value) {
    offset.value = goNextOffset(offset.value);
  } else if (pageAfter.value) {
    cursor.value = goNext(cursor.value, pageAfter.value);
  }
  void loadUsers();
}

function onPrev(): void {
  if (searching.value) {
    offset.value = goPrevOffset(offset.value);
  } else {
    cursor.value = goPrev(cursor.value);
  }
  void loadUsers();
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
    message.error(t('admin.users.passwordMismatch'));
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
    message.success(t('admin.users.created', { name: created.name }));
    await loadUsers();
  } catch (error) {
    message.error(error instanceof Error ? error.message : t('crud.createFailed'));
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
  <EntityListShell
    :title="t('admin.users.title')"
    :lead="t('admin.users.lead')"
    :loading="loading"
    :error="errorMessage"
    :columns="columns"
    :data-source="users"
    table-test-id="admin-users-table"
    show-row-actions
    show-edit-action
    show-search
    :search-value="query"
    :search-placeholder="t('admin.users.searchPlaceholder')"
    :total="total"
    :has-next="hasNext"
    :has-prev="hasPrev"
    @update:search-value="query = $event"
    @search="onSearch"
    @refresh="loadUsers"
    @next="onNext"
    @prev="onPrev"
    @view="openUser($event as AdminUser)"
    @edit="openUser($event as AdminUser)"
  >
    <template #actions>
      <Button type="primary" data-testid="create-user" @click="createOpen = true">
        {{ t('admin.users.create') }}
      </Button>
    </template>
    <template #filters>
      <Checkbox v-model:checked="isAdminOnly" @change="onFilterChange">{{ t('admin.users.admins') }}</Checkbox>
      <Checkbox v-model:checked="isBotOnly" @change="onFilterChange">{{ t('admin.users.bots') }}</Checkbox>
      <Select v-model:value="include" style="width: 160px" @change="onFilterChange">
        <Select.Option value="non-deleted">{{ t('crud.includeActive') }}</Select.Option>
        <Select.Option value="deleted">{{ t('crud.includeDeleted') }}</Select.Option>
        <Select.Option value="all">{{ t('crud.includeAll') }}</Select.Option>
      </Select>
    </template>
    <template #bodyCell="{ column, record }">
      <template v-if="column.key === 'name'">
        <a
          href="#"
          :data-testid="`user-row-${(record as AdminUser).id}`"
          @click.prevent="openUser(record as AdminUser)"
        >
          {{ entityLabel(record as AdminUser) }}
        </a>
      </template>
      <template v-else-if="column.key === 'isAdmin'">
        {{ (record as AdminUser).isAdmin ? t('admin.users.admin') : t('crud.no') }}
      </template>
      <template v-else-if="column.key === 'isBot'">
        {{ (record as AdminUser).isBot ? t('admin.users.bot') : t('crud.no') }}
      </template>
      <template v-else-if="column.key === 'teams'">
        {{ joinRefNames((record as AdminUser).teams) || '—' }}
      </template>
      <template v-else-if="column.key === 'roles'">
        {{ joinRefNames((record as AdminUser).roles) || '—' }}
      </template>
    </template>
  </EntityListShell>
  <FormModal
    :open="createOpen"
    :title="t('admin.users.createTitle')"
    :ok-text="t('crud.create')"
    :cancel-text="t('crud.cancel')"
    :confirm-loading="creating"
    @ok="onCreate"
    @cancel="createOpen = false"
  >
    <Form layout="vertical">
      <Form.Item :label="t('crud.name')" :rules="requiredField(t, t('crud.name'))">
        <Input v-model:value="createForm.name" data-testid="create-user-name" />
      </Form.Item>
      <Form.Item :label="t('crud.email')" :rules="requiredField(t, t('crud.email'))">
        <Input v-model:value="createForm.email" data-testid="create-user-email" />
      </Form.Item>
      <Form.Item :label="t('crud.displayName')" :extra="t('crud.displayNameHelp')">
        <Input v-model:value="createForm.displayName" />
      </Form.Item>
      <Form.Item :label="t('crud.description')" :extra="t('crud.descriptionHelp')">
        <Input.TextArea v-model:value="createForm.description" :rows="2" />
      </Form.Item>
      <Form.Item>
        <Checkbox v-model:checked="createForm.isAdmin">{{ t('admin.users.administrator') }}</Checkbox>
      </Form.Item>
      <Form.Item :label="t('admin.users.password')" :extra="t('admin.users.passwordHelp')">
        <Input.Password v-model:value="createForm.password" />
      </Form.Item>
      <Form.Item :label="t('admin.users.confirmPassword')" :extra="t('admin.users.confirmPasswordHelp')">
        <Input.Password v-model:value="createForm.confirmPassword" />
      </Form.Item>
      <Form.Item :label="t('admin.users.teams')" :extra="t('admin.users.teamsHelp')">
        <Select v-model:value="createForm.teamIds" mode="multiple" allow-clear>
          <Select.Option v-for="team in teams" :key="team.id" :value="team.id">
            {{ entityLabel(team) }}
          </Select.Option>
        </Select>
      </Form.Item>
      <Form.Item :label="t('admin.users.roles')" :extra="t('admin.users.rolesHelp')">
        <Select v-model:value="createForm.roleIds" mode="multiple" allow-clear>
          <Select.Option v-for="role in roles" :key="role.id" :value="role.id">
            {{ entityLabel(role) }}
          </Select.Option>
        </Select>
      </Form.Item>
    </Form>
  </FormModal>
</template>
