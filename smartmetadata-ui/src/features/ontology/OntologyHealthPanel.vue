<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0 (the "License");
  you may not use this file except in compliance with the License.
  You may obtain a copy of the License at

      http://www.apache.org/licenses/LICENSE-2.0
-->
<script setup lang="ts">
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { Button, Card, Progress, Space, Typography } from 'ant-design-vue';
import type { OntologyGraphNode } from './ontologyGraph';
import type { OntologyHealthSummary } from '@/types/ontologyDataGraph';

/**
 * Ontology health panel (official components/OntologyExplorer/OntologyHealthPanel.tsx).
 * Three views — minimized / summary / open, default 'summary'. Placement
 * 'floating' is an absolute bottom-right card over the graph; 'sidebar'
 * is a full-height relative card with no minimize/collapse buttons.
 * The isolated count display uses the `isolatedTermCount` prop when given
 * (the summary endpoint's count), else the derived list length. AI
 * proposals are AI-mode only and omitted here.
 */
const props = defineProps<{
  health: OntologyHealthSummary;
  isolatedTermCount?: number;
  placement?: 'floating' | 'sidebar';
}>();

const emit = defineEmits<{
  (event: 'connect', term: OntologyGraphNode): void;
}>();

const { t } = useI18n();
type HealthView = 'minimized' | 'summary' | 'open';
const view = ref<HealthView>('summary');

const isolatedCount = computed(() => props.isolatedTermCount ?? props.health.isolatedTerms.length);
const hasIsolated = computed(() => isolatedCount.value > 0);
const isHealthy = computed(() => !hasIsolated.value);
</script>

<template>
  <Card
    data-testid="ontology-health-panel"
    :class="placement === 'floating' ? 'ontology-health-floating' : 'ontology-health-sidebar'"
    style="margin-bottom: 16px"
  >
    <template v-if="view === 'minimized'">
      <Space direction="vertical" style="width: 100%">
        <Space style="justify-content: space-between; width: 100%">
          <Typography.Text strong>{{ t('ontology.browser.healthTitle') }}</Typography.Text>
          <Button
            v-if="placement === 'floating'"
            size="small"
            type="text"
            data-testid="ontology-health-expand"
            @click="view = 'summary'"
          >
            {{ t('ontology.browser.healthExpand') }}
          </Button>
        </Space>
        <Progress :percent="health.connectedPercent" :show-info="false" />
        <Typography.Text type="secondary">
          {{ health.connectedPercent }}% · {{ t('ontology.browser.healthIsolated', { count: isolatedCount }) }}
        </Typography.Text>
      </Space>
    </template>
    <template v-else>
      <Space direction="vertical" style="width: 100%">
        <Space style="justify-content: space-between; width: 100%">
          <Typography.Text strong>{{ t('ontology.browser.healthTitle') }}</Typography.Text>
          <Typography.Text :type="isHealthy ? 'success' : 'warning'">
            {{ isHealthy ? t('ontology.browser.healthHealthy') : t('ontology.browser.healthAttention') }}
          </Typography.Text>
          <Button
            v-if="placement === 'floating'"
            size="small"
            type="text"
            data-testid="ontology-health-minimize"
            @click="view = 'minimized'"
          >
            {{ t('ontology.browser.healthMinimize') }}
          </Button>
        </Space>
        <Typography.Title :level="2" style="margin: 0">{{ health.connectedPercent }}%</Typography.Title>
        <Typography.Text type="secondary">
          {{
            t('ontology.browser.healthConnected', {
              connected: health.connectedTermCount,
              total: health.totalTermCount,
            })
          }}
        </Typography.Text>
        <Progress :percent="health.connectedPercent" :show-info="false" />
        <template v-if="view === 'summary'">
          <Space v-if="hasIsolated" style="justify-content: space-between; width: 100%">
            <Typography.Text>
              {{ t('ontology.browser.healthIsolated', { count: isolatedCount }) }}
            </Typography.Text>
            <Button size="small" data-testid="ontology-health-review" @click="view = 'open'">
              {{ t('ontology.browser.healthReview') }}
            </Button>
          </Space>
          <Typography.Text v-else type="secondary">
            {{ t('ontology.browser.healthAllConnected') }}
          </Typography.Text>
        </template>
        <template v-else>
          <Button
            v-if="placement === 'floating'"
            size="small"
            type="text"
            data-testid="ontology-health-collapse"
            @click="view = 'summary'"
          >
            {{ t('ontology.browser.healthCollapse') }}
          </Button>
          <template v-if="health.isolatedTerms.length > 0">
            <div
              v-for="term in health.isolatedTerms"
              :key="term.id"
              data-testid="ontology-health-isolated-term"
              style="display: flex; justify-content: space-between; align-items: center; gap: 8px"
            >
              <Space direction="vertical" :size="0">
                <Typography.Text>{{ term.label }}</Typography.Text>
                <Typography.Text type="secondary">
                  {{ t('ontology.browser.healthNoRelations') }}
                </Typography.Text>
              </Space>
              <Button size="small" data-testid="ontology-health-connect" @click="emit('connect', term)">
                {{ t('ontology.browser.healthConnect') }}
              </Button>
            </div>
          </template>
          <Typography.Text v-else type="secondary">
            {{ t('ontology.browser.healthAllConnected') }}
          </Typography.Text>
        </template>
      </Space>
    </template>
  </Card>
</template>

<style scoped>
.ontology-health-floating {
  position: absolute;
  right: 16px;
  bottom: 16px;
  width: 300px;
  z-index: 10;
}
.ontology-health-sidebar {
  position: relative;
  width: 100%;
}
</style>
