<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { Button, Descriptions } from 'ant-design-vue';
import { fetchAssetDetail } from '@/api/entities';
import type { AssetDetail } from '@/types/api';
import { entityLabel, joinRefNames } from '@/features/crud/paging';
import PageHeader from '@/components/shared/PageHeader.vue';
import SmBreadcrumb from '@/components/shared/SmBreadcrumb.vue';
import SmState from '@/components/shared/SmState.vue';

/**
 * Stage 4 metric detail page, following the official MetricDetailsPage
 * shape (FQN lookup, definition fields, version entry) without inventing
 * what the product API does not serve: there is no /v1/metrics endpoint,
 * so the page reads the metric entity through the Stage 2 entity detail
 * endpoint (metrics collection, metricExpression/metricType/
 * unitOfMeasurement/granularity fields). Delete and single-version detail
 * are residuals, not buttons that call nothing.
 */
const props = defineProps<{ fqn: string }>();
const { t } = useI18n();
const router = useRouter();
const loading = ref(true);
const errorMessage = ref('');
const metric = ref<AssetDetail | null>(null);

async function load(): Promise<void> {
  loading.value = true;
  errorMessage.value = '';
  try {
    metric.value = await fetchAssetDetail('metric', decodeURIComponent(props.fqn));
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : t('metrics.loadFailed');
    metric.value = null;
  } finally {
    loading.value = false;
  }
}

function openVersions(): void {
  if (!metric.value?.id) {
    return;
  }
  void router.push({
    name: 'asset-version',
    params: { entityType: 'metric', fqn: metric.value.fullyQualifiedName },
  });
}

onMounted(() => {
  void load();
});
</script>

<template>
  <SmBreadcrumb
    :items="[
      { label: t('metrics.title'), routeName: 'governance-metrics' },
      { label: entityLabel(metric) || props.fqn },
    ]"
  />
  <PageHeader
    :header="entityLabel(metric) || props.fqn"
    :sub-header="t('metrics.detailLead')"
    test-id="metric-header"
  />
  <SmState
    v-if="loading || errorMessage || !metric"
    :state="loading ? 'loading' : errorMessage ? 'error' : 'empty'"
    :error-text="errorMessage || undefined"
    :empty-text="t('metrics.empty')"
    show-retry
    @retry="load"
  />
  <template v-else-if="metric">
      <Descriptions bordered size="small" data-testid="metric-details">
        <Descriptions.Item :label="t('crud.description')" :span="3">
          {{ metric.description || '—' }}
        </Descriptions.Item>
        <Descriptions.Item :label="t('metrics.type')">
          {{ metric.metricType || '—' }}
        </Descriptions.Item>
        <Descriptions.Item :label="t('metrics.unit')">
          {{ metric.unitOfMeasurement || '—' }}
        </Descriptions.Item>
        <Descriptions.Item :label="t('metrics.granularity')">
          {{ metric.granularity || '—' }}
        </Descriptions.Item>
        <Descriptions.Item :label="t('metrics.expression')" :span="3">
          {{
            [metric.storedProcedureCode?.language, metric.storedProcedureCode?.code]
              .filter(Boolean)
              .join('\n\n') || t('metrics.noExpression')
          }}
        </Descriptions.Item>
        <Descriptions.Item :label="t('crud.owners')" :span="3">
          {{ joinRefNames(metric.owners) || '—' }}
        </Descriptions.Item>
        <Descriptions.Item :label="t('governance.domains.title')" :span="3">
          {{ joinRefNames(metric.domains) || '—' }}
        </Descriptions.Item>
      </Descriptions>
      <Button
        type="default"
        data-testid="metric-versions"
        :disabled="!metric.id"
        style="margin-top: 16px"
        @click="openVersions"
      >
        {{ t('metrics.versions') }}
      </Button>
  </template>
</template>
