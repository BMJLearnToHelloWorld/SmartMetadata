<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { Button, Card, Progress, Space, Typography } from 'ant-design-vue';
import { cancelCsvAsyncJob, type CsvAsyncJob } from '@/api/csvImport';
import { CSV_JOBS_REFRESH_EVENT, listCsvAsyncJobs } from '@/api/csvJobs';
import { downloadTextFile } from '@/features/csv/csv';

/**
 * Official CsvJobsTray (components/common/EntityImport/CsvJobsTray):
 * a floating tray listing the user's CSV import/export jobs with status,
 * progress, cancel, result download, and dismiss. Official refreshes via
 * websocket + a refresh event; the product has no import-job websocket
 * channel, so this tray polls the list (5s) while any job is active and
 * refreshes on the csv-jobs-refresh event dispatched when a job starts.
 * Jobs are listed server-side for the current user only
 * (CsvAsyncJobResource listJobs). Dismissal is session-only.
 */
const { t } = useI18n();

const ACTIVE_STATUSES = ['QUEUED', 'RUNNING', 'CANCELLING'];

const jobs = ref<CsvAsyncJob[]>([]);
const dismissed = ref(new Set<string>());
const open = ref(false);
const loading = ref(false);
const errorMessage = ref('');
const cancelling = ref('');
const downloading = ref('');
let timer: ReturnType<typeof setInterval> | null = null;

const visibleJobs = computed(() => jobs.value.filter((job) => !dismissed.value.has(job.jobId)));
const activeCount = computed(
  () => visibleJobs.value.filter((job) => job.status && ACTIVE_STATUSES.includes(job.status)).length,
);

function jobPercent(job: CsvAsyncJob): number {
  const total = job.total ?? 0;
  const progress = job.progress ?? 0;
  return total > 0 ? Math.round((progress / total) * 100) : 0;
}

async function refresh(): Promise<void> {
  loading.value = true;
  errorMessage.value = '';
  try {
    jobs.value = await listCsvAsyncJobs(50);
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : t('crud.loadFailed');
  } finally {
    loading.value = false;
  }
  schedulePoll();
}

function schedulePoll(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
  const hasActive = jobs.value.some((job) => job.status && ACTIVE_STATUSES.includes(job.status));
  if (hasActive) {
    timer = setInterval(() => {
      void refresh();
    }, 5000);
  }
}

function onRefreshEvent(): void {
  open.value = true;
  void refresh();
}

async function onCancel(job: CsvAsyncJob): Promise<void> {
  cancelling.value = job.jobId;
  try {
    await cancelCsvAsyncJob(job.jobId);
    await refresh();
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : t('crud.loadFailed');
  } finally {
    cancelling.value = '';
  }
}

async function onDownload(job: CsvAsyncJob): Promise<void> {
  downloading.value = job.jobId;
  try {
    const response = await fetch(`/api/v1/csvAsyncJobs/${encodeURIComponent(job.jobId)}/result`, {
      headers: { Accept: 'text/csv' },
    });
    if (!response.ok) {
      throw new Error(t('csvJobs.resultUnavailable'));
    }
    downloadTextFile(`csv-job-${job.jobId}.csv`, await response.text());
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : t('crud.loadFailed');
  } finally {
    downloading.value = '';
  }
}

function onDismiss(job: CsvAsyncJob): void {
  dismissed.value = new Set([...dismissed.value, job.jobId]);
}

onMounted(() => {
  window.addEventListener(CSV_JOBS_REFRESH_EVENT, onRefreshEvent);
});

onUnmounted(() => {
  window.removeEventListener(CSV_JOBS_REFRESH_EVENT, onRefreshEvent);
  if (timer) {
    clearInterval(timer);
  }
});
</script>

<template>
  <div style="position: fixed; right: 16px; bottom: 16px; z-index: 1000">
    <Button
      type="primary"
      shape="round"
      data-testid="csv-jobs-tray-button"
      @click="
        open = !open;
        if (open) void refresh();
      "
    >
      {{ t('csvJobs.title') }}
      <span v-if="activeCount > 0">({{ activeCount }})</span>
    </Button>
    <Card
      v-if="open"
      :title="t('csvJobs.title')"
      :loading="loading"
      style="width: 360px; margin-top: 8px"
    >
      <template #extra>
        <Button size="small" data-testid="csv-jobs-tray-refresh" @click="refresh">
          {{ t('csvJobs.refresh') }}
        </Button>
      </template>
      <Space direction="vertical" style="width: 100%">
        <Typography.Text v-if="errorMessage" type="danger">{{ errorMessage }}</Typography.Text>
        <Typography.Text v-if="visibleJobs.length === 0" type="secondary">
          {{ t('csvJobs.empty') }}
        </Typography.Text>
        <div v-for="job in visibleJobs" :key="job.jobId" :data-testid="`csv-jobs-tray-job-${job.jobId}`">
          <Space direction="vertical" style="width: 100%">
            <Typography.Text strong>
              {{ job.operation ?? t('csvJobs.job') }} · {{ job.entityType ?? '' }}
              {{ job.targetFqn ? `(${job.targetFqn})` : '' }}
            </Typography.Text>
            <Typography.Text type="secondary">
              {{ job.status ?? '' }}
              <span v-if="job.total"> {{ job.progress ?? 0 }}/{{ job.total }} </span>
              <span v-if="job.error"> — {{ job.error }}</span>
            </Typography.Text>
            <Progress
              v-if="job.status && ACTIVE_STATUSES.includes(job.status)"
              :percent="jobPercent(job)"
              size="small"
            />
            <Space wrap>
              <Button
                v-if="job.status && ACTIVE_STATUSES.includes(job.status)"
                size="small"
                danger
                :loading="cancelling === job.jobId"
                @click="onCancel(job)"
              >
                {{ t('csvJobs.cancel') }}
              </Button>
              <Button
                v-if="job.status === 'COMPLETED' || job.status === 'FAILED'"
                size="small"
                :loading="downloading === job.jobId"
                @click="onDownload(job)"
              >
                {{ t('csvJobs.downloadResult') }}
              </Button>
              <Button size="small" @click="onDismiss(job)">{{ t('csvJobs.dismiss') }}</Button>
            </Space>
          </Space>
        </div>
      </Space>
    </Card>
  </div>
</template>
