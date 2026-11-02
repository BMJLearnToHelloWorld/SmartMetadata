<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed, reactive, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { Alert, Button, Form, Input, Select, Steps, message } from 'ant-design-vue';
import { SERVICE_CATEGORIES } from '@/catalog/ingestionTabs';
import ServiceConnectionFields from '@/components/ingestion/ServiceConnectionFields.vue';
import ServiceFilterFields from '@/components/ingestion/ServiceFilterFields.vue';
import { serviceFilterFieldsForKind, type ServiceFilterValues } from '@/ingestion/serviceFilterFields';
import PageHeader from '@/components/shared/PageHeader.vue';
import PageLayout from '@/components/shared/PageLayout.vue';
import {
  SERVICE_KIND_DEFAULT_TYPE,
  SERVICE_TYPES_BY_KIND,
  buildServiceConnection,
  createEmptyServiceForm,
} from '@/ingestion/connections';
import { SERVICE_CREATE_API } from '@/ingestion/serviceApis';
import type { ServiceFormValues, ServiceKind } from '@/types/ingestion';

const { t } = useI18n();
const router = useRouter();
const step = ref(0);
const creating = ref(false);
const form = reactive<ServiceFormValues>(createEmptyServiceForm());
const filterForm = reactive<ServiceFilterValues>({ includeViews: true });
const filterFields = computed(() => serviceFilterFieldsForKind(form.kind));

const supportedCategories = computed(() => SERVICE_CATEGORIES.filter((row) => row.supported));
const typeOptions = computed(() => SERVICE_TYPES_BY_KIND[form.kind]);
const steps = computed(() => [
  { title: t('ingestion.services.wizard.stepType') },
  { title: t('ingestion.services.wizard.stepConnection') },
  { title: t('ingestion.services.wizard.stepFilter') },
]);

function onKindChange(kind: ServiceKind): void {
  form.kind = kind;
  form.serviceType = SERVICE_KIND_DEFAULT_TYPE[kind];
}

function onNext(): void {
  if (step.value < 2) {
    step.value += 1;
  }
}

function onBack(): void {
  if (step.value > 0) {
    step.value -= 1;
  }
}

async function onCreate(): Promise<void> {
  creating.value = true;
  try {
    const created = await SERVICE_CREATE_API[form.kind]({
      name: form.name.trim(),
      serviceType: form.serviceType,
      displayName: form.displayName?.trim() || undefined,
      description: form.description?.trim() || undefined,
      connection: buildServiceConnection(form),
    });
    message.success(t('ingestion.services.created', { name: created.name }));
    await router.push({ name: 'ingestion-service', params: { kind: form.kind, id: created.id } });
  } catch (error) {
    message.error(error instanceof Error ? error.message : t('crud.createFailed'));
  } finally {
    creating.value = false;
  }
}
</script>

<template>
  <PageLayout>
    <PageHeader :header="t('ingestion.services.wizard.title')" :sub-header="t('ingestion.services.wizard.lead')" />
    <Steps :current="step" data-testid="add-service-steps" style="margin-bottom: 24px">
      <Steps.Step v-for="item in steps" :key="item.title" :title="item.title" />
    </Steps>

    <div v-if="step === 0" data-testid="wizard-step-type">
      <Form layout="vertical">
        <Form.Item :label="t('ingestion.services.kind')" required>
          <Select :value="form.kind" data-testid="wizard-service-kind" @update:value="(value) => onKindChange(value as ServiceKind)">
            <Select.Option v-for="row in supportedCategories" :key="row.key" :value="row.key">
              {{ t(row.labelKey) }}
            </Select.Option>
          </Select>
        </Form.Item>
        <Form.Item :label="t('crud.type')" required>
          <Select v-model:value="form.serviceType" data-testid="wizard-service-type">
            <Select.Option v-for="type in typeOptions" :key="type" :value="type">{{ type }}</Select.Option>
          </Select>
        </Form.Item>
      </Form>
    </div>

    <div v-if="step === 1" data-testid="wizard-step-connection">
      <Form layout="vertical">
        <Form.Item :label="t('crud.name')" required>
          <Input v-model:value="form.name" data-testid="wizard-service-name" />
        </Form.Item>
        <Form.Item :label="t('crud.displayName')" :extra="t('crud.displayNameHelp')">
          <Input v-model:value="form.displayName" data-testid="wizard-service-display-name" />
        </Form.Item>
        <Form.Item :label="t('crud.description')" :extra="t('crud.descriptionHelp')">
          <Input.TextArea v-model:value="form.description" :rows="3" data-testid="wizard-service-description" />
        </Form.Item>
        <ServiceConnectionFields :form="form" />
      </Form>
      <Alert
        type="info"
        show-icon
        data-testid="wizard-test-connection-residual"
        :message="t('ingestion.services.wizard.testConnectionResidual')"
        style="margin-top: 16px"
      />
    </div>

    <div v-if="step === 2" data-testid="wizard-step-filter">
      <Form layout="vertical">
        <ServiceFilterFields :kind="form.kind" :values="filterForm" />
        <p v-if="!filterFields.length" data-testid="wizard-no-filter-patterns">
          {{ t('ingestion.pipelines.noFilterPatterns') }}
        </p>
      </Form>
      <Alert
        type="info"
        show-icon
        data-testid="wizard-filter-residual"
        :message="t('ingestion.services.wizard.filterResidual')"
        style="margin-top: 16px"
      />
    </div>

    <div style="margin-top: 24px; display: flex; gap: 8px">
      <Button v-if="step > 0" data-testid="wizard-back" @click="onBack">
        {{ t('crud.previous') }}
      </Button>
      <Button
        v-if="step < 2"
        type="primary"
        data-testid="wizard-next"
        :disabled="step === 1 && !form.name.trim()"
        @click="onNext"
      >
        {{ step === 1 ? t('ingestion.services.wizard.nextFilter') : t('crud.next') }}
      </Button>
      <Button
        v-if="step === 2"
        type="primary"
        data-testid="wizard-create"
        :loading="creating"
        @click="onCreate"
      >
        {{ t('ingestion.services.wizard.createAndDeploy') }}
      </Button>
    </div>
  </PageLayout>
</template>
