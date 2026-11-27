<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
  Official /test-case/:fqn/dimensions/:dimensionKey page. Reuses DimensionalityPanel.
-->
<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute, useRouter } from 'vue-router';
import { Button, Typography } from 'ant-design-vue';
import PageHeader from '@/components/shared/PageHeader.vue';
import PageLayout from '@/components/shared/PageLayout.vue';
import DimensionalityPanel from '@/features/quality/DimensionalityPanel.vue';
import { getTestCaseByName } from '@/api/testCases';
import type { TestCase } from '@/types/quality';

const { t } = useI18n();
const route = useRoute();
const router = useRouter();
const testCase = ref<TestCase | undefined>();
const errorMessage = ref('');

const fqn = computed(() => String(route.params.fqn ?? ''));
const dimensionKey = computed(() => String(route.params.dimensionKey ?? ''));
const dimensionColumns = computed(() => {
  const fromCase = testCase.value?.dimensionColumns ?? [];
  if (dimensionKey.value && !fromCase.includes(dimensionKey.value)) {
    return [dimensionKey.value, ...fromCase];
  }
  return fromCase.length ? fromCase : dimensionKey.value ? [dimensionKey.value] : [];
});

async function load(): Promise<void> {
  errorMessage.value = '';
  try {
    testCase.value = await getTestCaseByName(fqn.value);
  } catch (error) {
    testCase.value = undefined;
    errorMessage.value = error instanceof Error ? error.message : t('crud.loadFailed');
  }
}

onMounted(() => {
  void load();
});
watch(fqn, () => {
  void load();
});
</script>

<template>
  <PageLayout test-id="test-case-dimensions">
    <PageHeader :header="testCase?.displayName || testCase?.name || fqn" :sub-header="t('quality.testCases.dimensionsLead')" />
    <Typography.Paragraph v-if="errorMessage" type="danger">{{ errorMessage }}</Typography.Paragraph>
    <Button
      v-if="testCase"
      type="link"
      data-testid="test-case-dimensions-back"
      @click="router.push({ name: 'quality-test-case', params: { id: testCase.id } })"
    >
      {{ t('quality.testCases.backToDetail') }}
    </Button>
    <DimensionalityPanel
      v-if="fqn && dimensionColumns.length"
      :test-case-fqn="testCase?.fullyQualifiedName || fqn"
      :dimension-columns="dimensionColumns"
    />
  </PageLayout>
</template>
