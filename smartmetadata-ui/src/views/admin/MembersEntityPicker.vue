<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { Checkbox, Input, Modal, Spin, Tabs, Tree } from 'ant-design-vue';
import type { DataNode } from 'ant-design-vue/es/tree';
import { getEntityName } from '@/components/shared/profilePictureUtils';
import { listDomains } from '@/api/domains';
import { listPersonas } from '@/api/persona';
import { listPolicies } from '@/api/policies';
import { listRoles } from '@/api/roles';
import { getTeamsHierarchy, searchTeams } from '@/api/teams';
import { listUsers, searchUsers } from '@/api/users';
import type { AdminTeam } from '@/types/admin';
import type { Domain } from '@/types/governance';
import type { Persona } from '@/types/persona';
import { buildOnlineUserSearchQueryFilter } from '@/api/users';

/**
 * 02-local selector equivalent for the pin selectable lists
 * (TeamsSelectableNew, UserSelectableList, UserTeamSelectableList,
 * DomainSelectableList, PersonaSelectableList). One component with a
 * `kind` parameter; the pin lists share the search + multi-select +
 * save shape and differ only in data source and tree-vs-list display.
 *
 * Data sources (pin call sites):
 * - team: getTeamsHierarchy tree (TeamsSelectableNew), individual
 *   selection (no parent/child cascade), search filters by name.
 * - user: list + searchQuery with an explicit isBot:'false' filter
 *   unless includeBot (UserSelectableList; UserTab passes includeBot).
 * - owner: two tabs (Users with isBot:'false', Teams with an empty
 *   filter) sharing one selection (UserTeamSelectableList).
 * - role/policy/persona/domain: full list fetch (limit 100) with
 *   client-side substring search; domains render as a parent-linked
 *   tree (DomainLabel's domain-selectable-tree).
 *
 * Selection returns ids; callers map ids back to references,
 * preserving existing reference objects where possible (pin
 * AddAttributeModal / handleAddAttribute semantics).
 */

export type PickerKind = 'user' | 'team' | 'role' | 'policy' | 'persona' | 'domain' | 'owner';

export interface PickerOption {
  id: string;
  name: string;
  displayName?: string;
  description?: string;
  fullyQualifiedName?: string;
  type: string;
  parentId?: string;
}

const props = defineProps<{
  open: boolean;
  kind: PickerKind;
  multiple: boolean;
  selectedIds: string[];
  title: string;
  includeBot?: boolean;
  saving?: boolean;
}>();

const emit = defineEmits<{
  cancel: [];
  save: [ids: string[], options: PickerOption[]];
}>();

const { t } = useI18n();

const loading = ref(false);
const searchText = ref('');
const options = ref<PickerOption[]>([]);
const teamOptions = ref<PickerOption[]>([]);
const checkedIds = ref<string[]>([...props.selectedIds]);
const ownerTab = ref<'user' | 'team'>('user');

const isTreeKind = computed(() => props.kind === 'team' || props.kind === 'domain');

function toOption(
  item: {
    id: string;
    name: string;
    displayName?: string;
    description?: string;
    fullyQualifiedName?: string;
  },
  type: string,
  parentId?: string,
): PickerOption {
  return {
    id: item.id,
    name: item.name,
    displayName: item.displayName,
    description: item.description,
    fullyQualifiedName: item.fullyQualifiedName,
    type,
    parentId,
  };
}

function flattenHierarchy(teams: AdminTeam[], parentId?: string, out: PickerOption[] = []): PickerOption[] {
  for (const team of teams) {
    out.push(toOption(team, 'team', parentId));
    if (team.children?.length) {
      flattenHierarchy(team.children, team.id, out);
    }
  }
  return out;
}

