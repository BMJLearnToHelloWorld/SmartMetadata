<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
  Official dashboard 事件指标: open / resolved / response time / resolution time.
-->
<script setup lang="ts">
import { onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { Card, Col, Row, Typography } from 'ant-design-vue';
import { loadIncidentMetrics } from '@/quality/incidentMetrics';

const props = defineProps<{ startTs: number; endTs: number }>();
const { t } = useI18n();
const router = useRouter();
const openCount = ref(0);
const resolvedCount = ref(0);
const responseTime = ref('--');
const resolutionTime = ref('--');

async function load(): Promise<void> {
  try {
    const metrics = await loadIncidentMetrics({ startTs: props.startTs, endTs: props.endTs });
    openCount.value = metrics.open;
    resolvedCount.value = metrics.resolved;
    responseTime.value = metrics.responseTime;
    resolutionTime.value = metrics.resolutionTime;
  } catch {
    openCount.value = 0;
    resolvedCount.value = 0;
    responseTime.value = '--';
    resolutionTime.value = '--';
  }
}

function openIncidents(status?: string): void {
  void router.push({
    name: 'observability-incidents',
    query: {
      testCaseResolutionStatusType: status,
      startTs: String(props.startTs),
      endTs: String(props.endTs),
    },
  });
}

onMounted(() => {
  void load();
});
watch(
  () => [props.startTs, props.endTs].join(':'),
  () => {
    void load();
  },
);
</script>

<template>
  <Card data-testid="dq-incident-metrics" :title="t('quality.landing.incidentTitle')">
    <Typography.Paragraph type="secondary">{{ t('quality.landing.incidentLead') }}</Typography.Paragraph>
    <Row :gutter="[16, 16]">
      <Col :xs="24" :md="12" :xl="6">
        <button class="dq-incident" type="button" data-testid="dq-incident-open" @click="openIncidents('New')">
          <div class="dq-incident__label">{{ t('quality.landing.openIncidents') }}</div>
          <div class="dq-incident__value">{{ openCount }}</div>
        </button>
      </Col>
      <Col :xs="24" :md="12" :xl="6">
        <button class="dq-incident" type="button" data-testid="dq-incident-resolved" @click="openIncidents('Resolved')">
          <div class="dq-incident__label">{{ t('quality.landing.resolvedIncidents') }}</div>
          <div class="dq-incident__value">{{ resolvedCount }}</div>
        </button>
      </Col>
      <Col :xs="24" :md="12" :xl="6">
        <div class="dq-incident" data-testid="dq-incident-response">
          <div class="dq-incident__label">{{ t('quality.landing.responseTime') }}</div>
          <div class="dq-incident__value">{{ responseTime }}</div>
        </div>
      </Col>
      <Col :xs="24" :md="12" :xl="6">
        <div class="dq-incident" data-testid="dq-incident-resolution">
          <div class="dq-incident__label">{{ t('quality.landing.resolutionTime') }}</div>
          <div class="dq-incident__value">{{ resolutionTime }}</div>
        </div>
      </Col>
    </Row>
  </Card>
</template>

<style scoped>
.dq-incident {
  width: 100%;
  text-align: left;
  border: 1px solid #f0f0f0;
  border-radius: 8px;
  background: #fafafa;
  padding: 16px;
  cursor: pointer;
}
.dq-incident__label {
  font-weight: 600;
  margin-bottom: 8px;
}
.dq-incident__value {
  font-size: 24px;
  font-weight: 600;
}
</style>
