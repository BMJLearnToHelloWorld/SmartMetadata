/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
<script setup lang="ts">
/**
 * Pipeline tasks tab — the pin `PipelineTaskTab.tsx` equivalent (D-2
 * batch 5b). List / Dag switch; the list is the six-column task table
 * (name, type, description, owners, tags, glossary terms) with a
 * sortable name column, flat antd filters on the two tag columns and
 * numeric pagination (15 / 25 / 50, pin `LIST_PAGE_SIZE_OPTIONS`).
 * Description edits inline through `EntityDescriptionCell`; tag /
 * glossary edits inline through `TaskTagCell`; a name click without a
 * source URL opens the read-only task detail modal (the pin's column
 * detail panel has no product equivalent — see D-6). The Dag view
 * reuses the existing `PipelineTaskGraph` with the view-computed model.
 *
 * Permissions follow the pin call site: `getDerivedPermissionFlags`
 * WITHOUT the `deleted` flag, OR `isAdminUser` (P1 dual line), computed
 * by the view and passed in as the three `canEdit*` flags; `deleted`
 * is passed separately and gates the cells read-only. One deliberate
 * correction of the pin: the description save resolves the task's index
 * by name in the full task list instead of the pin's
 * `(currentPage - 1) * pageSize + index` page math, which replaces the
 * wrong task when a tag filter is active (the pin indexes into the
 * filtered page but writes into the unfiltered list).
 */
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { Button, Descriptions, Empty, Modal, Segmented, Typography } from 'ant-design-vue';
import { LinkOutlined } from '@ant-design/icons-vue';
import type { TableProps } from 'ant-design-vue';
import EntityDescriptionCell from '@/components/shared/EntityDescriptionCell.vue';
import SmTable from '@/components/shared/SmTable.vue';
import PipelineTaskGraph from '@/components/pipeline/PipelineTaskGraph.vue';
import TaskTagCell from '@/components/widgets/TaskTagCell.vue';
import type { PipelineTaskGraphModel } from '@/pipeline/taskGraph';
import type { AssetTagOption, TagSource } from '@/types/governance';
import type { PipelineTask, TagRef } from '@/types/api';

const { t } = useI18n();

const props = defineProps<{
  tasks: PipelineTask[];
  taskGraph: PipelineTaskGraphModel;
  deleted: boolean;
  canEditDescription: boolean;
  canEditTags: boolean;
  canEditGlossaryTerms: boolean;
  tagOptions: AssetTagOption[];
  onTaskDescriptionUpdate: (task: PipelineTask, index: number, description: string) => Promise<void>;
  onTaskTagChange: (task: PipelineTask, source: TagSource, tagFqns: string[]) => Promise<void>;
}>();

const EMPTY_DASH = '—';

type TaskView = 'list' | 'dag';
const view = ref<TaskView>('list');

const detailTask = ref<PipelineTask | null>(null);

function taskName(task: PipelineTask): string {
  return task.displayName || task.name;
}

/** Positional index into the full task list, resolved by name (task names are unique per pipeline). */
function taskIndex(task: PipelineTask): number {
  return props.tasks.findIndex((item) => item.name === task.name);
}

function ownerNames(task: PipelineTask): string {
  const names = (task.owners ?? []).map((owner) => owner.displayName || owner.name).filter(Boolean);
  return names.length ? names.join(', ') : EMPTY_DASH;
}

function sourceTags(task: PipelineTask, source: TagSource): TagRef[] {
  return (task.tags ?? []).filter(
    (tag) => tag.source === source || (source === 'Classification' && !tag.source),
  );
}

function tagFilterOptions(source: TagSource): { text: string; value: string }[] {
  const seen = new Map<string, string>();
  for (const task of props.tasks) {
    for (const tag of sourceTags(task, source)) {
      if (!seen.has(tag.tagFQN)) {
        seen.set(tag.tagFQN, tag.name);
      }
    }
  }
  return [...seen.entries()].map(([value, text]) => ({ text, value }));
}

function tagColumn(source: TagSource): NonNullable<TableProps['columns']>[number] {
  return {
    title: source === 'Classification' ? t('asset.fields.tags') : t('asset.tabs.glossaryTerms'),
    dataIndex: source === 'Classification' ? 'tags' : 'glossaryTerms',
    key: source === 'Classification' ? 'tags' : 'glossaryTerms',
    width: 300,
    filters: tagFilterOptions(source),
    onFilter: (value, record) =>
      sourceTags(record as PipelineTask, source).some((tag) => tag.tagFQN === value),
  };
}

const columns = computed<TableProps['columns']>(() => [
  {
    title: t('asset.fields.name'),
    dataIndex: 'name',
    key: 'name',
    width: 220,
    fixed: 'left',
    sorter: (a: PipelineTask, b: PipelineTask) => taskName(a).localeCompare(taskName(b)),
  },
  {
    title: t('asset.fields.type'),
    dataIndex: 'taskType',
    key: 'taskType',
    width: 180,
  },
  {
    title: t('asset.fields.description'),
    dataIndex: 'description',
    key: 'description',
    width: 350,
  },
  {
    title: t('asset.fields.owners'),
    dataIndex: 'owners',
    key: 'owners',
  },
  tagColumn('Classification'),
  tagColumn('Glossary'),
]);

