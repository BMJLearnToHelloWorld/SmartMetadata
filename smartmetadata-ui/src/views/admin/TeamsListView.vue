<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { Button, Checkbox, Form, Input, Modal, Select, message } from 'ant-design-vue';
import { listRoles } from '@/api/roles';
import { TEAM_TYPES, createTeam, listTeams } from '@/api/teams';
import EntityListShell from '@/features/crud/EntityListShell.vue';
import { requiredField } from '@/features/crud/formRules';
import {
  DEFAULT_PAGE_SIZE,
  canGoNext,
  canGoPrev,
  createCursorPager,
  entityLabel,
  goNext,
  goPrev,
  joinRefNames,
  resetCursor,
  type CursorPager,
} from '@/features/crud/paging';
import type { EntityListColumn } from '@/features/crud/types';
import type { AdminRole, AdminTeam, IncludeFilter } from '@/types/admin';

const { t } = useI18n();
const router = useRouter();
const loading = ref(false);
const errorMessage = ref('');
const teams = ref<AdminTeam[]>([]);
const total = ref<number | undefined>();
const pageAfter = ref<string | undefined>();
const cursor = ref<CursorPager>(createCursorPager());
const include = ref<IncludeFilter>('non-deleted');
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

const columns = computed<EntityListColumn[]>(() => [
  { title: t('crud.name'), dataIndex: 'name', key: 'name' },
  { title: t('admin.teams.type'), dataIndex: 'teamType', key: 'teamType', width: 140 },
  { title: t('admin.teams.users'), key: 'userCount', width: 90 },
  { title: t('admin.teams.joinable'), key: 'isJoinable', width: 100 },
  { title: t('admin.teams.defaultRoles'), key: 'defaultRoles' },
]);

const hasNext = computed(() => canGoNext(pageAfter.value));
const hasPrev = computed(() => canGoPrev(cursor.value));

async function load(): Promise<void> {
  loading.value = true;
  errorMessage.value = '';
  try {
    const page = await listTeams({
      limit: DEFAULT_PAGE_SIZE,
      after: cursor.value.after,
      include: include.value,
    });
    teams.value = page.data;
    total.value = page.total;
    pageAfter.value = page.after;
  } catch (error) {
    teams.value = [];
    errorMessage.value = error instanceof Error ? error.message : t('crud.loadFailed');
  } finally {
    loading.value = false;
  }
}

function onFilterChange(): void {
  cursor.value = resetCursor();
  void load();
}

function onNext(): void {
  if (pageAfter.value) {
    cursor.value = goNext(cursor.value, pageAfter.value);
  }
  void load();
}

function onPrev(): void {
  cursor.value = goPrev(cursor.value);
  void load();
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
    message.success(t('admin.teams.created', { name: created.name }));
    await load();
  } catch (error) {
    message.error(error instanceof Error ? error.message : t('crud.createFailed'));
  } finally {
    creating.value = false;
  }
}

function openTeam(team: AdminTeam): void {
  if (!team.id) {
    return;
  }
  void router.push({ name: 'admin-team', params: { id: team.id } });
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
  <EntityListShell
    :title="t('admin.teams.title')"
    :lead="t('admin.teams.lead')"
    :loading="loading"
    :error="errorMessage"
    :columns="columns"
    :data-source="teams"
    table-test-id="admin-teams-table"
    show-row-actions
    show-edit-action
    :total="total"
    :has-next="hasNext"
    :has-prev="hasPrev"
    @refresh="load"
    @next="onNext"
    @prev="onPrev"
    @view="openTeam($event as AdminTeam)"
    @edit="openTeam($event as AdminTeam)"
  >
    <template #actions>
      <Button type="primary" data-testid="create-team" @click="createOpen = true">
        {{ t('admin.teams.create') }}
      </Button>
    </template>
    <template #filters>
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
          :data-testid="`team-row-${(record as AdminTeam).id}`"
          @click.prevent="openTeam(record as AdminTeam)"
        >
          {{ entityLabel(record as AdminTeam) }}
        </a>
      </template>
      <template v-else-if="column.key === 'userCount'">
        {{ (record as AdminTeam).userCount ?? (record as AdminTeam).users.length }}
      </template>
      <template v-else-if="column.key === 'isJoinable'">
        {{ (record as AdminTeam).isJoinable ? t('crud.yes') : t('crud.no') }}
      </template>
      <template v-else-if="column.key === 'defaultRoles'">
        {{ joinRefNames((record as AdminTeam).defaultRoles) || '—' }}
      </template>
    </template>
  </EntityListShell>
  <Modal
    v-model:open="createOpen"
    :title="t('admin.teams.createTitle')"
    :ok-text="t('crud.create')"
    :cancel-text="t('crud.cancel')"
    :confirm-loading="creating"
    @ok="onCreate"
  >
    <Form layout="vertical">
      <Form.Item :label="t('crud.name')" :rules="requiredField(t, t('crud.name'))">
        <Input v-model:value="form.name" data-testid="create-team-name" />
      </Form.Item>
      <Form.Item :label="t('admin.teams.type')" :rules="requiredField(t, t('admin.teams.type'))">
        <Select v-model:value="form.teamType">
          <Select.Option v-for="type in TEAM_TYPES" :key="type" :value="type">{{ type }}</Select.Option>
        </Select>
      </Form.Item>
      <Form.Item :label="t('crud.displayName')" :extra="t('crud.displayNameHelp')">
        <Input v-model:value="form.displayName" />
      </Form.Item>
      <Form.Item :label="t('crud.description')" :extra="t('crud.descriptionHelp')">
        <Input.TextArea v-model:value="form.description" :rows="2" />
      </Form.Item>
      <Form.Item>
        <Checkbox v-model:checked="form.isJoinable">{{ t('admin.teams.isJoinable') }}</Checkbox>
      </Form.Item>
      <Form.Item :label="t('admin.teams.parents')" :extra="t('admin.teams.parentsHelp')">
        <Select v-model:value="form.parentIds" mode="multiple" allow-clear>
          <Select.Option v-for="team in teams" :key="team.id" :value="team.id">
            {{ entityLabel(team) }}
          </Select.Option>
        </Select>
      </Form.Item>
      <Form.Item :label="t('admin.teams.defaultRoles')" :extra="t('admin.teams.defaultRolesHelp')">
        <Select v-model:value="form.defaultRoleIds" mode="multiple" allow-clear>
          <Select.Option v-for="role in roles" :key="role.id" :value="role.id">
            {{ entityLabel(role) }}
          </Select.Option>
        </Select>
      </Form.Item>
    </Form>
  </Modal>
</template>
