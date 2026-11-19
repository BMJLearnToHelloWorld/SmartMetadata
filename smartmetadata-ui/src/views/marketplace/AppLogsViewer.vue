<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { Button, Card, Table, Tag } from 'ant-design-vue';
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import type { AppRunRecordWithId, AppRunStats, AppRunStepStats } from '@/api/apps';
import AppLogViewerModal from './AppLogViewerModal.vue';
import AppStatCard from './AppStatCard.vue';
import ReindexFailuresDrawer from './ReindexFailuresDrawer.vue';
import { getAppRunFailureLogs, getEntityStatsData } from './appUtils';

const props = defineProps<{ data: AppRunRecordWithId }>();

const { t } = useI18n();
const showFailuresDrawer = ref(false);
const showLogsModal = ref(false);

/**
 * Official AppLogsViewer (components/Settings/Applications/
 * AppLogsViewer.tsx, pin a3012259ca): overall stats cards for the
 * success and failure jobStats (wall-clock rate basis, ticking every
 * 5s while the run is in flight), reader/process/sink/vector stage
 * cards, the server-stats card, the entity-stats tables, and the
 * view-logs / view-reindex-failures links. A card renders only when
 * its stats block exists.
 */
const now = ref(Date.now());
let tickTimer: ReturnType<typeof setInterval> | undefined;

watch(
  () => [props.data.startTime, props.data.endTime],
  ([startTime, endTime]) => {
    if (tickTimer !== undefined) {
      clearInterval(tickTimer);
      tickTimer = undefined;
    }
    if (startTime && !endTime) {
      tickTimer = setInterval(() => {
        now.value = Date.now();
      }, 5000);
    }
  },
  { immediate: true },
);

onBeforeUnmount(() => {
  if (tickTimer !== undefined) {
    clearInterval(tickTimer);
  }
});

const wallClockMs = computed(() => {
  if (!props.data.startTime) {
    return undefined;
  }
  return Math.max(0, (props.data.endTime ?? now.value) - props.data.startTime);
});

const failureLogs = computed(() => getAppRunFailureLogs(props.data));

const hasFailures = computed(() => {
  const jobStats =
    props.data.successContext?.stats?.jobStats ?? props.data.failureContext?.stats?.jobStats;
  return (jobStats?.failedRecords ?? 0) > 0;
});

interface EntityStatsRow {
  name: string;
  totalRecords?: number;
  successRecords?: number;
  failedRecords?: number;
  vectorEmbeddings?: number | null;
  readerAvgMs: string;
  processAvgMs: string;
  sinkAvgMs: string;
  vectorAvgMs: string;
}

const entityStatsRows = (entityStats?: Record<string, AppRunStepStats>): EntityStatsRow[] =>
  entityStats ? getEntityStatsData(entityStats) : [];

function entityCellValue(row: Record<string, unknown>, dataIndex: unknown): unknown {
  if (typeof dataIndex !== 'string') {
    return undefined;
  }
  return row[dataIndex];
}

const showVectorColumns = computed(
  () => Boolean(props.data.successContext?.stats?.vectorStats?.totalRecords),
);

const jobStatsTotals = computed(
  () =>
    props.data.successContext?.stats?.jobStats ?? props.data.failureContext?.stats?.jobStats,
);

const entityStatsColumns = computed(() => {
  const totals = jobStatsTotals.value;
  if (!totals || Object.keys(totals).length === 0) {
    return [];
  }
  return [
    { title: t('label.name'), dataIndex: 'name', key: 'name' },
    {
      title: t('label.entity-record-plural', { entity: t('label.total') }),
      dataIndex: 'totalRecords',
      key: 'totalRecords',
    },
    {
      title: t('label.entity-record-plural', { entity: t('label.success') }),
      dataIndex: 'successRecords',
      key: 'successRecords',
    },
    {
      title: t('label.entity-record-plural', { entity: t('label.failed') }),
      dataIndex: 'failedRecords',
      key: 'failedRecords',
    },
    ...(showVectorColumns.value
      ? [
          {
            title: t('label.vector-embedding-plural'),
            dataIndex: 'vectorEmbeddings',
            key: 'vectorEmbeddings',
          },
        ]
      : []),
    { title: t('label.reader-avg'), dataIndex: 'readerAvgMs', key: 'readerAvgMs' },
    { title: t('label.process-avg'), dataIndex: 'processAvgMs', key: 'processAvgMs' },
    { title: t('label.sink-avg'), dataIndex: 'sinkAvgMs', key: 'sinkAvgMs' },
    ...(showVectorColumns.value
      ? [{ title: t('label.vector-avg'), dataIndex: 'vectorAvgMs', key: 'vectorAvgMs' }]
      : []),
  ];
});

interface ServerStatsRow {
  name: string;
  processedRecords: number;
  successRecords: number;
  failedRecords: number;
  partitions: string;
}

