<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
  Official AddToBundleSuiteModal (addTestCasesToLogicalTestSuiteBulk + navigate to suite).
-->
<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { Modal, Select, message } from 'ant-design-vue';
import { addTestCasesToLogicalTestSuiteBulk } from '@/api/testCases';
import { listTestSuitesBySearch } from '@/api/testSuites';
import { entityLabel } from '@/features/crud/paging';
import { getErrorText } from '@/views/admin/accessApiErrors';
import type { TestCase, TestSuite } from '@/types/quality';

const props = defineProps<{
  open: boolean;
  selectedTestCases: TestCase[];
}>();
const emit = defineEmits<{
  cancel: [];
  added: [];
}>();

const { t } = useI18n();
const router = useRouter();
const selectedSuiteId = ref<string | undefined>();
const suiteOptions = ref<{ label: string; value: string; suite: TestSuite }[]>([]);
const optionsLoading = ref(false);
const searchInput = ref('');
const submitting = ref(false);
let searchTimer: ReturnType<typeof setTimeout> | undefined;

const selectedIds = computed(() =>
  props.selectedTestCases.map((item) => item.id).filter((id): id is string => Boolean(id)),
);

async function fetchLogicalSuites(query: string): Promise<void> {
  optionsLoading.value = true;
  try {
    const page = await listTestSuitesBySearch({
      q: query || undefined,
      limit: 25,
      testSuiteType: 'logical',
      includeEmptyTestSuites: true,
    });
    suiteOptions.value = page.data.map((suite) => ({
      label: entityLabel(suite),
      value: suite.id ?? '',
      suite,
    }));
  } catch (error) {
    message.error(getErrorText(error, t('server.entity-fetch-error', { entity: t('label.bundle-suite') })));
    suiteOptions.value = [];
  } finally {
    optionsLoading.value = false;
  }
}

function scheduleSearch(value: string): void {
  searchInput.value = value;
  selectedSuiteId.value = undefined;
  if (searchTimer) {
    clearTimeout(searchTimer);
  }
  searchTimer = setTimeout(() => {
    void fetchLogicalSuites(value);
  }, 400);
}

async function onOk(): Promise<void> {
  if (!selectedIds.value.length) {
    emit('cancel');
    return;
  }
  if (!selectedSuiteId.value) {
    return;
  }
  submitting.value = true;
  try {
    await addTestCasesToLogicalTestSuiteBulk(selectedSuiteId.value, {
      selectAll: false,
      includeIds: selectedIds.value,
      excludeIds: [],
    });
    message.success(t('message.test-cases-added-to-bundle-suite'));
    const chosen = suiteOptions.value.find((item) => item.value === selectedSuiteId.value);
    const suiteId = chosen?.suite.id;
    if (suiteId) {
      await router.push({ name: 'quality-test-suite', params: { id: suiteId } });
    }
    emit('added');
    emit('cancel');
  } catch (error) {
    message.error(getErrorText(error, t('server.update-entity-error', { entity: t('label.bundle-suite') })));
  } finally {
    submitting.value = false;
  }
}

watch(
  () => props.open,
  (open) => {
    if (open) {
      selectedSuiteId.value = undefined;
      searchInput.value = '';
      void fetchLogicalSuites('');
    }
  },
);
</script>

<template>
  <Modal
    :open="open"
    :title="t('label.add-test-cases-to-bundle-suite')"
    :ok-text="t('label.add')"
    :cancel-text="t('label.cancel')"
    :confirm-loading="submitting"
    :ok-button-props="{ disabled: !selectedSuiteId || !selectedIds.length }"
    data-testid="add-to-bundle-suite-modal"
    @ok="onOk"
    @cancel="emit('cancel')"
  >
    <Select
      show-search
      allow-clear
      :filter-option="false"
      :value="selectedSuiteId"
      :placeholder="t('label.select-field', { field: t('label.bundle-suite') })"
      :loading="optionsLoading"
      :options="suiteOptions"
      data-testid="bundle-suite-select"
      style="width: 100%"
      @search="scheduleSearch"
      @change="(value: string) => { selectedSuiteId = value; searchInput = suiteOptions.find((o) => o.value === value)?.label ?? searchInput; }"
    />
  </Modal>
</template>