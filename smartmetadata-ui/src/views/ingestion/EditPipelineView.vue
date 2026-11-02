<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { Button, Form, Input, Spin, Steps, message } from 'ant-design-vue';
import { getIngestionPipeline, updateIngestionPipeline } from '@/api/ingestionPipelines';
import ServiceFilterFields from '@/components/ingestion/ServiceFilterFields.vue';
import PageHeader from '@/components/shared/PageHeader.vue';
import PageLayout from '@/components/shared/PageLayout.vue';
import SmState from '@/components/shared/SmState.vue';
import { SERVICE_KIND_BY_ENTITY_TYPE, entityTypeForKind } from '@/ingestion/connections';
import { buildSourceConfig, formHintsFromSourceConfig } from '@/ingestion/sourceConfig';
import type { IngestionPipeline, PipelineFormValues, ServiceKind } from '@/types/ingestion';

const props = defineProps<{ id: string }>();
const { t } = useI18n();
const router = useRouter();
const loading = ref(false);
const errorMessage = ref('');
const saving = ref(false);
const step = ref(0);
const pipeline = ref<IngestionPipeline | null>(null);
const form = reactive<PipelineFormValues>({
  name: '',
  pipelineType: 'metadata',
  serviceId: '',
  serviceKind: 'database',
  includeViews: true,
  includeSchemas: '',
  includeTopics: '',
  includeDashboards: '',
  includeCharts: '',
  includeContainers: '',
  scheduleInterval: '',
});

const steps = computed(() => [
  { title: t('ingestion.pipelines.editStepConfigure') },
  { title: t('ingestion.pipelines.editStepSchedule') },
]);

function serviceKindFromRef(type: string | undefined): ServiceKind {
  return (type && SERVICE_KIND_BY_ENTITY_TYPE[type]) || 'database';
}

function backToDetail(): void {
  void router.push({ name: 'ingestion-pipeline', params: { id: props.id } });
}

async function load(): Promise<void> {
  loading.value = true;
  errorMessage.value = '';
  try {
    const current = await getIngestionPipeline(props.id);
    pipeline.value = current;
    const kind = serviceKindFromRef(current.service?.type);
    const hints = formHintsFromSourceConfig(current.sourceConfig, kind);
    form.name = current.name;
    form.displayName = current.displayName || '';
    form.description = current.description || '';
    form.pipelineType = current.pipelineType || 'metadata';
    form.serviceId = current.service?.id || '';
    form.serviceKind = kind;
    form.includeViews = hints.includeViews;
    form.includeSchemas = hints.includeSchemas || '';
    form.includeTopics = hints.includeTopics || '';
    form.includeDashboards = hints.includeDashboards || '';
    form.includeCharts = hints.includeCharts || '';
    form.includeContainers = hints.includeContainers || '';
    form.scheduleInterval = current.airflowConfig?.scheduleInterval || '';
  } catch (error) {
    pipeline.value = null;
    errorMessage.value = error instanceof Error ? error.message : t('crud.loadFailed');
  } finally {
    loading.value = false;
  }
}

async function onSave(): Promise<void> {
  if (!pipeline.value?.service?.id) {
    return;
  }
  saving.value = true;
  try {
    await updateIngestionPipeline({
      name: pipeline.value.name,
      pipelineType: pipeline.value.pipelineType || 'metadata',
      service: {
        id: pipeline.value.service.id,
        type: entityTypeForKind(serviceKindFromRef(pipeline.value.service.type)),
      },
      sourceConfig: buildSourceConfig(form),
      airflowConfig: {
        pausePipeline: true,
        scheduleInterval: form.scheduleInterval?.trim() || undefined,
      },
      displayName: form.displayName?.trim() || undefined,
      description: form.description?.trim() || undefined,
    });
    message.success(t('ingestion.pipelines.updated'));
    backToDetail();
  } catch (error) {
    message.error(error instanceof Error ? error.message : t('crud.updateFailed'));
  } finally {
    saving.value = false;
  }
}

onMounted(() => {
  void load();
});
</script>

<template>
  <PageLayout>
    <PageHeader :header="t('ingestion.pipelines.editTitle')" />
    <Spin :spinning="loading">
      <SmState
        v-if="errorMessage"
        state="error"
        test-id="edit-pipeline-error"
        :error-text="errorMessage"
      />
      <template v-else-if="pipeline">
        <Steps :current="step" data-testid="edit-pipeline-steps" style="margin-bottom: 24px">
          <Steps.Step v-for="item in steps" :key="item.title" :title="item.title" />
        </Steps>
        <div v-if="step === 0" data-testid="edit-pipeline-step-configure">
          <Form layout="vertical">
            <Form.Item :label="t('crud.displayName')" :extra="t('crud.displayNameHelp')">
              <Input v-model:value="form.displayName" data-testid="edit-pipeline-display-name" />
            </Form.Item>
            <Form.Item :label="t('crud.description')" :extra="t('crud.descriptionHelp')">
              <Input.TextArea v-model:value="form.description" :rows="3" data-testid="edit-pipeline-description" />
            </Form.Item>
            <ServiceFilterFields :kind="form.serviceKind" :values="form" />
          </Form>
        </div>
        <div v-if="step === 1" data-testid="edit-pipeline-step-schedule">
          <Form layout="vertical">
            <Form.Item :label="t('ingestion.pipelines.schedule')" :extra="t('ingestion.pipelines.scheduleHelp')">
              <Input v-model:value="form.scheduleInterval" data-testid="edit-pipeline-schedule" />
            </Form.Item>
          </Form>
        </div>
        <div style="margin-top: 24px; display: flex; gap: 8px">
          <Button data-testid="edit-pipeline-back" @click="step === 0 ? backToDetail() : (step = 0)">
            {{ t('crud.previous') }}
          </Button>
          <Button
            v-if="step === 0"
            type="primary"
            data-testid="edit-pipeline-next"
            @click="step = 1"
          >
            {{ t('crud.next') }}
          </Button>
          <Button
            v-else
            type="primary"
            data-testid="edit-pipeline-submit"
            :loading="saving"
            @click="onSave"
          >
            {{ t('crud.submit') }}
          </Button>
        </div>
      </template>
    </Spin>
  </PageLayout>
</template>
