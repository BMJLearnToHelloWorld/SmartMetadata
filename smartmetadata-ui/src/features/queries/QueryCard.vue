<!--
  Copyright 2026 SmartMetadata authors.

  Licensed under the Apache License, Version 2.0 (the "License");
  you may not use this file except in compliance with the License.
  You may obtain a copy of the License at

      http://www.apache.org/licenses/LICENSE-2.0
-->
<template>
  <article
    class="query-card"
    :class="{ 'query-card--selected': selected }"
    :data-testid="`query-card-${query.id}`"
    @click="onCardClick"
  >
    <header class="query-card__header">
      <span class="query-card__date">
        {{ dateText }}<span v-if="durationText" data-testid="query-run-duration"> | {{ durationText }}</span>
      </span>
      <span class="query-card__header-actions">
        <Tooltip :title="t('query.fitToScreen')">
          <RouterLink :to="{ name: 'query-full-screen', params: { fqn: datasetFqn, queryId: query.id }, query: { ...route.query } }">
            <Button size="small" data-testid="query-expand-btn" :aria-label="t('query.fitToScreen')">
              <ExpandOutlined />
            </Button>
          </RouterLink>
        </Tooltip>
        <Tooltip :title="t('query.copySql')">
          <Button size="small" data-testid="query-copy-btn" :aria-label="t('query.copySql')" @click="onCopySql">
            <CopyOutlined />
          </Button>
        </Tooltip>
      </span>
    </header>

    <div v-if="isEditMode" class="query-card__editor">
      <Input.TextArea v-model:value="editSql" :rows="6" data-testid="query-sql-editor" />
      <QueryUsedByOtherTable
        :query-used-in="query.queryUsedIn ?? []"
        :is-edit-mode="true"
        :selected-tables="selectedTables"
        @update:selected-tables="selectedTables = $event"
      />
      <span class="query-card__editor-actions">
        <Button size="small" data-testid="query-save-btn" type="primary" :loading="saving" @click="onSave">
          {{ t('crud.save') }}
        </Button>
        <Button size="small" data-testid="query-cancel-btn" @click="onCancelEdit">
          {{ t('crud.cancel') }}
        </Button>
      </span>
    </div>
    <pre v-else class="query-card__sql" data-testid="query-sql">{{ query.query }}</pre>

    <footer class="query-card__footer">
      <QueryUsedByOtherTable
        v-if="!isEditMode"
        :query-used-in="query.queryUsedIn ?? []"
        :is-edit-mode="false"
        :selected-tables="[]"
      />
      <QueryCardExtraOption
        :query="query"
        :permission="permission"
        :current-user-id="currentUserId"
        @edit="onEnterEdit"
        @vote="emit('vote', $event)"
        @deleted="emit('deleted')"
      />
    </footer>
  </article>
</template>

<script setup lang="ts">
import type { JsonPatchOp } from '@/admin/jsonPatch';
import { setFieldPatch } from '@/admin/jsonPatch';
import type { DataQuery, VoteType } from '@/api/queries';
import type { DerivedPermissionFlags } from '@/api/permissions';
import { formatQueryDate, formatQueryDuration } from '@/catalog/queryDisplay';
import type { EntityRef } from '@/types/api';
import { CopyOutlined, ExpandOutlined } from '@ant-design/icons-vue';
import { Button, Input, message, Tooltip } from 'ant-design-vue';
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute } from 'vue-router';
import QueryCardExtraOption from './QueryCardExtraOption.vue';
import QueryUsedByOtherTable from './QueryUsedByOtherTable.vue';

const props = defineProps<{
  query: DataQuery;
  selected: boolean;
  permission: DerivedPermissionFlags;
  datasetFqn: string;
  currentUserId: string;
  /** Pin onQueryUpdate prop: patch + return the updated query, or reject so the card stays in edit mode. */
  onQueryUpdate: (id: string, ops: JsonPatchOp[]) => Promise<DataQuery>;
}>();

const emit = defineEmits<{
  select: [queryId: string];
  vote: [voteType: VoteType];
  deleted: [];
}>();

const { t, locale } = useI18n();
// Pin handleSelectedQuery merges the current search params into the
// navigation: the expand link keeps them so a refresh or deep link on
// the full-screen view does not lose the return path.
const route = useRoute();

const dateText = computed(() => formatQueryDate(props.query.queryDate, locale.value));
const durationText = computed(() => formatQueryDuration(props.query.duration, t('query.runsFor')));

const isEditMode = ref(false);
const editSql = ref('');
const selectedTables = ref<EntityRef[]>([]);
const saving = ref(false);

function onEnterEdit(): void {
  editSql.value = props.query.query ?? '';
  selectedTables.value = [...(props.query.queryUsedIn ?? [])];
  isEditMode.value = true;
}

function onCancelEdit(): void {
  isEditMode.value = false;
}

function tableFqnSet(tables: EntityRef[]): Set<string> {
  return new Set(tables.map((table) => table.fullyQualifiedName ?? table.name ?? ''));
}

async function onSave(): Promise<void> {
  if (!props.query.id) {
    return;
  }
  const ops: JsonPatchOp[] = [];
  if (editSql.value !== (props.query.query ?? '')) {
    ops.push(...setFieldPatch('/query', props.query.query, editSql.value));
  }
  const before = tableFqnSet(props.query.queryUsedIn ?? []);
  const after = tableFqnSet(selectedTables.value);
  const tablesChanged =
    before.size !== after.size || [...after].some((fqn) => !before.has(fqn));
  if (tablesChanged) {
    ops.push(...setFieldPatch('/queryUsedIn', props.query.queryUsedIn, selectedTables.value));
  }
  // Pin: save issues the update only when something changed.
  if (ops.length === 0) {
    isEditMode.value = false;
    return;
  }
  saving.value = true;
  try {
    await props.onQueryUpdate(props.query.id, ops);
    isEditMode.value = false;
  } catch {
    message.error(t('query.updateFailed'));
  } finally {
    saving.value = false;
  }
}

async function onCopySql(): Promise<void> {
  try {
    await navigator.clipboard.writeText(props.query.query ?? '');
    message.success(t('query.copied'));
  } catch {
    message.error(t('query.copyFailed'));
  }
}

// A click anywhere on the card selects it for the right panel, except
// clicks on interactive descendants, which keep their own behavior.
function onCardClick(event: MouseEvent): void {
  const target = event.target as HTMLElement | null;
  if (target?.closest('button, a, input, textarea, select, .ant-select, .ant-dropdown-menu, .ant-popover')) {
    return;
  }
  if (props.query.id) {
    emit('select', props.query.id);
  }
}
</script>

<style scoped>
.query-card {
  padding: 12px 16px;
  border: 1px solid var(--sm-color-border);
  border-radius: var(--sm-border-radius);
  background: var(--sm-color-bg-container);
  cursor: pointer;
}

.query-card--selected {
  border-color: var(--sm-brand);
  background: var(--sm-color-primary-bg);
}

.query-card__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.query-card__date {
  color: var(--sm-color-text-secondary);
  font-size: 12px;
}

.query-card__header-actions {
  display: flex;
  gap: 8px;
}

.query-card__sql {
  max-height: 96px;
  overflow: auto;
  margin: 8px 0;
  white-space: pre-wrap;
  word-break: break-word;
}

.query-card__editor {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin: 8px 0;
}

.query-card__editor-actions {
  display: flex;
  gap: 8px;
}

.query-card__footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
</style>
