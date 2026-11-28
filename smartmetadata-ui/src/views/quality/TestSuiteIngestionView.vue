<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
  Official TestSuiteIngestionPage at /test-suites/:fqn/add-ingestion
  and /test-suites/:fqn/edit-ingestion/:ingestionFqn. Vue3 + ant-design-vue.
-->
<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { getIngestionPipelineByFqn } from '@/api/ingestionPipelines';
import { getTestSuiteByName } from '@/api/testSuites';
import TestSuitePipelineFormDrawer from '@/components/quality/TestSuitePipelineFormDrawer.vue';
import SmState from '@/components/shared/SmState.vue';
import type { IngestionPipeline } from '@/types/ingestion';
import type { TestSuite } from '@/types/quality';
import { getDataQualityPagePath } from '@/utils/fqnPaths';
import { getErrorText } from '@/views/admin/accessApiErrors';

const props = defineProps<{
  fqn: string;
  ingestionFqn?: string;
}>();

const { t } = useI18n();
const router = useRouter();
const loading = ref(false);
const errorMessage = ref('');
const suite = ref<TestSuite | null>(null);
const pipeline = ref<IngestionPipeline | null>(null);

function suiteDetailPath(): string {
  return `/test-suites/${encodeURIComponent(props.fqn)}`;
}

async function load(): Promise<void> {
  loading.value = true;
  errorMessage.value = '';
  suite.value = null;
  pipeline.value = null;
  try {
    suite.value = await getTestSuiteByName(props.fqn);
    if (props.ingestionFqn) {
      pipeline.value = await getIngestionPipelineByFqn(props.ingestionFqn);
    }
  } catch (error) {
    errorMessage.value = getErrorText(
      error,
      t('server.entity-fetch-error', {
        entity: props.ingestionFqn ? t('label.ingestion-workflow-lowercase') : t('label.test-suite'),
      }),
    );
  } finally {
    loading.value = false;
  }
}

function goBack(): void {
  void router.push(suiteDetailPath());
}

onMounted(() => {
  void load();
});
</script>

<template>
  <SmState v-if="loading" state="loading" />
  <SmState v-else-if="errorMessage" state="error" :error-text="errorMessage" />
  <SmState v-else-if="!suite" state="empty" test-id="no-data-placeholder" :empty-text="t('label.no-data')" />
  <div v-else data-testid="test-suite-ingestion-page">
    <nav data-testid="test-suite-ingestion-breadcrumb" style="margin-bottom: 16px">
      <RouterLink :to="getDataQualityPagePath()">{{ t('label.test-suite-plural') }}</RouterLink>
      <span> / </span>
      <RouterLink :to="suiteDetailPath()">{{ suite.displayName || suite.name }}</RouterLink>
      <span> / </span>
      <span>{{ ingestionFqn ? t('label.edit') : t('label.add') }} {{ t('label.ingestion') }}</span>
    </nav>
    <TestSuitePipelineFormDrawer
      variant="page"
      :open="true"
      :suite="suite"
      :ingestion-pipeline="pipeline"
      @close="goBack"
      @success="goBack"
    />
  </div>
</template>
