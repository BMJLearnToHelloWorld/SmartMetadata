<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute, useRouter } from 'vue-router';
import { Button, Card, Empty, Space, Tabs, Typography } from 'ant-design-vue';
import PageHeader from '@/components/shared/PageHeader.vue';
import SmTable from '@/components/shared/SmTable.vue';
import { ApiError } from '@/api/client';
import {
  getWorkflowDefinitionByFqn,
  listWorkflowInstances,
  type WorkflowDefinitionDetail,
  type WorkflowInstance,
} from '@/api/workflows';
import { entityLabel } from '@/features/crud/paging';

const { t } = useI18n();
const route = useRoute();
const router = useRouter();

/**
 * Official detail route (constants.ts WORKFLOWS_WITH_FQN_TAB):
 * /workflows/:fqn/:tab, default tab 'workflow'
 * (WorkflowRouterUtils.getWorkflowDefinitionDetailPath). The builder's own
 * tabs are workflow-builder (canvas) + execution-history; this view renders
 * the definition as a read view — the interactive canvas editor is a later
 * subsystem batch and is NOT faked here with a static picture.
 */
const DETAIL_TABS = ['workflow', 'execution-history'] as const;
type DetailTab = (typeof DETAIL_TABS)[number];

const fqn = computed(() => {
  const raw = route.params.fqn;
  const value = Array.isArray(raw) ? raw[0] : raw;
  try {
    return decodeURIComponent(value ?? '');
  } catch {
    return value ?? '';
  }
});

const activeTab = computed<DetailTab>(() => {
  const raw = route.params.tab;
  const value = Array.isArray(raw) ? raw[0] : raw;
  return DETAIL_TABS.includes(value as DetailTab) ? (value as DetailTab) : 'workflow';
});

const detail = ref<WorkflowDefinitionDetail | null>(null);
const loading = ref(false);
const forbidden = ref(false);
const errorMessage = ref('');
const instances = ref<WorkflowInstance[]>([]);
const instancesLoading = ref(false);
const instancesError = ref('');
const instancesLoaded = ref(false);

async function loadDetail(): Promise<void> {
  loading.value = true;
  forbidden.value = false;
  errorMessage.value = '';
  try {
    detail.value = await getWorkflowDefinitionByFqn(fqn.value);
  } catch (error) {
    if (error instanceof ApiError && error.status === 403) {
      forbidden.value = true;
    } else if (error instanceof ApiError && error.status === 404) {
      errorMessage.value = t('workflows.detail.notFound');
    } else {
      errorMessage.value = error instanceof Error ? error.message : t('workflows.detail.loadFailed');
    }
  } finally {
    loading.value = false;
  }
}

async function loadInstances(): Promise<void> {
  if (instancesLoaded.value) {
    return;
  }
  instancesLoading.value = true;
  instancesError.value = '';
  try {
    const page = await listWorkflowInstances(fqn.value, { limit: 25 });
    instances.value = page.data;
    instancesLoaded.value = true;
  } catch (error) {
    instancesError.value = error instanceof Error ? error.message : t('workflows.detail.historyLoadFailed');
  } finally {
    instancesLoading.value = false;
  }
}

function onTabChange(tab: string): void {
  void router.replace({
    name: 'workflow-detail',
    params: { fqn: fqn.value, tab },
  });
}

function formatStartedAt(value: number | undefined): string {
  if (value === undefined) {
    return '—';
  }
  return new Date(value).toLocaleString();
}