async function loadListKind(): Promise<void> {
  loading.value = true;
  try {
    if (props.kind === 'role') {
      const page = await listRoles(100);
      options.value = page.data.map((item) => toOption(item, 'role'));
    } else if (props.kind === 'policy') {
      const page = await listPolicies({ limit: 100 });
      options.value = page.data.map((item) => toOption(item, 'policy'));
    } else if (props.kind === 'persona') {
      const page = await listPersonas({ limit: 100 });
      options.value = page.data.map((item: Persona) => toOption(item, 'persona'));
    } else if (props.kind === 'domain') {
      const page = await listDomains({ limit: 100 });
      options.value = page.data.map((item: Domain) => toOption(item, 'domain', item.parent?.id));
    } else if (props.kind === 'team') {
      const hierarchy = await getTeamsHierarchy(false);
      options.value = flattenHierarchy(hierarchy);
    }
  } finally {
    loading.value = false;
  }
}

async function loadUsers(term: string): Promise<void> {
  loading.value = true;
  try {
    if (term) {
      // No isAdmin term: the pin owner/user selectors filter only isBot.
      const filter = props.includeBot ? undefined : buildOnlineUserSearchQueryFilter();
      const page = await searchUsers(term, 0, 100, filter);
      options.value = page.data.map((item) => toOption(item, 'user'));
    } else {
      const page = await listUsers({ limit: 100, isBot: props.includeBot ? undefined : false });
      options.value = page.data.map((item) => toOption(item, 'user'));
    }
  } finally {
    loading.value = false;
  }
}

async function loadOwnerTab(term: string): Promise<void> {
  loading.value = true;
  try {
    if (ownerTab.value === 'user') {
      if (term) {
        const page = await searchUsers(term, 0, 100, buildOnlineUserSearchQueryFilter());
        options.value = page.data.map((item) => toOption(item, 'user'));
      } else {
        const page = await listUsers({ limit: 100, isBot: false });
        options.value = page.data.map((item) => toOption(item, 'user'));
      }
    } else {
      if (term) {
        const page = await searchTeams(term, 0, 100);
        teamOptions.value = page.data.map((item) => toOption(item, 'team'));
      } else {
        const hierarchy = await getTeamsHierarchy(false);
        teamOptions.value = flattenHierarchy(hierarchy);
      }
    }
  } finally {
    loading.value = false;
  }
}

function load(): void {
  if (props.kind === 'user') {
    void loadUsers(searchText.value.trim());
  } else if (props.kind === 'owner') {
    void loadOwnerTab(searchText.value.trim());
  } else {
    void loadListKind();
  }
}

watch(
  () => props.open,
  (open) => {
    if (open) {
      checkedIds.value = [...props.selectedIds];
      searchText.value = '';
      load();
    }
  },
);

let searchTimer: ReturnType<typeof setTimeout> | undefined;
watch(searchText, (value) => {
  if (props.kind !== 'user' && props.kind !== 'owner') {
    return;
  }
  if (searchTimer) {
    clearTimeout(searchTimer);
  }
  searchTimer = setTimeout(() => {
    loadUsersOrOwner(value.trim());
  }, 300);
});

function loadUsersOrOwner(term: string): void {
  if (props.kind === 'user') {
    void loadUsers(term);
  } else if (props.kind === 'owner') {
    void loadOwnerTab(term);
  }
}

watch(ownerTab, () => {
  if (props.kind === 'owner') {
    void loadOwnerTab(searchText.value.trim());
  }
});

const searchPlaceholder = computed(() => {
  const entityKey =
    props.kind === 'owner'
      ? ownerTab.value === 'user'
        ? 'label.user-plural'
        : 'label.team-plural'
      : props.kind === 'user'
        ? 'label.user-plural'
        : props.kind === 'team'
          ? 'label.team-plural'
          : props.kind === 'role'
            ? 'label.role-plural'
            : props.kind === 'policy'
              ? 'label.policy-plural'
              : props.kind === 'persona'
                ? 'label.persona-plural'
                : 'label.domain-plural';
  return t('label.search-entity', { entity: t(entityKey) });
});

const filteredOptions = computed(() => {
  if (props.kind === 'user' || props.kind === 'owner') {
    return options.value;
  }
  const term = searchText.value.trim().toLowerCase();
  if (!term) {
    return options.value;
  }
  return options.value.filter((option) =>
    [option.name, option.displayName, option.description].some((value) =>
      value?.toLowerCase().includes(term),
    ),
  );
});

