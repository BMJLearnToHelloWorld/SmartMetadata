<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
  Official ContractQualityFormTab: paged test-case selection, off-page
  storedRefsById, test type filter, optional TestCaseFormDrawer.
-->
<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { Button, Select, Table } from 'ant-design-vue';
import type { DataContract, EntityRefLike } from '@/api/dataContracts';
import { listTestCasesBySearch } from '@/api/testCases';
import { CONTRACT_TEST_TYPE_LABEL_MAP } from '@/catalog/dataContractTabs';
import { mergeQualityExpectations } from '@/catalog/dataContractForm';
import { toEntityLink } from '@/quality/entityLink';
import type { TestCase } from '@/types/quality';
import ContractFormStep from '@/components/contract/ContractFormStep.vue';
import TestCaseFormDrawer from '@/components/quality/TestCaseFormDrawer.vue';

const props = defineProps<{
  entityType: string;
  entityFqn?: string;
  selectedQuality?: string[];
  initialValues?: Partial<DataContract>;
  nextLabel?: string;
  prevLabel?: string;
  isNextVisible?: boolean;
}>();

const emit = defineEmits<{
  change: [data: Partial<DataContract>];
  next: [];
  prev: [];
}>();

const { t } = useI18n();
const testType = ref('all');
const searchValue = ref('');
const allTestCases = ref<TestCase[]>([]);
const loading = ref(false);
const selectedKeys = ref<string[]>([...(props.selectedQuality ?? [])]);
const pageSize = 15;
const currentPage = ref(1);
const total = ref(0);
const drawerOpen = ref(false);

const storedRefsById = computed(() => {
  return new Map((props.initialValues?.qualityExpectations ?? []).map((item) => [item.id ?? '', item]));
});

async function fetchAllTests(offset = 0, q?: string): Promise<void> {
  if (!props.entityFqn) {
    return;
  }
  loading.value = true;
  try {
    const page = await listTestCasesBySearch({
      sortType: 'desc',
      sortField: 'testCaseResult.timestamp',
      testCaseType: testType.value,
      fields: 'testCaseResult',
      entityLink: toEntityLink(props.entityType || 'table', props.entityFqn),
      includeAllTests: true,
      limit: pageSize,
      offset,
      include: 'non-deleted',
      q: q ?? searchValue.value ?? undefined,
    });
    allTestCases.value = page.data;
    total.value = page.total ?? page.data.length;
  } finally {
    loading.value = false;
  }
}

function handleSelection(keys: (string | number)[]): void {
  const ids = keys.map(String);
  selectedKeys.value = ids;
  emit('change', {
    qualityExpectations: mergeQualityExpectations(
      ids,
      allTestCases.value.map((item) => ({ id: item.id, name: item.name, description: item.description })),
      storedRefsById.value,
    ) as EntityRefLike[],
  });
}

watch(testType, () => {
  currentPage.value = 1;
  void fetchAllTests(0);
});

function onPageChange(page: number): void {
  currentPage.value = page;
  void fetchAllTests((page - 1) * pageSize);
}

onMounted(() => {
  void fetchAllTests(0);
});
</script>

<template>
  <ContractFormStep
    :title="t('label.quality')"
    :description="t('message.quality-contract-description')"
    :next-label="nextLabel"
    :prev-label="prevLabel"
    :is-next-visible="isNextVisible"
    show-prev
    @next="emit('next')"
    @prev="emit('prev')"
  >
    <template #extra>
      <Button data-testid="add-test-button" @click="drawerOpen = true">
        {{ t('label.add-entity', { entity: t('label.test') }) }}
      </Button>
    </template>
    <div style="display: flex; gap: 8px; margin-bottom: 12px">
      <Select
        v-model:value="testType"
        data-testid="quality-filter-button"
        style="width: 180px"
        :options="Object.entries(CONTRACT_TEST_TYPE_LABEL_MAP).map(([value, labelKey]) => ({ value, label: t(labelKey) }))"
      />
    </div>
    <Table
      row-key="id"
      :data-source="allTestCases"
      :loading="loading"
      :pagination="{ current: currentPage, pageSize, total, onChange: onPageChange }"
      :row-selection="{ selectedRowKeys: selectedKeys, preserveSelectedRowKeys: true, onChange: handleSelection, columnWidth: 48 }"
      :columns="[
        { title: t('label.name'), dataIndex: 'name', key: 'name' },
        { title: t('label.status'), dataIndex: ['testCaseResult', 'testCaseStatus'], key: 'status' },
      ]"
    />
    <TestCaseFormDrawer
      :open="drawerOpen"
      :initial-table-fqn="entityFqn"
      @cancel="drawerOpen = false"
      @submitted="() => { drawerOpen = false; void fetchAllTests((currentPage - 1) * pageSize); }"
    />
  </ContractFormStep>
</template>