function relatedEntityName(instance: WorkflowInstance): string {
  const link = instance.variables?.relatedEntity as string | undefined;
  if (!link) {
    return '—';
  }
  // Entity links look like <#E::table::fqn>; show the trailing fqn part as
  // text rather than inventing a route mapping for every entity type.
  const parts = link.split('::');
  return parts[parts.length - 1]?.replace(/[>#]+$/, '') || link;
}

const historyColumns = computed(() => [
  { title: t('workflows.detail.startedAt'), dataIndex: 'startedAt', key: 'startedAt' },
  { title: t('workflows.detail.status'), dataIndex: 'status', key: 'status' },
  { title: t('workflows.detail.relatedEntity'), key: 'relatedEntity' },
]);

const nodeItems = computed(() => {
  const nodes = detail.value?.nodes;
  return Array.isArray(nodes) ? nodes : [];
});

const edgeItems = computed(() => {
  const edges = detail.value?.edges;
  return Array.isArray(edges) ? edges : [];
});

function nodeLabel(node: unknown): string {
  if (typeof node === 'string') {
    return node;
  }
  const rec = node as Record<string, unknown>;
  const name = typeof rec.name === 'string' ? rec.name : undefined;
  const type = typeof rec.type === 'string' ? rec.type : undefined;
  return [name, type].filter(Boolean).join(' — ') || JSON.stringify(node);
}

watch(activeTab, (tab) => {
  if (tab === 'execution-history') {
    void loadInstances();
  }
});

onMounted(() => {
  // Unknown :tab values fall back to the official default tab.
  if (!DETAIL_TABS.includes(route.params.tab as DetailTab)) {
    void router.replace({
      name: 'workflow-detail',
      params: { fqn: fqn.value, tab: 'workflow' },
    });
  }
  void loadDetail();
  if (activeTab.value === 'execution-history') {
    void loadInstances();
  }
});
</script>

<template>
  <div data-testid="workflow-detail">
    <Button
      type="link"
      data-testid="workflow-detail-back"
      style="padding-left: 0"
      @click="router.push({ name: 'workflows' })"
    >
      {{ t('workflows.detail.back') }}
    </Button>
    <PageHeader
      :header="detail ? entityLabel(detail) : fqn"
      :sub-header="detail?.description || fqn"
    />
    <Card v-if="forbidden" data-testid="workflow-detail-forbidden">
      <Empty :description="t('errors.forbidden')" />
    </Card>
    <Card v-else-if="errorMessage" data-testid="workflow-detail-error">
      <Empty :description="errorMessage" />
    </Card>
    <div v-else>
      <Typography.Text v-if="detail?.version !== undefined" type="secondary">
        {{ t('workflows.detail.version', { version: detail.version }) }}
      </Typography.Text>
      <Tabs
        :active-key="activeTab"
        data-testid="workflow-detail-tabs"
        @change="onTabChange"
      >
        <Tabs.TabPane key="workflow" :tab="t('workflows.detail.workflowTab')">
          <Space direction="vertical" style="width: 100%">
            <Card :title="t('workflows.detail.trigger')" data-testid="workflow-detail-trigger">
              <Typography.Paragraph v-if="detail?.trigger !== undefined">
                <pre style="white-space: pre-wrap; margin: 0">{{
                  JSON.stringify(detail.trigger, null, 2)
                }}</pre>
              </Typography.Paragraph>
              <Empty v-else :description="t('workflows.detail.noTrigger')" />
            </Card>
            <Card :title="t('workflows.detail.nodes')" data-testid="workflow-detail-nodes">
              <ul v-if="nodeItems.length > 0" style="margin: 0; padding-left: 20px">
                <li v-for="(node, index) in nodeItems" :key="index">{{ nodeLabel(node) }}</li>
              </ul>
              <Empty v-else :description="t('workflows.detail.noNodes')" />
            </Card>
            <Card :title="t('workflows.detail.edges')" data-testid="workflow-detail-edges">
              <Typography.Text v-if="edgeItems.length > 0">
                {{ t('workflows.detail.edgeCount', { count: edgeItems.length }) }}
              </Typography.Text>
              <Empty v-else :description="t('workflows.detail.noEdges')" />
            </Card>
            <Card
              :title="t('workflows.detail.configuration')"
              data-testid="workflow-detail-configuration"
            >
              <Typography.Paragraph v-if="detail?.config !== undefined">
                <pre style="white-space: pre-wrap; margin: 0">{{
                  JSON.stringify(detail.config, null, 2)
                }}</pre>
              </Typography.Paragraph>
              <Empty v-else :description="t('workflows.detail.noConfiguration')" />
            </Card>
          </Space>
        </Tabs.TabPane>
        <Tabs.TabPane key="execution-history" :tab="t('workflows.detail.historyTab')">
          <Typography.Text v-if="instancesError" type="danger" data-testid="workflow-history-error">
            {{ instancesError }}
          </Typography.Text>
          <SmTable
            row-key="id"
            test-id="workflow-history-table"
            size="small"
            :columns="historyColumns"
            :data-source="instances"
            :loading="instancesLoading"
            :pagination="false"
            :empty-text="t('workflows.detail.historyEmpty')"
          >
            <template #bodyCell="{ column, record }">
              <template v-if="column.key === 'startedAt'">
                {{ formatStartedAt((record as WorkflowInstance).startedAt) }}
              </template>
              <template v-else-if="column.key === 'status'">
                {{ (record as WorkflowInstance).status || '—' }}
              </template>
              <template v-else-if="column.key === 'relatedEntity'">
                {{ relatedEntityName(record as WorkflowInstance) }}
              </template>
            </template>
          </SmTable>
        </Tabs.TabPane>
      </Tabs>
    </div>
  </div>
</template>
