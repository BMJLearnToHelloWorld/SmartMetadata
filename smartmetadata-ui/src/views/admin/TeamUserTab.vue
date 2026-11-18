<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { Button, Dropdown, Input, Tooltip, message } from 'ant-design-vue';
import { DeleteOutlined, EllipsisOutlined, RobotOutlined } from '@ant-design/icons-vue';
import { getEntityName } from '@/components/shared/profilePictureUtils';
import CreatePlaceholder from '@/components/shared/CreatePlaceholder.vue';
import FormModal from '@/components/shared/FormModal.vue';
import NextPrevious from '@/components/shared/NextPrevious.vue';
import NoDataPlaceholder from '@/components/shared/NoDataPlaceholder.vue';
import ReferenceListCell from '@/components/shared/ReferenceListCell.vue';
import SmTable from '@/components/shared/SmTable.vue';
import UserPopOverCard from '@/components/shared/UserPopOverCard.vue';
import { useCursorPagedList } from '@/composables/useCursorPagedList';
import type { Paging } from '@/utils/pagination';
import { getRoleWithFqnPath, getUserPath } from '@/utils/fqnPaths';
import { buildTeamMembersSearchFilter } from '@/api/teams';
import { listUsers, searchUsers } from '@/api/users';
import { useAuthStore } from '@/stores/auth';
import type { AdminTeam, AdminUser } from '@/types/admin';
import MembersEntityPicker from './MembersEntityPicker.vue';
import { teamMemberColumns } from './membersColumns';

/**
 * Team members tab (pin UserTab.component.tsx, 533 lines). Cursor-paged
 * list (team=name, fields=roles) + numeric search paging scoped to the
 * subtree (single `terms` clause over teams.id); rows sorted by name
 * ascending client-side (pin orderBy); columns are the common user
 * columns minus teams plus a gated actions column (dropped when the
 * team is deleted); rowKey is `name` (pin), not id.
 *
 * Empty states: Group -> CreatePlaceholder with the ungated
 * can(EditUsers) permission and the Add + import/export footer;
 * non-Group -> NoDataPlaceholder titled no-user-part-of-team.
 * Import/export entries live in a ManageButton-equivalent menu
 * (canDelete=false): export for all types, import only Group +
 * EditAll. The user-import help entity quirk (label.team-lowercase)
 * lives on the import page, not here.
 */

const props = defineProps<{
  team: AdminTeam;
  isGroupType: boolean;
  canEditUsers: boolean;
  ungatedCanEditUsers: boolean;
  canEditAll: boolean;
  saving: boolean;
}>();

const emit = defineEmits<{
  'add-users': [ids: string[]];
  'remove-user': [user: AdminUser];
  'export-users': [];
  'import-users': [];
}>();

const { t } = useI18n();

const searchInput = ref('');
const searchText = ref('');
const searchPage = ref(1);
const searchResults = ref<AdminUser[]>([]);
const searchTotal = ref(0);
const searchLoading = ref(false);
const showPicker = ref(false);
const deletingUser = ref<AdminUser | undefined>();

const searching = computed(() => searchText.value.trim().length > 0);
const isTeamDeleted = computed(() => props.team.deleted ?? false);

const columns = computed(() =>
  teamMemberColumns(
    {
      username: t('label.username'),
      name: t('label.name'),
      roles: t('label.role-plural'),
      actions: t('label.action-plural'),
    },
    !isTeamDeleted.value,
  ),
);

const list = useCursorPagedList<AdminUser>(
  async (params) => {
    if (searching.value) {
      return { data: [], paging: { total: 0 } as Paging };
    }
    const page = await listUsers({
      limit: params.limit,
      after: params.after,
      before: params.before,
      team: props.team.name,
      fields: 'roles',
    });
    return {
      data: page.data,
      paging: { after: page.after, before: page.before, total: page.total ?? 0 },
    };
  },
  {
    persistence: { storage: localStorage, userName: () => useAuthStore().user?.name },
    resetKey: () => [props.team.id, searching.value],
    onError: (error) => message.error(error instanceof Error ? error.message : t('crud.loadFailed')),
  },
);

let searchTimer: ReturnType<typeof setTimeout> | undefined;
let searchSeq = 0;

watch(searchInput, (value) => {
  if (searchTimer) {
    clearTimeout(searchTimer);
  }
  searchTimer = setTimeout(() => {
    searchText.value = value.trim();
    searchPage.value = 1;
  }, 500);
});