function buildTree(list: PickerOption[]): DataNode[] {
  const byId = new Map<string, DataNode>();
  const roots: DataNode[] = [];
  for (const option of list) {
    byId.set(option.id, {
      key: option.id,
      title: getEntityName(option),
      children: [],
    });
  }
  for (const option of list) {
    const node = byId.get(option.id)!;
    if (option.parentId && byId.has(option.parentId)) {
      (byId.get(option.parentId)!.children as DataNode[]).push(node);
    } else {
      roots.push(node);
    }
  }
  const prune = (nodes: DataNode[]): DataNode[] =>
    nodes.map((node) => {
      const children = node.children?.length ? prune(node.children) : undefined;
      return children ? { ...node, children } : { ...node, children: undefined };
    });
  return prune(roots);
}

const treeData = computed(() => buildTree(filteredOptions.value));
const ownerTeamTreeData = computed(() => buildTree(teamOptions.value));

function toggleOption(id: string): void {
  if (!props.multiple) {
    checkedIds.value = [id];
    return;
  }
  checkedIds.value = checkedIds.value.includes(id)
    ? checkedIds.value.filter((value) => value !== id)
    : [...checkedIds.value, id];
}

function onTreeCheck(checked: unknown): void {
  // checkStrictly: checked is { checked: Key[], halfChecked: Key[] }.
  const keys = (checked as { checked?: unknown[] }).checked ?? (checked as unknown[]);
  checkedIds.value = keys.map(String);
}

function onSave(): void {
  const all = props.kind === 'owner' ? [...options.value, ...teamOptions.value] : options.value;
  const selected = all.filter((option) => checkedIds.value.includes(option.id));
  emit('save', [...checkedIds.value], selected);
}
</script>

<template>
  <Modal
    :open="open"
    :title="title"
    :ok-text="t('label.save')"
    :cancel-text="t('crud.cancel')"
    :confirm-loading="saving"
    :mask-closable="false"
    width="750"
    data-testid="modal-container"
    @ok="onSave"
    @cancel="emit('cancel')"
  >
    <Spin :spinning="loading">
      <Input
        v-model:value="searchText"
        allow-clear
        :placeholder="searchPlaceholder"
        data-testid="search-input"
        class="members-picker__search"
      />
      <Tabs v-if="kind === 'owner'" v-model:active-key="ownerTab" data-testid="select-owner-tabs">
        <Tabs.TabPane key="user" :tab="t('label.user-plural')" />
        <Tabs.TabPane key="team" :tab="t('label.team-plural')" />
      </Tabs>
      <template v-if="kind === 'owner' && ownerTab === 'team'">
        <Tree
          :tree-data="ownerTeamTreeData"
          :checked-keys="checkedIds"
          :checkable="multiple"
          :check-strictly="true"
          :selected-keys="multiple ? [] : checkedIds"
          @check="onTreeCheck"
          @select="(keys) => { if (!multiple && keys.length) checkedIds = [String(keys[0])]; }"
        />
      </template>
      <Tree
        v-else-if="isTreeKind"
        :tree-data="treeData"
        :checked-keys="checkedIds"
        :checkable="multiple"
        :check-strictly="true"
        :selected-keys="multiple ? [] : checkedIds"
        @check="onTreeCheck"
        @select="(keys) => { if (!multiple && keys.length) checkedIds = [String(keys[0])]; }"
      />
      <div v-else class="members-picker__list">
        <div
          v-for="option in filteredOptions"
          :key="option.id"
          class="members-picker__row"
          @click="toggleOption(option.id)"
        >
          <Checkbox :checked="checkedIds.includes(option.id)" />
          <span class="members-picker__name">{{ getEntityName(option) }}</span>
          <span v-if="option.description" class="members-picker__desc">{{ option.description }}</span>
        </div>
        <p v-if="filteredOptions.length === 0 && !loading">{{ t('server.no-records-found') }}</p>
      </div>
    </Spin>
  </Modal>
</template>

<style scoped>
.members-picker__search {
  margin-bottom: 12px;
}
.members-picker__list {
  display: flex;
  flex-direction: column;
}
.members-picker__row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px;
  cursor: pointer;
}
.members-picker__name {
  font-weight: 500;
}
.members-picker__desc {
  color: var(--sm-text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
