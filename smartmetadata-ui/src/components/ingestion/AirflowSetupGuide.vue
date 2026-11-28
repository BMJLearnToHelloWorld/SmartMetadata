<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
  Port of official AirflowSetupGuide (openmetadata-ui).
-->
<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { Card, Spin } from 'ant-design-vue';
import AirflowMessageBanner from '@/components/ingestion/AirflowMessageBanner.vue';
import type { OrchestratorStatus } from '@/types/ingestion';

/** Pin AIRFLOW_DOCS (DocumentationLinksClassBase.ts). */
const AIRFLOW_DOCS =
  'https://docs.open-metadata.org/latest/deployment/ingestion/external/airflow';

/** Pin PIPELINE_SERVICE_PLATFORM (ServiceType.constant.ts). */
const PIPELINE_SERVICE_PLATFORM = 'Airflow';

const props = defineProps<{
  status: OrchestratorStatus | null;
  checked: boolean;
  isFetchingStatus?: boolean;
}>();

const { t } = useI18n();

const brandName = computed(() => t('product.name'));

const isAirflowPlatform = computed(
  () => props.status?.platform === PIPELINE_SERVICE_PLATFORM,
);
</script>

<template>
  <div class="airflow-setup-guide" data-testid="error-placeholder-ingestion">
    <Spin v-if="isFetchingStatus" data-testid="airflow-setup-guide-loader" />
    <div v-else class="airflow-setup-guide__steps" data-testid="error-steps">
      <Card class="airflow-setup-guide__card">
        <AirflowMessageBanner
          :status="status"
          :checked="checked"
          :disabled-message="t('settings.services.pipeline.disabledFallback')"
          :unreachable-message="t('settings.services.pipeline.unreachableFallback')"
        />
        <template v-if="isAirflowPlatform">
          <h6 class="airflow-setup-guide__title">
            {{ t('message.manage-airflow-api-failed', { brandName }) }}
          </h6>
          <p class="airflow-setup-guide__body">
            {{ t('message.airflow-guide-message', { brandName }) }}
          </p>
          <p>
            <a :href="AIRFLOW_DOCS" rel="noopener noreferrer" target="_blank">
              {{ t('label.install-airflow-api') }} >>
            </a>
          </p>
        </template>
        <p v-else class="airflow-setup-guide__scheduler">
          {{ t('message.pipeline-scheduler-message', { brandName }) }}
        </p>
      </Card>
    </div>
  </div>
</template>

<style scoped>
.airflow-setup-guide {
  font-size: 14px;
  font-weight: 500;
}
.airflow-setup-guide__steps {
  margin-bottom: 20px;
}
.airflow-setup-guide__card {
  padding: 8px;
}
.airflow-setup-guide__title {
  font-size: 16px;
  font-weight: 500;
  margin: 0 0 8px;
}
.airflow-setup-guide__body {
  margin: 0 0 16px;
  color: var(--sm-text-secondary);
  font-size: 14px;
}
.airflow-setup-guide__scheduler {
  margin: 0;
  text-align: center;
}
</style>