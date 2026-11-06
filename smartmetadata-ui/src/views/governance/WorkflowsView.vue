<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { Button, Card, Col, Empty, Form, Input, Row, Select, Space, Typography, message } from 'ant-design-vue';
import FormModal from '@/components/shared/FormModal.vue';
import PageHeader from '@/components/shared/PageHeader.vue';
import { ApiError } from '@/api/client';
import { createWorkflow, listWorkflows } from '@/api/workflows';
import type { WorkflowDefinition } from '@/types/governance';
import { getWorkflowCapabilities } from '@/utils/workflowCapabilities';
import {
  DEFAULT_PAGE_SIZE,
  canGoNext,
  canGoPrev,
  createCursorPager,
  entityLabel,
  goNext,
  goPrev,
  resetCursor,
  type CursorPager,
} from '@/features/crud/paging';

const { t } = useI18n();
const router = useRouter();

/**
 * The list-page create button is gated by the same capability the builder
 * reads (useWorkflowLogic): creation is a product capability
 * (allowCreateWorkflow true by product decision, Bai 2026-11-07 option B),
 * not the OSS default. Official gates the button and the modal the same way
 * (WorkflowsPage :284 / :434).
 */
const allowCreateWorkflow = getWorkflowCapabilities().allowCreateWorkflow;

/**
 * Official click-through (WorkflowsPage onWorkflowClick): a card navigates
 * to the detail route with the default tab 'workflow'
 * (WorkflowRouterUtils.getWorkflowDefinitionDetailPath).
 */
function goDetail(workflow: WorkflowDefinition): void {
  const fqn = workflow.fullyQualifiedName || workflow.name;
  void router.push({ name: 'workflow-detail', params: { fqn, tab: 'workflow' } });
}

/**
 * Official page shape (pages/WorkflowDefinitions/WorkflowsPage): a header
 * with subtitle and a create action, a card grid (displayName ?? name plus
 * description), cursor pagination with page sizes 15/25/50, a create modal
 * (name validated against ^[a-zA-Z0-9_-]+$, 3–50 chars, plus a required
 * description — both are required by the create schema), a three-feature
 * empty state, and a permission placeholder on 403. The create modal sends
 * the complete minimal definition per official handleModalSubmit (empty
 * nodes/edges plus a default event-based trigger) and navigates into the
 * builder edit mode after creation; the create action is gated by
 * getWorkflowCapabilities(). Card click-through to the builder/detail route
 * lands with that route, not here.
 */
const WORKFLOW_NAME_REGEX = /^[a-zA-Z0-9_-]+$/;
const WORKFLOW_NAME_MIN_LENGTH = 3;
const WORKFLOW_NAME_MAX_LENGTH = 50;
const PAGE_SIZE_OPTIONS = [15, 25, 50];

const loading = ref(false);
const errorMessage = ref('');
const forbidden = ref(false);
const workflows = ref<WorkflowDefinition[]>([]);
const total = ref(0);
const pageSize = ref(DEFAULT_PAGE_SIZE);
const cursor = ref<CursorPager>(createCursorPager());
const pageAfter = ref<string | undefined>();

const showCreateModal = ref(false);
const creating = ref(false);
const formError = ref('');
const createForm = ref({ name: '', description: '' });

function validateName(value: string): string {
  if (!value) {
    return t('workflows.nameRequired');
  }
  if (!WORKFLOW_NAME_REGEX.test(value)) {
    return t('workflows.nameInvalid');
  }
  if (value.length < WORKFLOW_NAME_MIN_LENGTH) {
    return t('workflows.nameMinLength', { count: WORKFLOW_NAME_MIN_LENGTH });
  }
  if (value.length > WORKFLOW_NAME_MAX_LENGTH) {
    return t('workflows.nameMaxLength', { count: WORKFLOW_NAME_MAX_LENGTH });
  }
  return '';
}

