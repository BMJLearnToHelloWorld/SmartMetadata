<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { Button, Card, Select, Space, Table, Typography } from 'ant-design-vue';
import { getOntologyReleaseReview, listOntologyReleaseReviews } from '@/api/ontologyEdit';
import type { OntologyReleaseReview } from '@/types/ontologyEdit';

const { t } = useI18n();
const router = useRouter();

const view = ref<'assigned' | 'created' | 'pending'>('assigned');
const reviews = ref<OntologyReleaseReview[]>([]);
const selected = ref<OntologyReleaseReview | null>(null);
const errorMessage = ref('');
const loading = ref(false);

const columns = [
  { title: t('ontology.edit.reviewRelease'), dataIndex: ['release', 'name'], key: 'release' },
  { title: t('ontology.edit.reviewOntology'), dataIndex: ['ontology', 'name'], key: 'ontology' },
  { title: t('ontology.edit.reviewStatus'), dataIndex: 'status', key: 'status' },
  { title: t('ontology.edit.reviewRequester'), dataIndex: 'requester', key: 'requester' },
];

async function load(): Promise<void> {
  loading.value = true;
  errorMessage.value = '';
  try {
    reviews.value = await listOntologyReleaseReviews(view.value);
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : t('ontology.edit.reviewsFailed');
  } finally {
    loading.value = false;
  }
}

async function selectReview(review: OntologyReleaseReview): Promise<void> {
  errorMessage.value = '';
  try {
    if (review.release?.id) {
      selected.value = await getOntologyReleaseReview(review.release.id);
    } else {
      selected.value = review;
    }
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : t('ontology.edit.reviewsFailed');
  }
}

function openTask(): void {
  if (selected.value?.taskId) {
    void router.push({ name: 'task', params: { id: selected.value.taskId } });
  }
}

onMounted(() => {
  void load();
});
</script>

<template>
  <Card data-testid="ontology-review-panel" style="margin-bottom: 16px">
    <Space direction="vertical" style="width: 100%">
      <Typography.Text strong>{{ t('ontology.edit.reviewsTitle') }}</Typography.Text>
      <Typography.Text v-if="errorMessage" type="danger">{{ errorMessage }}</Typography.Text>
      <Space>
        <Select v-model:value="view" style="width: 160px" data-testid="ontology-review-view" @change="load">
          <Select.Option value="assigned">{{ t('ontology.edit.reviewAssigned') }}</Select.Option>
          <Select.Option value="created">{{ t('ontology.edit.reviewCreated') }}</Select.Option>
          <Select.Option value="pending">{{ t('ontology.edit.reviewPending') }}</Select.Option>
        </Select>
        <Button :loading="loading" data-testid="ontology-review-refresh" @click="load">{{ t('ontology.edit.refreshReviews') }}</Button>
      </Space>
      <Table
        :columns="columns"
        :data-source="reviews.map((item, index) => ({ ...item, key: item.taskId ?? index }))"
        :pagination="false"
        :custom-row="(record: OntologyReleaseReview) => ({ onClick: () => selectReview(record) })"
        data-testid="ontology-review-list"
      />
      <div v-if="selected" data-testid="ontology-review-detail">
        <Typography.Text>
          {{ t('ontology.edit.reviewDetail', { status: selected.status ?? '', canVote: selected.callerCanVote ? t('ontology.edit.yes') : t('ontology.edit.no'), completes: selected.callerCompletesRule ? t('ontology.edit.yes') : t('ontology.edit.no') }) }}
        </Typography.Text>
        <ul>
          <li v-for="(assignee, index) in selected.assignees" :key="index">
            {{ assignee.user ?? assignee.team ?? '' }} — {{ assignee.vote ?? t('ontology.edit.noVote') }}
            <span v-if="assignee.reason">({{ assignee.reason }})</span>
          </li>
        </ul>
        <Typography.Text v-if="selected.latestDecision">
          {{ t('ontology.edit.latestDecision', { vote: selected.latestDecision.vote ?? '', reason: selected.latestDecision.reason ?? '' }) }}
        </Typography.Text>
        <br />
        <Button v-if="selected.taskId" data-testid="ontology-review-open-task" @click="openTask">
          {{ t('ontology.edit.openTask') }}
        </Button>
        <Typography.Text v-else type="secondary">{{ t('ontology.edit.reviewVoteNote') }}</Typography.Text>
      </div>
    </Space>
  </Card>
</template>
