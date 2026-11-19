<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { Button, Card, Form, Input, Spin, Typography, message } from 'ant-design-vue';
import { AimOutlined, NodeIndexOutlined, SettingOutlined, ThunderboltOutlined } from '@ant-design/icons-vue';
import FeaturesPlaceholder from '@/components/shared/FeaturesPlaceholder.vue';
import NextPrevious from '@/components/shared/NextPrevious.vue';
import PageHeader from '@/components/shared/PageHeader.vue';
import PermissionPlaceholder from '@/components/shared/PermissionPlaceholder.vue';
import SmDrawer from '@/components/shared/SmDrawer.vue';
import SomethingWentWrongPlaceholder from '@/components/shared/SomethingWentWrongPlaceholder.vue';
import { ApiError } from '@/api/client';
import { createWorkflow, listWorkflows } from '@/api/workflows';
import type { WorkflowDefinition } from '@/types/governance';
import type { EmptyPlaceholderAction, EmptyPlaceholderFeature } from '@/utils/emptyPlaceholder';
import {
  CursorType,
  INITIAL_PAGING,
  PAGE_SIZE_MEDIUM,
  type Paging,
  type PagingHandlerParams,
} from '@/utils/pagination';
import { getWorkflowCapabilities } from '@/utils/workflowCapabilities';

const { t } = useI18n();
const router = useRouter();

/**
 * Official page shape (pages/WorkflowDefinitions/WorkflowsPage): a
 * classic header (bordered box, PageHeader + create button in one
 * row) above every non-loading branch; loading shows only a Loader;
 * errors split 403 (permission placeholder) from the rest (reload
 * placeholder); the empty state is a features placeholder; the list
 * is a responsive card grid with cursor pagination. The create
 * drawer (640 wide, gated by allowCreateWorkflow) validates the raw
 * name, sends the complete minimal definition, refetches page 1 and
 * navigates into the builder edit mode — with no success toast.
 * Creation itself is a product capability (allowCreateWorkflow true
 * by product decision, Bai 2026-11-07 option B), not the OSS
 * default; official gates the button and the drawer the same way
 * (WorkflowsPage :284 / :437).
 */
const allowCreateWorkflow = getWorkflowCapabilities().allowCreateWorkflow;

const WORKFLOW_NAME_REGEX = /^[a-zA-Z0-9_-]+$/;
const WORKFLOW_NAME_MIN_LENGTH = 3;
const WORKFLOW_NAME_MAX_LENGTH = 50;

const loading = ref(false);
const loadError = ref<unknown>();
const workflows = ref<WorkflowDefinition[]>([]);
const paging = ref<Paging>({ ...INITIAL_PAGING });
const currentPage = ref(1);
const pageSize = ref(PAGE_SIZE_MEDIUM);

const isForbidden = computed(
  () => loadError.value instanceof ApiError && loadError.value.status === 403,
);

const showCreateModal = ref(false);
const creating = ref(false);
const nameError = ref('');
const createForm = ref({ name: '', description: '' });

// Official name field: typing clears the inline error
// (WorkflowsPage.tsx:476-480).
watch(
  () => createForm.value.name,
  () => {
    nameError.value = '';
  },
);

/**
 * Official click-through (WorkflowsPage onWorkflowClick): a card
 * navigates to the detail route. The `:tab` segment is gone (shell
 * B-5 / D-5, landed by the sections integration): the builder tab
 * is component state in the detail view, so navigations carry only
 * the FQN and the legacy tab URLs redirect at the router.
 */
function goDetail(workflow: WorkflowDefinition): void {
  const fqn = workflow.fullyQualifiedName || workflow.name;
  void router.push({ name: 'workflow-detail', params: { fqn } });
}

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

async function fetchWorkflows(
  page = 1,
  cursor?: Partial<Record<CursorType, string>>,
): Promise<void> {
  loading.value = true;
  loadError.value = undefined;
  try {
    const result = await listWorkflows({ limit: pageSize.value, ...cursor });
    workflows.value = result.data;
    paging.value = {
      after: result.after,
      before: result.before,
      total: result.total ?? result.data.length,
    };
    currentPage.value = page;
  } catch (error) {
    // Official getWorkflows: the error is recorded without clearing
    // the list; the error placeholder covers the page.
    loadError.value = error;
  } finally {
    loading.value = false;
  }
}

