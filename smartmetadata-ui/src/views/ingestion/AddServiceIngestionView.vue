<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0 (the "License");
  you may not use this file except in compliance with the License.
  You may obtain a copy of the License at

      http://www.apache.org/licenses/LICENSE-2.0
-->
<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { Button, Form, Input, Select, Steps, message } from 'ant-design-vue';
import PageHeader from '@/components/shared/PageHeader.vue';
import PageLayout from '@/components/shared/PageLayout.vue';
import ServiceFilterFields from '@/components/ingestion/ServiceFilterFields.vue';
import { createIngestionPipeline, deployIngestionPipeline } from '@/api/ingestionPipelines';
import { SERVICE_GET_API } from '@/ingestion/serviceApis';
import { entityTypeForKind } from '@/ingestion/connections';
import { agentKindsForService } from '@/types/ingestion';
import { buildSourceConfig } from '@/ingestion/sourceConfig';
import type { ServiceFilterValues } from '@/ingestion/serviceFilterFields';
import type { CatalogService, PipelineType, ServiceKind } from '@/types/ingestion';
import { PIPELINE_TYPES } from '@/types/ingestion';

/**
 * Service-scoped add-ingestion page (official AddIngestionPage, route
 * ADD_INGESTION `/service/:serviceCategory/:fqn/add-ingestion/:ingestionType`).
 * Official steps (constants/Ingestions.constant.ts STEPS_FOR_ADD_INGESTION):
 * 1 configure, 2 schedule interval. The page loads the service by kind+id
 * (getServiceByFQN equivalent), creates the pipeline with that service
 * reference (addIngestionPipeline), then deploys it
 * (deployIngestionPipelineById). A deploy that returns the
 * "Pipeline Client Disabled" client response is surfaced verbatim, never
 * reported as a deploy — the product backend is still in-memory queued
 * (B4), so deploy success here means the API accepted the deploy call.
 */
const props = defineProps<{ kind: string; id: string; ingestionType?: string }>();

const { t } = useI18n();
const router = useRouter();
const step = ref(0);
const creating = ref(false);
const loading = ref(false);
const errorMessage = ref('');
const service = ref<CatalogService | null>(null);
const form = reactive({
  name: '',
  displayName: '',
  description: '',
  pipelineType: 'metadata' as string,
  scheduleInterval: '',
});
const filterForm = reactive<ServiceFilterValues>({ includeViews: true });

const kind = computed<ServiceKind>(() =>
  (['database', 'messaging', 'dashboard', 'storage', 'pipeline', 'api', 'mlmodel', 'metadata', 'drive', 'search', 'llm', 'mcp', 'security'] as const).includes(
    props.kind as ServiceKind,
  )
    ? (props.kind as ServiceKind)
    : 'database',
);
const typeOptions = computed<readonly PipelineType[]>(() =>
  service.value ? agentKindsForService(service.value.serviceType) : (['metadata'] as const),
);
const steps = computed(() => [
  { title: t('ingestion.pipelines.addStepConfigure') },
  { title: t('ingestion.pipelines.addStepSchedule') },
]);

async function load(): Promise<void> {
  loading.value = true;
  errorMessage.value = '';
  try {
    service.value = await SERVICE_GET_API[kind.value](props.id);
    const routeType = props.ingestionType;
    const initial = routeType && (PIPELINE_TYPES as readonly string[]).includes(routeType)
      ? routeType
      : 'metadata';
    form.pipelineType = typeOptions.value.includes(initial as PipelineType)
      ? initial
      : (typeOptions.value[0] ?? 'metadata');
    form.name = `${service.value.name}-${form.pipelineType}`;
  } catch (error) {
    service.value = null;
    errorMessage.value = error instanceof Error ? error.message : t('crud.loadFailed');
  } finally {
    loading.value = false;
  }
}