const serverStatsData = computed<ServerStatsRow[]>(() => {
  const serverStats = props.data.successContext?.serverStats;
  if (!serverStats) {
    return [];
  }
  return Object.entries(serverStats).map(([serverId, stats]) => ({
    name: serverId,
    processedRecords: stats.processedRecords ?? 0,
    successRecords: stats.successRecords ?? 0,
    failedRecords: stats.failedRecords ?? 0,
    partitions: `${stats.completedPartitions ?? 0}/${stats.totalPartitions ?? 0}`,
  }));
});

const serverStatsColumns = computed(() => {
  if (serverStatsData.value.length === 0) {
    return [];
  }
  return [
    { title: t('label.server'), dataIndex: 'name', key: 'name' },
    {
      title: t('label.entity-record-plural', { entity: t('label.processed') }),
      dataIndex: 'processedRecords',
      key: 'processedRecords',
    },
    {
      title: t('label.entity-record-plural', { entity: t('label.success') }),
      dataIndex: 'successRecords',
      key: 'successRecords',
    },
    {
      title: t('label.entity-record-plural', { entity: t('label.failed') }),
      dataIndex: 'failedRecords',
      key: 'failedRecords',
    },
    { title: t('label.partition-plural'), dataIndex: 'partitions', key: 'partitions' },
  ];
});

const serverCount = computed(() => props.data.successContext?.serverCount);

const serverTotals = computed(() => ({
  processed: serverStatsData.value.reduce((sum, row) => sum + row.processedRecords, 0),
  success: serverStatsData.value.reduce((sum, row) => sum + row.successRecords, 0),
  failed: serverStatsData.value.reduce((sum, row) => sum + row.failedRecords, 0),
}));

function stageBlock(stats: AppRunStats | undefined, key: keyof AppRunStats): AppRunStepStats | undefined {
  return stats?.[key] as AppRunStepStats | undefined;
}
</script>