function handlePageChange({ cursorType, currentPage: page }: PagingHandlerParams): void {
  // Official handlePageChange (WorkflowsPage.tsx:210-217): fetch only
  // when both the cursor type and its cursor are truthy.
  const cursor = cursorType ? paging.value[cursorType] : undefined;
  if (cursorType && cursor) {
    void fetchWorkflows(page, { [cursorType]: cursor });
  }
}

function handleSizeChange(size: number): void {
  // Official size change refetches from page 1 (getWorkflows depends
  // on pageSize and defaults to page 1).
  pageSize.value = size;
  void fetchWorkflows(1);
}

function resetCreateForm(): void {
  createForm.value = { name: '', description: '' };
  nameError.value = '';
}

function closeCreate(): void {
  showCreateModal.value = false;
  creating.value = false;
  resetCreateForm();
}

async function onCreate(): Promise<void> {
  if (creating.value) {
    return;
  }
  // Validation and payload use the raw, untrimmed values
  // (WorkflowsPage.tsx:123-144, 238-247).
  const error = validateName(createForm.value.name);
  if (error) {
    nameError.value = error;
    return;
  }
  creating.value = true;
  try {
    // Official handleModalSubmit: the complete minimal definition —
    // empty nodes/edges plus a default event-based trigger. A bare
    // {name, description} POST 500s server-side (the trigger is
    // null), which is official behavior, not a product bug.
    const created = await createWorkflow({
      description: createForm.value.description || '',
      displayName: createForm.value.name,
      edges: [],
      name: createForm.value.name,
      nodes: [],
      trigger: { config: {}, output: [], type: 'eventBasedEntity' },
    });
    await fetchWorkflows(1);
    closeCreate();
    const fqn = created.fullyQualifiedName || created.name;
    void router.push({
      name: 'workflow-detail',
      params: { fqn },
      query: { mode: 'edit' },
    });
  } catch (error) {
    message.error(error instanceof Error ? error.message : t('workflows.createEntityError'));
  } finally {
    creating.value = false;
  }
}

const emptyFeatures = computed<EmptyPlaceholderFeature[]>(() => [
  {
    key: 'trigger',
    icon: ThunderboltOutlined,
    title: t('workflows.emptyFeatures.trigger.title'),
    description: t('workflows.emptyFeatures.trigger.description'),
  },
  {
    key: 'action',
    icon: AimOutlined,
    title: t('workflows.emptyFeatures.action.title'),
    description: t('workflows.emptyFeatures.action.description'),
  },
  {
    key: 'sitBack',
    icon: SettingOutlined,
    title: t('workflows.emptyFeatures.sitBack.title'),
    description: t('workflows.emptyFeatures.sitBack.description'),
  },
]);

const emptyActions = computed<EmptyPlaceholderAction[]>(() =>
  allowCreateWorkflow
    ? [
        {
          key: 'new-workflow',
          label: t('workflows.newWorkflow'),
          testId: 'workflows-empty-create',
          onPress: () => {
            showCreateModal.value = true;
          },
          color: 'primary',
        },
      ]
    : [],
);

onMounted(() => {
  void fetchWorkflows();
});
</script>

