<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { Card, Progress, Space, Typography } from 'ant-design-vue';
import { fmtNum, formatEtaShort, getEtaInfo } from '@/ingestion/agentsUtils';
import { getDeploymentSummary } from '@/ingestion/deploymentSummary';
import type { Agent } from '@/types/ingestion';

const props = defineProps<{
  agents: readonly Agent[];
  totalAgents?: number;
}>();

const { t } = useI18n();

/**
 * Port of official DeploymentSummaryCard (openmetadata-ui, pin
 * a3012259ca): derives everything from the live agents list and
 * renders nothing when no agent is active. Assets come from the
 * newest Metadata-agent run only; the overall percent is the mean
 * agent percent over the tab total; the ETA stat shows only while
 * the deployment is in flight and a running agent reports one.
 */
const summary = computed(() =>
  getDeploymentSummary(props.agents, props.totalAgents, (key, params) =>
    t(key, params ?? {}),
  ),
);

const etaText = computed(() =>
  summary.value?.maxEta === null || summary.value?.maxEta === undefined
    ? ''
    : formatEtaShort(getEtaInfo(summary.value.maxEta), (key, params) => t(key, params ?? {})),
);
</script>

<template>
  <Card v-if="summary" data-testid="deployment-summary-card" style="margin-bottom: 16px">
    <Space direction="vertical" :size="8" style="width: 100%">
      <Typography.Title :level="5" data-testid="deployment-summary-title" style="margin: 0">
        {{ t(summary.titleKey) }}
      </Typography.Title>
      <Typography.Text type="secondary">{{ summary.subtitle }}</Typography.Text>
      <Space :size="24" wrap>
        <span data-testid="summary-assets-ingested">
          <Typography.Text strong>{{ fmtNum(summary.assets) }}</Typography.Text>
          {{ t('ingestion.agents.assetsIngested') }}
        </span>
        <span data-testid="summary-errors">
          <Typography.Text :strong="summary.errors > 0" :type="summary.errors > 0 ? 'danger' : undefined">
            {{ fmtNum(summary.errors) }}
          </Typography.Text>
          {{ t('ingestion.agents.errorPluralLowercase') }}
        </span>
        <span v-if="!summary.allDone && summary.maxEta !== null" data-testid="summary-eta-remaining">
          {{ t('ingestion.agents.estRemaining') }}: {{ etaText }}
        </span>
      </Space>
      <template v-if="!summary.allDone">
        <Progress
          :percent="summary.percent"
          data-testid="deployment-progress-bar"
          :show-info="false"
          :stroke-color="'var(--sm-brand)'"
        />
        <Typography.Text type="secondary">
          {{ t('ingestion.agents.percentComplete', { percent: summary.percent }) }}
        </Typography.Text>
        <Typography.Text type="secondary">
          {{ t('ingestion.agents.leavePageContinues') }}
        </Typography.Text>
      </template>
    </Space>
  </Card>
</template>