<template>
  <div>
    <AppStatCard
      v-if="data.successContext?.stats?.jobStats"
      :effective-time-ms="wallClockMs"
      latency-label-key="label.wall-clock"
      :status="data.status"
      :step-stats="data.successContext.stats.jobStats"
      :timestamp="data.timestamp"
      :title="t('label.overall-stat-plural')"
    />
    <AppStatCard
      v-if="data.failureContext?.stats?.jobStats"
      :effective-time-ms="wallClockMs"
      latency-label-key="label.wall-clock"
      :status="data.status"
      :step-stats="data.failureContext.stats.jobStats"
      :timestamp="data.timestamp"
      :title="t('label.overall-stat-plural')"
    />

    <div
      style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; margin-top: 16px"
    >
      <template v-for="contextKey in ['successContext', 'failureContext'] as const" :key="contextKey">
        <AppStatCard
          v-if="stageBlock(data[contextKey]?.stats, 'readerStats')"
          :show-status="false"
          :status="data.status"
          :step-stats="stageBlock(data[contextKey]?.stats, 'readerStats')!"
          :timestamp="data.timestamp"
          :title="t('label.reader-stat-plural')"
        />
      </template>
      <template v-for="contextKey in ['successContext', 'failureContext'] as const" :key="contextKey">
        <AppStatCard
          v-if="stageBlock(data[contextKey]?.stats, 'processStats')"
          :show-status="false"
          :status="data.status"
          :step-stats="stageBlock(data[contextKey]?.stats, 'processStats')!"
          :timestamp="data.timestamp"
          :title="t('label.process-stat-plural')"
        />
      </template>
      <template v-for="contextKey in ['successContext', 'failureContext'] as const" :key="contextKey">
        <AppStatCard
          v-if="stageBlock(data[contextKey]?.stats, 'sinkStats')"
          :show-status="false"
          :status="data.status"
          :step-stats="stageBlock(data[contextKey]?.stats, 'sinkStats')!"
          :timestamp="data.timestamp"
          :title="t('label.sink-stat-plural')"
        />
      </template>
      <template v-for="contextKey in ['successContext', 'failureContext'] as const" :key="contextKey">
        <AppStatCard
          v-if="stageBlock(data[contextKey]?.stats, 'vectorStats')"
          :show-status="false"
          :status="data.status"
          :step-stats="stageBlock(data[contextKey]?.stats, 'vectorStats')!"
          :timestamp="data.timestamp"
          :title="t('label.vector-stat-plural')"
        />
      </template>
    </div>

    <Card v-if="serverStatsData.length > 0" data-testid="server-stats-card" size="small" style="margin-top: 16px">
      <template #title>
        <span>
          {{ t('label.server-stat-plural') }}
          <Tag v-if="serverCount" color="blue">{{ serverCount }}</Tag>
        </span>
      </template>
      <Table
        :columns="serverStatsColumns"
        data-testid="server-stats-table"
        :data-source="serverStatsData"
        :pagination="false"
        row-key="name"
        size="small"
      >
        <template #headerCell="{ column }">
          <span>
            {{ column.title }}
            <Tag v-if="column.key === 'processedRecords'" color="blue">{{ serverTotals.processed }}</Tag>
            <Tag v-if="column.key === 'successRecords'" color="green">{{ serverTotals.success }}</Tag>
            <Tag v-if="column.key === 'failedRecords'" color="red">{{ serverTotals.failed }}</Tag>
          </span>
        </template>
      </Table>
    </Card>

    <Table
      v-if="data.successContext?.stats?.entityStats"
      :columns="entityStatsColumns"
      data-testid="app-entity-stats-history-table"
      :data-source="entityStatsRows(data.successContext.stats.entityStats)"
      :pagination="false"
      row-key="name"
      size="small"
      style="margin-top: 16px"
    >
      <template #headerCell="{ column }">
        <span>
          {{ column.title }}
          <Tag v-if="column.key === 'totalRecords'" color="blue">{{ jobStatsTotals?.totalRecords }}</Tag>
          <Tag v-if="column.key === 'successRecords'" color="green">{{ jobStatsTotals?.successRecords }}</Tag>
          <Tag v-if="column.key === 'failedRecords'" color="red">{{ jobStatsTotals?.failedRecords }}</Tag>
        </span>
      </template>
      <template #bodyCell="{ column, record }">
        <span v-if="column.key === 'readerAvgMs'" data-testid="entity-reader-avg">{{ record.readerAvgMs }}</span>
        <span v-else-if="column.key === 'processAvgMs'" data-testid="entity-process-avg">{{ record.processAvgMs }}</span>
        <span v-else-if="column.key === 'sinkAvgMs'" data-testid="entity-sink-avg">{{ record.sinkAvgMs }}</span>
        <span v-else-if="column.key === 'vectorAvgMs'" data-testid="entity-vector-avg">{{ record.vectorAvgMs }}</span>
        <span v-else-if="column.key === 'vectorEmbeddings'">{{ record.vectorEmbeddings ?? '-' }}</span>
        <span v-else>{{ entityCellValue(record, column.dataIndex) }}</span>
      </template>
    </Table>
    <Table
      v-if="data.failureContext?.stats?.entityStats"
      :columns="entityStatsColumns"
      data-testid="app-entity-stats-history-table"
      :data-source="entityStatsRows(data.failureContext.stats.entityStats)"
      :pagination="false"
      row-key="name"
      size="small"
      style="margin-top: 16px"
    >
      <template #headerCell="{ column }">
        <span>
          {{ column.title }}
          <Tag v-if="column.key === 'totalRecords'" color="blue">{{ jobStatsTotals?.totalRecords }}</Tag>
          <Tag v-if="column.key === 'successRecords'" color="green">{{ jobStatsTotals?.successRecords }}</Tag>
          <Tag v-if="column.key === 'failedRecords'" color="red">{{ jobStatsTotals?.failedRecords }}</Tag>
        </span>
      </template>
      <template #bodyCell="{ column, record }">
        <span v-if="column.key === 'readerAvgMs'" data-testid="entity-reader-avg">{{ record.readerAvgMs }}</span>
        <span v-else-if="column.key === 'processAvgMs'" data-testid="entity-process-avg">{{ record.processAvgMs }}</span>
        <span v-else-if="column.key === 'sinkAvgMs'" data-testid="entity-sink-avg">{{ record.sinkAvgMs }}</span>
        <span v-else-if="column.key === 'vectorAvgMs'" data-testid="entity-vector-avg">{{ record.vectorAvgMs }}</span>
        <span v-else-if="column.key === 'vectorEmbeddings'">{{ record.vectorEmbeddings ?? '-' }}</span>
        <span v-else>{{ entityCellValue(record, column.dataIndex) }}</span>
      </template>
    </Table>

    <div v-if="failureLogs" style="margin-top: 16px">
      <Button data-testid="view-logs-button" type="link" @click="showLogsModal = true">
        {{ t('label.view-entity', { entity: t('label.log-plural') }) }}
      </Button>
    </div>

    <div v-if="hasFailures" style="margin-top: 16px">
      <Button data-testid="view-reindex-failures-button" type="link" @click="showFailuresDrawer = true">
        {{ t('label.view-reindex-failure-plural') }}
      </Button>
    </div>

    <ReindexFailuresDrawer
      :app-name="data.appName"
      :visible="showFailuresDrawer"
      @close="showFailuresDrawer = false"
    />

    <AppLogViewerModal
      :logs="failureLogs"
      :open="showLogsModal"
      :title="t('label.log-plural')"
      :on-close="() => (showLogsModal = false)"
    />
  </div>
</template>