<template>
  <div data-testid="workflows">
    <div v-if="loading" class="workflows__loader">
      <Spin />
    </div>
    <template v-else>
      <div class="workflows__header">
        <PageHeader :header="t('workflows.title')" :sub-header="t('workflows.lead')" />
        <Button
          v-if="allowCreateWorkflow"
          type="primary"
          data-testid="workflows-create"
          @click="showCreateModal = true"
        >
          {{ t('workflows.newWorkflow') }}
        </Button>
      </div>
      <div v-if="loadError" class="workflows__placeholder-host" data-testid="workflows-error">
        <PermissionPlaceholder
          v-if="isForbidden"
          :permission-value="t('workflows.viewWorkflows')"
        />
        <SomethingWentWrongPlaceholder
          v-else
          :title="t('workflows.entityFetchError')"
          :on-reload="() => fetchWorkflows()"
        />
      </div>
      <div
        v-else-if="workflows.length === 0"
        class="workflows__placeholder-host"
        data-testid="workflows-empty"
      >
        <FeaturesPlaceholder
          :title="t('workflows.emptyTitle')"
          :description="t('workflows.emptyDescription')"
          :features="emptyFeatures"
          :actions="emptyActions"
        />
      </div>
      <div v-else data-testid="workflows-list">
        <div class="workflows__grid">
          <Card
            v-for="workflow in workflows"
            :key="workflow.id"
            hoverable
            class="workflows__card"
            :data-testid="`workflow-card-${workflow.id}`"
            tabindex="0"
            @click="goDetail(workflow)"
            @keydown.enter="goDetail(workflow)"
          >
            <div class="workflows__card-head">
              <span class="workflows__card-icon"><NodeIndexOutlined /></span>
              <span
                class="workflows__card-title"
                :title="workflow.displayName ?? workflow.name"
              >
                {{ workflow.displayName ?? workflow.name }}
              </span>
            </div>
            <div class="workflows__card-divider" />
            <p
              class="workflows__card-description"
              :title="workflow.description || undefined"
            >
              {{ workflow.description }}
            </p>
          </Card>
        </div>
        <div data-testid="workflows-pagination">
          <NextPrevious
            :paging="paging"
            :paging-handler="handlePageChange"
            :page-size="pageSize"
            :current-page="currentPage"
            :is-loading="loading"
            :on-show-size-change="handleSizeChange"
          />
        </div>
      </div>
      <SmDrawer
        :open="showCreateModal && allowCreateWorkflow"
        width-key="workflowCreate"
        test-id="workflows-create-drawer"
        :title="t('workflows.createNewWorkflow')"
        :ok-text="t('workflows.saveAndNext')"
        :cancel-text="t('crud.cancel')"
        :confirm-loading="creating"
        :ok-disabled="creating"
        @ok="onCreate"
        @cancel="closeCreate"
      >
        <Typography.Paragraph>{{ t('workflows.createDescription') }}</Typography.Paragraph>
        <Form layout="vertical">
          <Form.Item
            :label="t('workflows.workflowName')"
            required
            :validate-status="nameError ? 'error' : undefined"
            :help="nameError"
          >
            <Input
              v-model:value="createForm.name"
              :placeholder="t('workflows.workflowNamePlaceholder')"
              :disabled="creating"
              data-testid="workflows-create-name"
            />
          </Form.Item>
          <Form.Item :label="t('crud.description')">
            <Input.TextArea
              v-model:value="createForm.description"
              :rows="4"
              :placeholder="t('crud.description')"
              :disabled="creating"
              data-testid="workflows-create-description"
            />
          </Form.Item>
        </Form>
      </SmDrawer>
    </template>
  </div>
</template>

<style scoped>
.workflows__loader {
  display: flex;
  justify-content: center;
  padding: 48px 0;
}

.workflows__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 16px 24px;
  background: var(--sm-bg-container);
  border: 1px solid var(--sm-border-secondary);
  border-radius: 12px;
  margin-bottom: 16px;
}

.workflows__placeholder-host {
  position: relative;
  min-height: 240px;
  width: 100%;
}

/*
 * Official card grid (WorkflowList): 1 column below 640px, 2 below
 * 1024px, 3 above, 20px gaps, 16px bottom padding. Official card
 * geometry (WorkflowCard): min-height 160px, a 24px brand icon box
 * with a 12px white icon, a 1-row ellipsis medium title, a divider,
 * and a description clamped to 3 lines.
 */
.workflows__grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 20px;
  padding-bottom: 16px;
}

@media (min-width: 640px) {
  .workflows__grid {
    grid-template-columns: repeat(2, 1fr);
  }
}

@media (min-width: 1024px) {
  .workflows__grid {
    grid-template-columns: repeat(3, 1fr);
  }
}

.workflows__card {
  height: 100%;
  min-height: 160px;
}

.workflows__card-head {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.workflows__card-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: none;
  width: 24px;
  height: 24px;
  border-radius: 6px;
  background: var(--sm-color-primary);
  color: var(--sm-text-on-primary);
  font-size: 12px;
}

.workflows__card-title {
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.workflows__card-divider {
  border-top: 1px solid var(--sm-border-secondary);
  margin: 12px 0;
}

.workflows__card-description {
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
  margin: 0;
}
</style>
