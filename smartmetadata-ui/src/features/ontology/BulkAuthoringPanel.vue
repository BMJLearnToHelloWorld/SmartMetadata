<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { Button, Card, Form, Input, Select, Space, Switch, Table, Typography, message } from 'ant-design-vue';
import {
  cancelOntologyBulkJob,
  getOntologyBulkJob,
  getOntologyBulkResultArtifact,
  getOntologyBulkTemplate,
  listOntologyBulkJobs,
  submitOntologyBulkOperation,
} from '@/api/ontologyEdit';
import type { OntologyBulkJob, OntologyBulkResultArtifact, OntologyBulkTemplate } from '@/types/ontologyEdit';

const props = defineProps<{
  canEdit: boolean;
}>();

const { t } = useI18n();

const template = ref<OntologyBulkTemplate | null>(null);
const jobs = ref<OntologyBulkJob[]>([]);
const selectedJob = ref<OntologyBulkJob | null>(null);
const artifact = ref<OntologyBulkResultArtifact | null>(null);
const errorMessage = ref('');
const busy = ref('');

const form = ref({ glossaryId: '', operation: 'UPSERT', dryRun: true, changeSetName: '', changeSetDescription: '', csv: '' });

const jobColumns = [
  { title: 'ID', dataIndex: 'id', key: 'id' },
  { title: 'operation', dataIndex: 'operation', key: 'operation' },
  { title: 'status', dataIndex: 'status', key: 'status' },
  { title: 'progress', dataIndex: 'progress', key: 'progress' },
];