function openDetail(task: PipelineTask): void {
  detailTask.value = task;
}
</script>

<template>
  <div v-if="tasks.length === 0">
    <Empty data-testid="pipeline-task-empty" :description="t('asset.tasksEmpty')" />
  </div>
  <div v-else>
    <Segmented
      :value="view"
      :options="[
        { label: t('asset.taskListView'), value: 'list' },
        { label: t('asset.taskDagView'), value: 'dag' },
      ]"
      data-testid="pipeline-task-switch"
      @change="(value) => { view = value as TaskView; }"
    />
    <div v-if="view === 'list'" class="pipeline-tasks__list">
      <SmTable
        :columns="columns"
        :data-source="tasks"
        row-key="name"
        size="small"
        test-id="task-table"
        :pagination="{ pageSize: 15, showSizeChanger: true, pageSizeOptions: ['15', '25', '50'] }"
        :scroll="{ x: 1200 }"
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'name'">
            <a v-if="record.sourceUrl" :href="record.sourceUrl" target="_blank" rel="noopener noreferrer">
              {{ taskName(record as PipelineTask) }}
              <LinkOutlined aria-hidden="true" />
            </a>
            <Button v-else type="link" @click="openDetail(record as PipelineTask)">
              {{ taskName(record as PipelineTask) }}
            </Button>
          </template>
          <template v-else-if="column.key === 'taskType'">
            <Typography.Text v-if="record.taskType">{{ record.taskType }}</Typography.Text>
            <Typography.Text v-else type="secondary">{{ EMPTY_DASH }}</Typography.Text>
          </template>
          <template v-else-if="column.key === 'description'">
            <EntityDescriptionCell
              :description="record.description"
              :entity-name="taskName(record as PipelineTask)"
              :has-edit-access="canEditDescription"
              :is-read-only="deleted"
              :on-description-update="(description: string) => onTaskDescriptionUpdate(record as PipelineTask, taskIndex(record as PipelineTask), description)"
            />
          </template>
          <template v-else-if="column.key === 'owners'">
            <Typography.Text>{{ ownerNames(record as PipelineTask) }}</Typography.Text>
          </template>
          <template v-else-if="column.key === 'tags'">
            <TaskTagCell
              :tags="record.tags ?? []"
              source="Classification"
              :options="tagOptions"
              :editable="canEditTags && !deleted"
              :test-id-prefix="`task-tag-cell-${record.name}`"
              :on-change="(fqns: string[]) => onTaskTagChange(record as PipelineTask, 'Classification', fqns)"
            />
          </template>
          <template v-else-if="column.key === 'glossaryTerms'">
            <TaskTagCell
              :tags="record.tags ?? []"
              source="Glossary"
              :options="tagOptions"
              :editable="canEditGlossaryTerms && !deleted"
              :test-id-prefix="`task-tag-cell-${record.name}`"
              :on-change="(fqns: string[]) => onTaskTagChange(record as PipelineTask, 'Glossary', fqns)"
            />
          </template>
        </template>
      </SmTable>
    </div>
    <div v-else class="pipeline-tasks__dag">
      <PipelineTaskGraph :model="taskGraph" />
    </div>
  </div>

  <Modal
    :open="!!detailTask"
    :title="detailTask ? taskName(detailTask) : ''"
    :footer="null"
    data-testid="pipeline-task-detail"
    @cancel="detailTask = null"
  >
    <Descriptions v-if="detailTask" :column="1" bordered size="small">
      <Descriptions.Item :label="t('asset.fields.name')">
        {{ taskName(detailTask) }}
      </Descriptions.Item>
      <Descriptions.Item :label="t('asset.fields.type')">
        {{ detailTask.taskType || EMPTY_DASH }}
      </Descriptions.Item>
      <Descriptions.Item :label="t('asset.fields.fqn')">
        {{ detailTask.fullyQualifiedName || EMPTY_DASH }}
      </Descriptions.Item>
      <Descriptions.Item :label="t('asset.fields.sourceUrl')">
        <a v-if="detailTask.sourceUrl" :href="detailTask.sourceUrl" target="_blank" rel="noopener noreferrer">
          {{ detailTask.sourceUrl }}
        </a>
        <span v-else>{{ EMPTY_DASH }}</span>
      </Descriptions.Item>
      <Descriptions.Item :label="t('asset.fields.description')">
        {{ detailTask.description || EMPTY_DASH }}
      </Descriptions.Item>
      <Descriptions.Item :label="t('asset.fields.tags')">
        {{ sourceTags(detailTask, 'Classification').map((tag) => tag.name).join(', ') || EMPTY_DASH }}
      </Descriptions.Item>
      <Descriptions.Item :label="t('asset.tabs.glossaryTerms')">
        {{ sourceTags(detailTask, 'Glossary').map((tag) => tag.name).join(', ') || EMPTY_DASH }}
      </Descriptions.Item>
    </Descriptions>
  </Modal>
</template>

<style scoped>
.pipeline-tasks__list {
  margin-top: 12px;
}

.pipeline-tasks__dag {
  margin-top: 12px;
}
</style>
