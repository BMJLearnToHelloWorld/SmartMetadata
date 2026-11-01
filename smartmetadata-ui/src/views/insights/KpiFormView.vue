<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute, useRouter } from 'vue-router';
import { Alert, Button, Form, FormItem, Input, InputNumber, Select, Spin } from 'ant-design-vue';
import PageHeader from '@/components/shared/PageHeader.vue';
import PageLayout from '@/components/shared/PageLayout.vue';
import { createKpi, getKpiByName, updateKpi } from '@/api/kpi';
import { KPI_DATA_INSIGHT_CHARTS, type CreateKpiRequest, type KpiMetricType } from '@/types/kpi';

const { t } = useI18n();
const route = useRoute();
const router = useRouter();

const editingFqn = computed(() => (route.name === 'insights-kpis-edit' ? String(route.params.fqn ?? '') : ''));
const isEdit = computed(() => Boolean(editingFqn.value));
const loading = ref(false);
const saving = ref(false);
const errorMessage = ref('');

const name = ref('');
const description = ref('');
const displayName = ref('');
const dataInsightChart = ref<string>(KPI_DATA_INSIGHT_CHARTS[0]);
const metricType = ref<KpiMetricType>('NUMBER');
const targetValue = ref<number | undefined>(undefined);
const startDate = ref('');
const endDate = ref('');

const metricTypeOptions = computed(() => [
  { value: 'NUMBER', label: t('insights.kpis.metricTypes.number') },
  { value: 'PERCENTAGE', label: t('insights.kpis.metricTypes.percentage') },
]);

const chartOptions = computed(() =>
  KPI_DATA_INSIGHT_CHARTS.map((chart) => ({ value: chart, label: chart })),
);

/** Official form rule: percentage targets are capped at 100. */
const targetMax = computed(() => (metricType.value === 'PERCENTAGE' ? 100 : undefined));

const formValid = computed(
  () =>
    Boolean(name.value.trim()) &&
    Boolean(description.value.trim()) &&
    Boolean(dataInsightChart.value) &&
    targetValue.value !== undefined &&
    Boolean(startDate.value) &&
    Boolean(endDate.value) &&
    Date.parse(startDate.value) <= Date.parse(endDate.value),
);

async function loadForEdit(): Promise<void> {
  if (!isEdit.value) {
    return;
  }
  loading.value = true;
  try {
    const kpi = await getKpiByName(editingFqn.value);
    name.value = kpi.name;
    description.value = kpi.description ?? '';
    displayName.value = kpi.displayName ?? '';
    dataInsightChart.value = kpi.dataInsightChart?.name ?? KPI_DATA_INSIGHT_CHARTS[0];
    metricType.value = kpi.metricType ?? 'NUMBER';
    targetValue.value = kpi.targetValue;
    startDate.value = kpi.startDate ? new Date(kpi.startDate).toISOString().slice(0, 10) : '';
    endDate.value = kpi.endDate ? new Date(kpi.endDate).toISOString().slice(0, 10) : '';
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : t('insights.kpisFailed');
  } finally {
    loading.value = false;
  }
}

async function onSubmit(): Promise<void> {
  if (!formValid.value || !startDate.value || !endDate.value) {
    return;
  }
  saving.value = true;
  errorMessage.value = '';
  const body: CreateKpiRequest = {
    name: name.value.trim(),
    description: description.value.trim(),
    dataInsightChart: dataInsightChart.value,
    startDate: Date.parse(startDate.value),
    endDate: Date.parse(endDate.value),
    targetValue: targetValue.value as number,
    metricType: metricType.value,
    displayName: displayName.value.trim() || undefined,
  };
  try {
    if (isEdit.value) {
      await updateKpi(body);
    } else {
      await createKpi(body);
    }
    void router.push({ name: 'insights-kpis' });
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : t('insights.kpisFailed');
  } finally {
    saving.value = false;
  }
}

function onCancel(): void {
  void router.push({ name: 'insights-kpis' });
}

onMounted(() => {
  void loadForEdit();
});
</script>

<template>
  <PageLayout test-id="kpi-form-layout">
    <PageHeader
      :header="isEdit ? t('insights.kpis.editTitle') : t('insights.kpis.addTitle')"
      :sub-header="t('insights.kpisLead')"
    />
    <Spin :spinning="loading || saving">
      <Alert v-if="errorMessage" type="error" show-icon :message="errorMessage" class="kpi-form__alert" />
      <Form layout="vertical" @submit.prevent="onSubmit">
        <FormItem :label="t('crud.name')" required>
          <Input v-model:value="name" id="kpi-form-name" data-testid="kpi-form-name" :disabled="isEdit" />
        </FormItem>
        <FormItem :label="t('crud.description')" required>
          <Input v-model:value="description" id="kpi-form-description" data-testid="kpi-form-description" />
        </FormItem>
        <FormItem :label="t('crud.displayName')">
          <Input v-model:value="displayName" id="kpi-form-display-name" data-testid="kpi-form-display-name" />
        </FormItem>
        <FormItem :label="t('insights.kpis.chart')" required>
          <Select v-model:value="dataInsightChart" data-testid="kpi-form-chart" :options="chartOptions" />
        </FormItem>
        <FormItem :label="t('insights.kpis.metricType')" required>
          <Select v-model:value="metricType" data-testid="kpi-form-metric-type" :options="metricTypeOptions" />
        </FormItem>
        <FormItem :label="t('insights.kpis.target')" required>
          <InputNumber
            v-model:value="targetValue"
            id="kpi-form-target"
            data-testid="kpi-form-target"
            style="width: 100%"
            :min="0"
            :max="targetMax"
          />
        </FormItem>
        <FormItem :label="t('insights.kpis.start')" required>
          <Input v-model:value="startDate" type="date" id="kpi-form-start" data-testid="kpi-form-start" style="width: 100%" />
        </FormItem>
        <FormItem :label="t('insights.kpis.end')" required>
          <Input v-model:value="endDate" type="date" id="kpi-form-end" data-testid="kpi-form-end" style="width: 100%" />
        </FormItem>
        <Alert
          v-if="startDate && endDate && Date.parse(startDate) > Date.parse(endDate)"
          type="warning"
          show-icon
          :message="t('insights.kpis.dateRangeInvalid')"
          class="kpi-form__alert"
        />
        <Button type="primary" html-type="submit" data-testid="kpi-form-submit" :disabled="!formValid">
          {{ t('crud.save') }}
        </Button>
        <Button data-testid="kpi-form-cancel" class="kpi-form__cancel" @click="onCancel">{{ t('crud.cancel') }}</Button>
      </Form>
    </Spin>
  </PageLayout>
</template>

<style scoped>
.kpi-form__alert {
  margin-block: 12px;
}
.kpi-form__cancel {
  margin-left: 8px;
}
</style>