async function load(): Promise<void> {
  loading.value = true;
  errorMessage.value = '';
  forbidden.value = false;
  try {
    const page = await listWorkflows({ limit: pageSize.value, after: cursor.value.after });
    workflows.value = page.data;
    total.value = page.total ?? page.data.length;
    pageAfter.value = page.after;
  } catch (error) {
    if (error instanceof ApiError && error.status === 403) {
      forbidden.value = true;
    } else {
      errorMessage.value = error instanceof Error ? error.message : t('crud.loadFailed');
    }
    workflows.value = [];
  } finally {
    loading.value = false;
  }
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

function onPageSizeChange(value: string | number): void {
  pageSize.value = Number(value);
  cursor.value = resetCursor();
  void load();
}

async function onCreate(): Promise<void> {
  const name = createForm.value.name.trim();
  const description = createForm.value.description.trim();
  const nameError = validateName(name);
  if (nameError || !description) {
    formError.value = nameError || t('workflows.descriptionRequired');
    return;
  }
  formError.value = '';
  creating.value = true;
  try {
    // Official handleModalSubmit (WorkflowsPage): the create modal sends the
    // complete minimal definition — empty nodes/edges plus a default
    // event-based trigger — and navigates into the builder edit mode after
    // creation. A bare {name, description} POST 500s server-side (the
    // trigger is null), which is official behavior, not a product bug.
    const created = await createWorkflow({
      description: description || '',
      displayName: name,
      edges: [],
      name,
      nodes: [],
      trigger: { config: {}, output: [], type: 'eventBasedEntity' },
    });
    showCreateModal.value = false;
    createForm.value = { name: '', description: '' };
    message.success(t('workflows.created', { name: created.name }));
    cursor.value = resetCursor();
    await load();
    const fqn = created.fullyQualifiedName || created.name;
    void router.push({
      name: 'workflow-detail',
      params: { fqn, tab: 'workflow' },
      query: { mode: 'edit' },
    });
  } catch (error) {
    formError.value = error instanceof Error ? error.message : t('crud.loadFailed');
  } finally {
    creating.value = false;
  }
}

onMounted(() => {
  void load();
});
</script>

<template>
  <div data-testid="workflows">
    <PageHeader :header="t('workflows.title')" :sub-header="t('workflows.lead')" />
    <Space style="margin-bottom: 16px">
      <Button
        v-if="allowCreateWorkflow"
        type="primary"
        data-testid="workflows-create"
        @click="showCreateModal = true"
      >
        {{ t('workflows.create') }}
      </Button>
    </Space>
    <Typography.Text v-if="errorMessage" type="danger" data-testid="workflows-error">
      {{ errorMessage }}
      <Button type="link" @click="load">{{ t('crud.retry') }}</Button>
    </Typography.Text>
    <Empty
      v-if="forbidden"
      :description="t('errors.forbidden')"
      data-testid="workflows-forbidden"
    />
    <div v-else-if="!loading && workflows.length === 0 && !errorMessage" data-testid="workflows-empty">
      <Typography.Title :level="4">{{ t('workflows.emptyTitle') }}</Typography.Title>
      <Row :gutter="16" style="margin-bottom: 16px">
        <Col :span="8">
          <Card :title="t('workflows.emptyFeatures.trigger.title')">
            {{ t('workflows.emptyFeatures.trigger.description') }}
          </Card>
        </Col>
        <Col :span="8">
          <Card :title="t('workflows.emptyFeatures.action.title')">
            {{ t('workflows.emptyFeatures.action.description') }}
          </Card>
        </Col>
        <Col :span="8">
          <Card :title="t('workflows.emptyFeatures.sitBack.title')">
            {{ t('workflows.emptyFeatures.sitBack.description') }}
          </Card>
        </Col>
      </Row>
      <Button
        v-if="allowCreateWorkflow"
        type="primary"
        data-testid="workflows-empty-create"
        @click="showCreateModal = true"
      >
        {{ t('workflows.create') }}
      </Button>
    </div>
    <div v-else data-testid="workflows-list">
      <Card :loading="loading">
        <Row :gutter="16">
          <Col v-for="workflow in workflows" :key="workflow.id" :span="8" style="margin-bottom: 16px">
            <Card
              hoverable
              class="workflows__card"
              :data-testid="`workflow-card-${workflow.id}`"
              :title="entityLabel(workflow)"
              tabindex="0"
              @click="goDetail(workflow)"
              @keydown.enter="goDetail(workflow)"
            >
              <p class="workflows__card-description">{{ workflow.description || '—' }}</p>
            </Card>
          </Col>
        </Row>
        <Space data-testid="workflows-pagination">
          <Typography.Text>{{ t('workflows.total', { count: total }) }}</Typography.Text>
          <Select
            :value="pageSize"
            data-testid="workflows-page-size"
            style="width: 90px"
            @change="onPageSizeChange"
          >
            <Select.Option v-for="size in PAGE_SIZE_OPTIONS" :key="size" :value="size">{{ size }}</Select.Option>
          </Select>
          <Button :disabled="!canGoPrev(cursor)" data-testid="workflows-prev" @click="onPrev">
            {{ t('workflows.prev') }}
          </Button>
          <Button :disabled="!canGoNext(pageAfter)" data-testid="workflows-next" @click="onNext">
            {{ t('workflows.next') }}
          </Button>
        </Space>
      </Card>
    </div>
    <FormModal
      :get-container="false"
      :open="showCreateModal && allowCreateWorkflow"
      :title="t('workflows.create')"
      :ok-text="t('crud.create')"
      :cancel-text="t('crud.cancel')"
      :confirm-loading="creating"
      @ok="onCreate"
      @cancel="showCreateModal = false"
    >
      <Typography.Text v-if="formError" type="danger" data-testid="workflows-form-error">{{ formError }}</Typography.Text>
      <Form layout="vertical">
        <Form.Item :label="t('crud.name')" required>
          <Input v-model:value="createForm.name" data-testid="workflows-create-name" />
        </Form.Item>
        <Form.Item :label="t('crud.description')" required>
          <Input.TextArea v-model:value="createForm.description" :rows="3" data-testid="workflows-create-description" />
        </Form.Item>
      </Form>
    </FormModal>
  </div>
</template>

<style scoped>
/*
 * Official card geometry (WorkflowCard): min-height 160px (tw:min-h-40),
 * flex column, description clamped to 3 lines. The Ant Row already
 * stretches its columns, so height: 100% makes every card in a row equal
 * height instead of sizing to its own description length.
 */
.workflows__card {
  height: 100%;
  min-height: 160px;
}

.workflows__card-description {
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
  margin: 0;
}
</style>