function downloadTemplate(): void {
  if (!template.value?.csv) {
    return;
  }
  const blob = new Blob([template.value.csv], { type: template.value.mediaType || 'text/csv' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = template.value.fileName || 'ontology-bulk-template.csv';
  anchor.click();
  URL.revokeObjectURL(url);
}

async function loadTemplate(): Promise<void> {
  try {
    template.value = await getOntologyBulkTemplate();
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : t('ontology.edit.bulkFailed');
  }
}

async function loadJobs(): Promise<void> {
  try {
    const page = await listOntologyBulkJobs(20);
    jobs.value = page.data;
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : t('ontology.edit.bulkFailed');
  }
}

async function onFile(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) {
    return;
  }
  form.value.csv = await file.text();
}

async function onSubmit(): Promise<void> {
  if (!props.canEdit || !form.value.glossaryId || !form.value.changeSetName || !form.value.changeSetDescription) {
    return;
  }
  busy.value = 'submit';
  errorMessage.value = '';
  try {
    const submission = await submitOntologyBulkOperation({
      glossaryId: form.value.glossaryId,
      operation: form.value.operation,
      dryRun: form.value.dryRun,
      changeSetName: form.value.changeSetName,
      changeSetDescription: form.value.changeSetDescription,
      csv: form.value.csv || undefined,
    });
    message.success(t('ontology.edit.bulkSubmitted', { mode: submission.executionMode ?? '' }));
    await loadJobs();
    if (submission.job) {
      selectedJob.value = submission.job;
    }
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : t('ontology.edit.bulkFailed');
  } finally {
    busy.value = '';
  }
}

async function onSelectJob(job: OntologyBulkJob): Promise<void> {
  busy.value = 'job';
  errorMessage.value = '';
  artifact.value = null;
  try {
    selectedJob.value = await getOntologyBulkJob(job.id);
    artifact.value = await getOntologyBulkResultArtifact(job.id);
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : t('ontology.edit.bulkFailed');
  } finally {
    busy.value = '';
  }
}

async function onCancelJob(): Promise<void> {
  if (!selectedJob.value) {
    return;
  }
  busy.value = 'cancel';
  errorMessage.value = '';
  try {
    selectedJob.value = await cancelOntologyBulkJob(selectedJob.value.id);
    await loadJobs();
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : t('ontology.edit.bulkFailed');
  } finally {
    busy.value = '';
  }
}

onMounted(() => {
  void loadTemplate();
  void loadJobs();
});
</script>

<template>
  <Card data-testid="ontology-bulk-panel" style="margin-bottom: 16px">
    <Space direction="vertical" style="width: 100%">
      <Typography.Text strong>{{ t('ontology.edit.bulkTitle') }}</Typography.Text>
      <Typography.Text v-if="errorMessage" type="danger">{{ errorMessage }}</Typography.Text>
      <Space>
        <Button :disabled="!template?.csv" data-testid="ontology-bulk-template-download" @click="downloadTemplate">
          {{ t('ontology.edit.downloadTemplate') }}
        </Button>
        <Typography.Text v-if="template">{{ t('ontology.edit.templateHeaders', { headers: template.headers.join(', ') }) }}</Typography.Text>
        <Button data-testid="ontology-bulk-jobs-refresh" @click="loadJobs">{{ t('ontology.edit.refreshJobs') }}</Button>
      </Space>
      <Form layout="inline" data-testid="ontology-bulk-form">
        <Form.Item :label="t('ontology.edit.glossaryId')"><Input v-model:value="form.glossaryId" data-testid="ontology-bulk-glossary" /></Form.Item>
        <Form.Item :label="t('ontology.edit.operation')">
          <Select v-model:value="form.operation" style="width: 140px" data-testid="ontology-bulk-operation">
            <Select.Option value="UPSERT">UPSERT</Select.Option>
            <Select.Option value="FIND_REPLACE">FIND_REPLACE</Select.Option>
            <Select.Option value="RETYPE">RETYPE</Select.Option>
          </Select>
        </Form.Item>
        <Form.Item :label="t('ontology.edit.dryRun')"><Switch v-model:checked="form.dryRun" data-testid="ontology-bulk-dry-run" /></Form.Item>
        <Form.Item :label="t('ontology.edit.changeSetName')"><Input v-model:value="form.changeSetName" data-testid="ontology-bulk-changeset-name" /></Form.Item>
        <Form.Item :label="t('ontology.edit.changeSetDescription')"><Input v-model:value="form.changeSetDescription" data-testid="ontology-bulk-changeset-description" /></Form.Item>
      </Form>
      <Form.Item :label="t('ontology.edit.csvFile')">
        <input type="file" accept=".csv,text/csv" data-testid="ontology-bulk-file" @change="onFile" />
      </Form.Item>
      <Input.TextArea v-model:value="form.csv" :rows="4" :placeholder="t('ontology.edit.csvPlaceholder')" data-testid="ontology-bulk-csv" />
      <Button
        type="primary"
        :disabled="!canEdit || !form.glossaryId || !form.changeSetName || !form.changeSetDescription"
        :loading="busy === 'submit'"
        data-testid="ontology-bulk-submit"
        @click="onSubmit"
      >
        {{ t('ontology.edit.submitBulk') }}
      </Button>
      <Table
        :columns="jobColumns"
        :data-source="jobs.map((job) => ({ ...job, key: job.id }))"
        :pagination="false"
        :custom-row="(record: OntologyBulkJob) => ({ onClick: () => onSelectJob(record) })"
        data-testid="ontology-bulk-jobs"
      />
      <div v-if="selectedJob" data-testid="ontology-bulk-job-detail">
        <Space>
          <Typography.Text>{{ t('ontology.edit.jobStatus', { id: selectedJob.id, status: selectedJob.status ?? '' }) }}</Typography.Text>
          <Button :disabled="!canEdit" :loading="busy === 'cancel'" data-testid="ontology-bulk-job-cancel" @click="onCancelJob">
            {{ t('ontology.edit.cancelJob') }}
          </Button>
        </Space>
        <div v-if="artifact" data-testid="ontology-bulk-artifact">
          <Typography.Text>
            {{ t('ontology.edit.artifactSummary', { total: artifact.totalRows ?? 0, valid: artifact.validRows ?? 0, invalid: artifact.invalidRows ?? 0, created: artifact.createCount ?? 0, updated: artifact.updateCount ?? 0 }) }}
          </Typography.Text>
          <ul>
            <li v-for="(err, index) in artifact.errors" :key="index">
              {{ t('ontology.edit.artifactError', { row: err.row ?? '', message: err.message ?? '' }) }}
            </li>
          </ul>
        </div>
      </div>
    </Space>
  </Card>
</template>
