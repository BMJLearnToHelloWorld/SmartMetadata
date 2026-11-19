<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed, h, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute, useRouter } from 'vue-router';
import { Button, Card, Empty, Modal, Spin, Tabs, Typography } from 'ant-design-vue';
import { ApiError } from '@/api/client';
import ConnectionConditionModal from '@/components/governance/workflowBuilder/ConnectionConditionModal.vue';
import NodeFormSidebar from '@/components/governance/workflowBuilder/NodeFormSidebar.vue';
import WorkflowCanvas from '@/components/governance/workflowBuilder/WorkflowCanvas.vue';
import WorkflowExecutionHistory from '@/components/governance/workflowBuilder/WorkflowExecutionHistory.vue';
import WorkflowHeader from '@/components/governance/workflowBuilder/WorkflowHeader.vue';
import WorkflowSidebar from '@/components/governance/workflowBuilder/WorkflowSidebar.vue';
import SmBreadcrumb, { type SmBreadcrumbItem } from '@/components/shared/SmBreadcrumb.vue';
import { useWorkflowBuilder } from '@/composables/useWorkflowBuilder';
import { WORKFLOW_BUILDER_TAB_TEST_IDS } from '@/constants/workflowBuilder';

const { t } = useI18n();
const route = useRoute();
const router = useRouter();

/**
 * Official WorkflowBuilder page (pin a3012259ca): the builder route
 * carries only :fqn, and the active tab is component-local state
 * defaulting to the first tab, matching official's useState
 * (WorkflowBuilder.tsx:252-253,720-721). The builder's own tabs are the
 * canvas ('workflow-builder' in official, 'workflow' here) and the
 * execution history. The header is the page variant — the product has no
 * embedded host. No-fqn redirects to the list: creating a workflow is
 * gated off in OSS.
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

const fqnRef = computed<string | undefined>(() => fqn.value || undefined);

const activeTab = ref<DetailTab>(DETAIL_TABS[0]);

const isCanvasTabActive = computed(() => activeTab.value === 'workflow');

const builder = useWorkflowBuilder(fqnRef, { t });
const { state, mode, logic, actions } = builder;

const workflowDisplayName = computed(
  () =>
    state.state.workflowMetadata?.displayName ||
    t('workflows.builder.workflowBuilder'),
);
const workflowName = computed(() => state.state.workflowMetadata?.name);

/**
 * Pin Classic breadcrumb (WorkflowBuilder.tsx:552-562): the builder builds
 * its own single-item TitleBreadcrumb — {name: workflow-plural, url: list
 * path} — instead of the settings helper, whose subCategory no pin caller
 * ever passes WORKFLOW_DEFINITIONS to. The label is the list page's own
 * i18n key; the link is the list route the back button already uses.
 */
const breadcrumbItems = computed<SmBreadcrumbItem[]>(() => [
  { label: t('workflows.title'), routeName: 'workflows' },
]);

const isForbidden = computed(
  () =>
    logic.loadError.value instanceof ApiError &&
    logic.loadError.value.status === 403,
);

function onTabChange(tab: string | number): void {
  activeTab.value = tab as DetailTab;
}

// The palette overlay only renders on the canvas tab when the sidebar is
// reachable and the palette is shown — never in the OSS build.
const showSidebarOverlay = computed(
  () =>
    isCanvasTabActive.value &&
    mode.canAccessSidebar.value &&
    mode.showWorkflowNodePalette.value,
);

const sidebarDimmed = computed(
  () =>
    Boolean(state.state.focusedConnection) || state.state.isConnectionModalOpen,
);