async function onCreate(): Promise<void> {
  if (!service.value || !form.name.trim()) {
    return;
  }
  creating.value = true;
  try {
    const created = await createIngestionPipeline({
      name: form.name.trim(),
      pipelineType: form.pipelineType,
      service: { id: service.value.id, type: entityTypeForKind(kind.value) },
      sourceConfig: buildSourceConfig({
        ...filterForm,
        name: form.name.trim(),
        pipelineType: form.pipelineType,
        serviceId: service.value.id,
        serviceKind: kind.value,
        includeViews: filterForm.includeViews ?? true,
      }),
      airflowConfig: {
        pausePipeline: true,
        scheduleInterval: form.scheduleInterval.trim() || undefined,
      },
      displayName: form.displayName.trim() || undefined,
      description: form.description.trim() || undefined,
    });
    message.success(t('ingestion.pipelines.created', { name: created.name }));
    try {
      const deploy = await deployIngestionPipeline(created.id);
      if (deploy.reason) {
        message.warning(deploy.reason);
      }
    } catch {
      // Deploy failure does not roll back the created pipeline; the
      // pipeline can be deployed from its detail page.
      message.warning(t('ingestion.pipelines.deployFailed'));
    }
    await router.push({ name: 'ingestion-pipeline', params: { id: created.id } });
  } catch (error) {
    message.error(error instanceof Error ? error.message : t('crud.createFailed'));
  } finally {
    creating.value = false;
  }
}

onMounted(() => {
  void load();
});
</script>

<template>
  <PageLayout>
    <PageHeader :header="t('ingestion.pipelines.addTitle')" :sub-header="t('ingestion.pipelines.addLead')" />
    <p v-if="errorMessage" data-testid="add-ingestion-error">{{ errorMessage }}</p>
    <div v-if="service" data-testid="add-ingestion-form">
      <Steps :current="step" data-testid="add-ingestion-steps" style="margin-bottom: 24px">
        <Steps.Step v-for="item in steps" :key="item.title" :title="item.title" />
      </Steps>
      <div v-if="step === 0" data-testid="add-ingestion-step-configure">
        <Form layout="vertical">
          <Form.Item :label="t('ingestion.services.title')" required>
            <Input :value="service.displayName || service.name" disabled data-testid="add-ingestion-service" />
          </Form.Item>
          <Form.Item :label="t('crud.name')" required>
            <Input v-model:value="form.name" data-testid="add-ingestion-name" />
          </Form.Item>
          <Form.Item :label="t('crud.type')" required>
            <Select v-model:value="form.pipelineType" data-testid="add-ingestion-type">
              <Select.Option v-for="type in typeOptions" :key="type" :value="type">{{ type }}</Select.Option>
            </Select>
          </Form.Item>
          <Form.Item :label="t('crud.displayName')">
            <Input v-model:value="form.displayName" data-testid="add-ingestion-display-name" />
          </Form.Item>
          <Form.Item :label="t('crud.description')">
            <Input.TextArea v-model:value="form.description" :rows="3" data-testid="add-ingestion-description" />
          </Form.Item>
          <ServiceFilterFields :kind="kind" :values="filterForm" />
        </Form>
      </div>
      <div v-if="step === 1" data-testid="add-ingestion-step-schedule">
        <Form layout="vertical">
          <Form.Item :label="t('ingestion.pipelines.scheduleInterval')" :extra="t('ingestion.pipelines.scheduleIntervalHelp')">
            <Input
              v-model:value="form.scheduleInterval"
              placeholder="0 0 * * *"
              data-testid="add-ingestion-schedule"
            />
          </Form.Item>
        </Form>
      </div>
      <div style="margin-top: 24px; display: flex; gap: 8px">
        <Button v-if="step > 0" data-testid="add-ingestion-back" @click="step -= 1">{{ t('crud.previous') }}</Button>
        <Button
          v-if="step < 1"
          type="primary"
          data-testid="add-ingestion-next"
          :disabled="!form.name.trim()"
          @click="step += 1"
        >
          {{ t('crud.next') }}
        </Button>
        <Button
          v-if="step === 1"
          type="primary"
          data-testid="add-ingestion-create"
          :loading="creating"
          @click="onCreate"
        >
          {{ t('ingestion.pipelines.createAndDeploy') }}
        </Button>
      </div>
    </div>
  </PageLayout>
</template>