async function runSearch(): Promise<void> {
  const id = ++searchSeq;
  const term = searchText.value;
  if (!term) {
    searchResults.value = [];
    searchTotal.value = 0;
    return;
  }
  searchLoading.value = true;
  try {
    const teamIds = [
      props.team.id,
      ...(props.team.descendantTeams?.flatMap((team) => (team.id === undefined ? [] : [team.id])) ?? []),
    ];
    const page = await searchUsers(
      term,
      (searchPage.value - 1) * list.pageSize.value,
      list.pageSize.value,
      buildTeamMembersSearchFilter(teamIds),
    );
    if (id !== searchSeq) {
      return;
    }
    searchResults.value = page.data;
    searchTotal.value = page.total ?? 0;
  } catch {
    if (id === searchSeq) {
      searchResults.value = [];
      searchTotal.value = 0;
    }
  } finally {
    if (id === searchSeq) {
      searchLoading.value = false;
    }
  }
}

watch(
  [searchText, searchPage, () => list.pageSize.value],
  () => {
    if (searching.value) {
      void runSearch();
    }
  },
);

const sortedUsers = computed(() => {
  const users = searching.value ? searchResults.value : list.items.value;
  return [...users].sort((a, b) => (a.name ?? '').localeCompare(b.name ?? ''));
});
const loading = computed(() => (searching.value ? searchLoading.value : list.isLoading.value));
const showEmptyState = computed(
  () => sortedUsers.value.length === 0 && !searchText.value && !loading.value,
);

const addUserButtonTitle = computed(() => {
  if (isTeamDeleted.value) {
    return t('message.this-action-is-not-allowed-for-deleted-entities');
  }
  return props.canEditAll
    ? t('label.add-new-entity', { entity: t('label.user') })
    : t('message.no-permission-for-action');
});

const importExportItems = computed(() => {
  const items = [
    {
      key: 'export',
      label: t('label.export'),
    },
  ];
  if (props.isGroupType && props.canEditAll) {
    items.push({
      key: 'import',
      label: t('label.import'),
    });
  }
  return items;
});

function onMenuClick(key: string): void {
  if (key === 'export') {
    emit('export-users');
  } else if (key === 'import') {
    emit('import-users');
  }
}

function onPickerSave(ids: string[]): void {
  showPicker.value = false;
  emit('add-users', ids);
}

function userDetailPath(user: AdminUser): string {
  return getUserPath(user.fullyQualifiedName ?? user.name);
}
</script>

