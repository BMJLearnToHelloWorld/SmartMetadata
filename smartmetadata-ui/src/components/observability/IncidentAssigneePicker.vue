<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
  Official incident inline assignee editor: tabs 团队 / 用户, search,
  list, and a remove control on the current assignee. Vue3 + ant-design-vue.
-->
<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { Button, Input, Popover, Spin, Tabs } from 'ant-design-vue';
import { CloseCircleFilled, SearchOutlined, UserOutlined } from '@ant-design/icons-vue';
import { useI18n } from 'vue-i18n';
import { listTeams } from '@/api/teams';
import { listUsers, searchUsers } from '@/api/users';
import type { EntityRef } from '@/types/api';

function toUserRef(user: { id?: string; name: string; displayName?: string; fullyQualifiedName?: string }): EntityRef {
  return { id: user.id, name: user.name, displayName: user.displayName, fullyQualifiedName: user.fullyQualifiedName, type: 'user' };
}

function toTeamRef(team: { id?: string; name: string; displayName?: string; fullyQualifiedName?: string }): EntityRef {
  return { id: team.id, name: team.name, displayName: team.displayName, fullyQualifiedName: team.fullyQualifiedName, type: 'team' };
}

defineOptions({ name: 'IncidentAssigneePicker' });

const props = withDefaults(
  defineProps<{
    modelValue?: EntityRef;
    candidates?: EntityRef[];
    disabled?: boolean;
    loading?: boolean;
    testId?: string;
  }>(),
  { candidates: () => [], disabled: false, loading: false, testId: 'incident-assignee-picker' },
);

const emit = defineEmits<{
  'update:modelValue': [value: EntityRef | undefined];
  change: [value: EntityRef | undefined];
}>();

const { t } = useI18n();
const open = ref(false);
const activeTab = ref<'team' | 'user'>('user');
const query = ref('');
const users = ref<EntityRef[]>([]);
const teams = ref<EntityRef[]>([]);
const loadingLists = ref(false);

const current = computed(() => props.modelValue);

const visibleItems = computed(() => {
  const source = activeTab.value === 'user' ? users.value : teams.value;
  const needle = query.value.trim().toLocaleLowerCase();
  const extra = (props.candidates ?? []).filter((item) =>
    activeTab.value === 'user' ? item.type === 'user' : item.type === 'team',
  );
  const merged = [...source];
  for (const item of extra) {
    if (!merged.some((row) => row.name === item.name && row.type === item.type)) {
      merged.push(item);
    }
  }
  if (!needle) {
    return merged;
  }
  return merged.filter((item) => {
    const haystack = `${item.displayName ?? ''} ${item.name ?? ''}`.toLocaleLowerCase();
    return haystack.includes(needle);
  });
});

const triggerLabel = computed(() =>
  current.value?.displayName || current.value?.name || t('observability.incidents.noAssignee'),
);

async function loadLists(): Promise<void> {
  loadingLists.value = true;
  try {
    const [userPage, teamPage] = await Promise.all([
      listUsers({ limit: 100 }),
      listTeams({ limit: 100 }),
    ]);
    users.value = userPage.data.map(toUserRef);
    teams.value = teamPage.data.map(toTeamRef);
  } catch {
    users.value = [];
    teams.value = [];
  } finally {
    loadingLists.value = false;
  }
}

watch(open, async (visible) => {
  if (!visible) {
    return;
  }
  query.value = '';
  activeTab.value = current.value?.type === 'team' ? 'team' : 'user';
  await loadLists();
});

watch(query, async (value) => {
  if (activeTab.value !== 'user') {
    return;
  }
  const term = value.trim();
  if (!term) {
    return;
  }
  try {
    const page = await searchUsers(term, 0, 50);
    users.value = page.data.map(toUserRef);
  } catch {
    /* keep the last loaded list */
  }
});

function isCurrent(item: EntityRef): boolean {
  return current.value?.name === item.name && current.value?.type === item.type;
}

function select(item: EntityRef): void {
  emit('update:modelValue', item);
  emit('change', item);
  open.value = false;
}

function clearCurrent(event: Event): void {
  event.stopPropagation();
  emit('update:modelValue', undefined);
  emit('change', undefined);
}
</script>

<template>
  <Popover v-model:open="open" trigger="click" placement="bottomLeft" :disabled="disabled">
    <Button
      size="small"
      type="text"
      :disabled="disabled"
      :loading="loading"
      :data-testid="testId"
    >
      <UserOutlined />
      {{ triggerLabel }}
    </Button>
    <template #content>
      <div class="assignee-picker" :data-testid="`${testId}-panel`">
        <Tabs v-model:activeKey="activeTab" size="small" data-testid="incident-assignee-tabs">
          <Tabs.TabPane key="team" :tab="t('observability.incidents.assigneeTeamsTab')" />
          <Tabs.TabPane key="user" :tab="t('observability.incidents.assigneeUsersTab')" />
        </Tabs>
        <Input
          v-model:value="query"
          allow-clear
          :placeholder="
            activeTab === 'user'
              ? t('observability.incidents.searchUsers')
              : t('observability.incidents.searchTeams')
          "
          data-testid="incident-assignee-search"
        >
          <template #prefix>
            <SearchOutlined />
          </template>
        </Input>
        <Spin :spinning="loadingLists">
          <ul class="assignee-picker__list" data-testid="incident-assignee-list">
            <li
              v-for="item in visibleItems"
              :key="`${item.type}:${item.name}`"
              class="assignee-picker__item"
              :class="{ 'is-current': isCurrent(item) }"
              :data-testid="`incident-assignee-option-${item.name}`"
            >
              <button type="button" class="assignee-picker__choose" @click="select(item)">
                {{ item.displayName || item.name }}
              </button>
              <Button
                v-if="isCurrent(item)"
                type="text"
                size="small"
                danger
                data-testid="incident-assignee-remove"
                @click="clearCurrent"
              >
                <CloseCircleFilled />
              </Button>
            </li>
          </ul>
        </Spin>
      </div>
    </template>
  </Popover>
</template>

<style scoped>
.assignee-picker {
  width: 280px;
}
.assignee-picker__list {
  list-style: none;
  margin: 8px 0 0;
  padding: 0;
  max-height: 240px;
  overflow: auto;
}
.assignee-picker__item {
  display: flex;
  align-items: center;
  gap: 4px;
}
.assignee-picker__item.is-current {
  background: #f0f5ff;
  border-radius: 4px;
}
.assignee-picker__choose {
  flex: 1;
  text-align: left;
  border: 0;
  background: transparent;
  padding: 6px 8px;
  cursor: pointer;
}
</style>