onMounted(() => {
  if (!fqn.value) {
    void router.replace({ name: 'workflows' });
    return;
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

    <!-- Pin Classic renders TitleBreadcrumb above the header (renderPage)
         and above the load-error placeholder, but not while loading (bare
         Loader): one render point, hidden while loading, covers both. -->
    <SmBreadcrumb v-if="!state.state.loading" :items="breadcrumbItems" />

    <div v-if="state.state.loading" style="display: flex; justify-content: center; padding: 48px 0">
      <Spin data-testid="workflow-detail-loading" :tip="t('shared.loading')" />
    </div>
    <template v-else-if="logic.loadError.value">
      <Card v-if="isForbidden" data-testid="workflow-detail-forbidden">
        <Empty :description="t('errors.forbidden')" />
      </Card>
      <Card v-else data-testid="workflow-detail-error">
        <Empty :description="logic.loadError.value.message || t('workflows.detail.loadFailed')" />
        <div style="display: flex; justify-content: center; margin-top: 12px">
          <Button data-testid="workflow-detail-reload" @click="logic.reloadWorkflow()">
            {{ t('shared.retry') }}
          </Button>
        </div>
      </Card>
    </template>
    <template v-else>
      <WorkflowHeader :title="workflowDisplayName" :workflow-name="workflowName" />
      <div style="margin-top: 12px">
        <!-- The installed antd-vue 4.2.6 Tabs has no `items` prop (it
             parses TabPane children); the `items` form rendered an empty
             tab bar. Follow the product idiom (EntityDetailShell). -->
        <Tabs
          :active-key="activeTab"
          data-testid="workflow-execution-tabs"
          @change="onTabChange"
        >
          <Tabs.TabPane
            key="workflow"
            :tab="
              h(
                'span',
                { 'data-testid': WORKFLOW_BUILDER_TAB_TEST_IDS['workflow-builder'] },
                t('workflows.builder.workflowBuilderTab'),
              )
            "
          />
          <Tabs.TabPane
            key="execution-history"
            :tab="
              h(
                'span',
                { 'data-testid': WORKFLOW_BUILDER_TAB_TEST_IDS['execution-history'] },
                t('workflows.builder.executionHistoryTab'),
              )
            "
          />
        </Tabs>
      </div>

      <div
        style="
          position: relative;
          display: flex;
          flex: 1;
          min-height: 0;
          flex-direction: column;
          padding-top: 16px;
        "
      >
        <div
          v-if="isCanvasTabActive"
          style="
            flex: 1;
            min-height: 0;
            display: flex;
            flex-direction: column;
            overflow: hidden;
            height: calc(100vh - 320px);
            min-height: 420px;
            position: relative;
          "
        >
          <WorkflowCanvas />
          <div
            v-if="showSidebarOverlay"
            :style="{
              position: 'absolute',
              top: '34px',
              left: '20px',
              bottom: '20px',
              width: '288px',
              zIndex: 10,
              display: 'flex',
              flexDirection: 'column',
              minHeight: 0,
              borderRadius: '6px',
              background: 'var(--sm-bg-container)',
              border: '1px solid var(--sm-border-secondary)',
              boxShadow: '0 1px 2px rgb(0 0 0 / 0.06)',
              overflowY: 'auto',
              transition: 'opacity 0.3s',
              opacity: sidebarDimmed ? 0.3 : 1,
            }"
          >
            <WorkflowSidebar />
          </div>
        </div>
        <div
          v-else
          style="flex: 1; min-height: 0; display: flex; flex-direction: column; overflow: hidden"
        >
          <WorkflowExecutionHistory :workflow-fqn="fqn" />
        </div>
      </div>
    </template>

    <NodeFormSidebar
      :node="state.state.selectedNode"
      :is-open="state.state.isConfigSidebarOpen"
      :on-close="actions.handleConfigSidebarClose"
    />
    <ConnectionConditionModal />

    <Modal
      :open="builder.navigationBlock.showModal.value"
      :title="t('workflows.builder.discardYourChanges')"
      @cancel="builder.navigationBlock.onCancel"
    >
      <Typography.Paragraph style="margin: 0; color: var(--sm-text-secondary)">
        {{ t('workflows.builder.unsavedChangesWarning') }}
      </Typography.Paragraph>
      <template #footer>
        <Button @click="builder.navigationBlock.onCancel">
          {{ t('crud.cancel') }}
        </Button>
        <Button @click="builder.navigationBlock.onDiscard">
          {{ t('workflows.builder.discard') }}
        </Button>
        <Button
          type="primary"
          :loading="builder.navigationBlock.isSaveLoading.value"
          @click="builder.navigationBlock.onSave"
        >
          {{ t('crud.save') }}
        </Button>
      </template>
    </Modal>

    <Modal
      :open="builder.showDeleteModal.value"
      :title="t('workflows.builder.deleteWorkflow')"
      @cancel="builder.handleDeleteModalCancel"
    >
      <Typography.Paragraph style="margin: 0">
        {{
          t('workflows.builder.deleteWorkflowMessage', {
            entity: workflowDisplayName,
          })
        }}
      </Typography.Paragraph>
      <template #footer>
        <Button @click="builder.handleDeleteModalCancel">
          {{ t('crud.cancel') }}
        </Button>
        <Button
          type="primary"
          danger
          :loading="builder.isDeleting.value"
          @click="builder.handleDeleteWorkflowFromModal"
        >
          {{ t('crud.delete') }}
        </Button>
      </template>
    </Modal>
  </div>
</template>