<template>
  <div class="team-user-tab">
    <CreatePlaceholder
      v-if="showEmptyState && isGroupType"
      :permission="ungatedCanEditUsers"
      :heading="t('label.user')"
      :permission-value="t('label.edit-entity', { entity: t('label.user') })"
      :test-id="`assign-error-placeholder-${t('label.user')}`"
    >
      <template #footer>
        <Tooltip :title="addUserButtonTitle">
          <Button
            type="primary"
            size="small"
            :disabled="!canEditUsers || isTeamDeleted"
            data-testid="add-new-user"
            @click="showPicker = true"
          >
            {{ t('label.add') }}
          </Button>
        </Tooltip>
        <Dropdown :trigger="['click']">
          <Button data-testid="manage-button"><EllipsisOutlined /></Button>
          <template #overlay>
            <Dropdown.Menu>
              <Dropdown.MenuItem
                v-for="item in importExportItems"
                :key="item.key"
                @click="onMenuClick(item.key)"
              >
                {{ item.label }}
              </Dropdown.MenuItem>
            </Dropdown.Menu>
          </template>
        </Dropdown>
      </template>
    </CreatePlaceholder>
    <NoDataPlaceholder
      v-else-if="showEmptyState"
      test-id="no-data-placeholder"
      :title="t('message.no-user-part-of-team', { teamName: team.name })"
    />
    <template v-else>
      <div class="team-user-tab__controls">
        <Input
          v-model:value="searchInput"
          allow-clear
          :placeholder="t('label.search-for-type', { type: t('label.user-lowercase') })"
          data-testid="user-tab-search"
          class="team-user-tab__search"
        />
        <template v-if="!isTeamDeleted">
          <Button
            v-if="isGroupType && sortedUsers.length > 0 && canEditUsers"
            type="primary"
            data-testid="add-new-user"
            @click="showPicker = true"
          >
            {{ t('label.add-entity', { entity: t('label.user') }) }}
          </Button>
          <Dropdown :trigger="['click']">
            <Button data-testid="manage-button"><EllipsisOutlined /></Button>
            <template #overlay>
              <Dropdown.Menu>
                <Dropdown.MenuItem
                  v-for="item in importExportItems"
                  :key="item.key"
                  @click="onMenuClick(item.key)"
                >
                  {{ item.label }}
                </Dropdown.MenuItem>
              </Dropdown.Menu>
            </template>
          </Dropdown>
        </template>
      </div>
      <SmTable
        :columns="columns"
        :data-source="sortedUsers"
        row-key="name"
        size="small"
        :loading="loading"
        :pagination="false"
        test-id="user-tab-table"
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'username'">
            <span class="team-user-tab__username">
              <Tooltip v-if="(record as AdminUser).isBot" :title="t('label.bot')">
                <RobotOutlined data-testid="bot-icon" :style="{ fontSize: '16px' }" />
              </Tooltip>
              <UserPopOverCard
                v-if="(record as AdminUser).name"
                :user-name="(record as AdminUser).name"
                :display-name="(record as AdminUser).displayName"
                show-user-name
                :profile-width="16"
                :to="userDetailPath(record as AdminUser)"
              />
              <template v-else>{{ getEntityName(record as AdminUser) }}</template>
            </span>
          </template>
          <template v-else-if="column.key === 'name'">
            {{ getEntityName(record as AdminUser) }}
          </template>
          <template v-else-if="column.key === 'roles'">
            <template v-if="!(record as AdminUser).roles?.length">
              {{ t('label.no-entity', { entity: t('label.role') }) }}
            </template>
            <ReferenceListCell
              v-else
              :references="(record as AdminUser).roles"
              :has-view-permission="true"
              :path-for="(ref) => getRoleWithFqnPath(ref.fullyQualifiedName ?? ref.name ?? '')"
            />
          </template>
          <template v-else-if="column.key === 'actions'">
            <Tooltip :title="canEditUsers ? t('label.remove') : t('message.no-permission-for-action')">
              <Button
                type="text"
                size="small"
                danger
                :disabled="!canEditUsers"
                :data-testid="`remove-user-${(record as AdminUser).name}`"
                @click="deletingUser = record as AdminUser"
              >
                <DeleteOutlined />
              </Button>
            </Tooltip>
          </template>
        </template>
      </SmTable>
      <NextPrevious
        v-if="!searching"
        :paging="list.paging.value"
        :paging-handler="({ currentPage }) => list.onPageChange(currentPage)"
        :page-size="list.pageSize.value"
        :current-page="list.page.value"
        :is-loading="list.isLoading.value"
        :on-show-size-change="list.onPageSizeChange"
      />
      <NextPrevious
        v-else
        :paging="{ total: searchTotal }"
        :paging-handler="({ currentPage }) => { searchPage = currentPage; }"
        :page-size="list.pageSize.value"
        :current-page="searchPage"
        :is-number-based="true"
        :is-loading="searchLoading"
        :on-show-size-change="list.onPageSizeChange"
      />
    </template>

    <MembersEntityPicker
      :open="showPicker"
      kind="user"
      :multiple="true"
      :include-bot="true"
      :selected-ids="(team.users ?? []).flatMap((user) => (user.id === undefined ? [] : [user.id]))"
      :title="t('label.add-entity', { entity: t('label.user') })"
      :saving="saving"
      @cancel="showPicker = false"
      @save="onPickerSave"
    />
    <FormModal
      :open="deletingUser !== undefined"
      :title="t('label.removing-user')"
      :ok-text="t('label.confirm')"
      :cancel-text="t('label.cancel')"
      :confirm-loading="saving"
      test-id="confirmation-modal"
      @ok="deletingUser && emit('remove-user', deletingUser)"
      @cancel="deletingUser = undefined"
    >
      <p>
        {{
          t('message.are-you-sure-want-to-text', {
            text: t('label.remove-entity', {
              entity: deletingUser ? getEntityName(deletingUser) : '',
            }),
          })
        }}
      </p>
    </FormModal>
  </div>
</template>

<style scoped>
.team-user-tab__controls {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
}
.team-user-tab__search {
  width: 320px;
}
.team-user-tab__username {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}
</style>
