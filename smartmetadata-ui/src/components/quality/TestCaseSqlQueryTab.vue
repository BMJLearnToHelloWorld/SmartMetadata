<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
/**
 * Pin SqlQueryTab.component.tsx: QueryViewer, add-to-table modal, version diff.
 */
import { computed, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { Button } from 'ant-design-vue';
import type { ChangeDescription } from '@/api/entities';
import { getResourcePermission, toOperationPermissions } from '@/api/permissions';
import VersionDiffText from '@/components/ingestion/VersionDiffText.vue';
import AddTestCaseSqlQueryModal from '@/components/quality/AddTestCaseSqlQueryModal.vue';
import SmSqlQueryViewer from '@/components/quality/SmSqlQueryViewer.vue';
import { getInspectionQueryVersionDiff } from '@/quality/testCaseInspectionQuery.utils';
import type { TestCase } from '@/types/quality';

const props = defineProps<{
  testCase: TestCase | null;
  isVersionPage?: boolean;
  changeDescription?: ChangeDescription;
}>();

const { t } = useI18n();

const modalOpen = ref(false);
const canCreateQuery = ref(false);

const sqlQuery = computed(() => props.testCase?.inspectionQuery ?? '');

const versionDiff = computed(() =>
  props.isVersionPage
    ? getInspectionQueryVersionDiff(props.changeDescription, props.testCase?.inspectionQuery)
    : null,
);

onMounted(() => {
  void getResourcePermission('query')
    .then((permissions) => {
      canCreateQuery.value = toOperationPermissions(permissions).Create === true;
    })
    .catch(() => {
      canCreateQuery.value = false;
    });
});
</script>

<template>
  <div class="test-case-sql-query-tab">
    <div
      v-if="canCreateQuery && !isVersionPage"
      class="test-case-sql-query-tab__toolbar"
    >
      <Button type="primary" data-testid="add-to-table-button" @click="modalOpen = true">
        {{ t('label.add-to-table') }}
      </Button>
    </div>
    <div
      v-if="isVersionPage"
      class="test-case-sql-query-tab__version-diff version-sql-expression-container"
      data-testid="test-case-sql-query-version-diff"
    >
      <VersionDiffText v-if="versionDiff" :diff="versionDiff" />
    </div>
    <SmSqlQueryViewer
      v-else
      :sql-query="sqlQuery"
      test-id="test-case-sql-query"
    />
    <AddTestCaseSqlQueryModal
      :open="modalOpen"
      :test-case="testCase"
      :can-create="canCreateQuery"
      @cancel="modalOpen = false"
      @saved="modalOpen = false"
    />
  </div>
</template>

<style scoped>
.test-case-sql-query-tab__toolbar {
  display: flex;
  justify-content: flex-end;
  margin-bottom: 16px;
}

.test-case-sql-query-tab__version-diff {
  font-family: var(--sm-font-mono, ui-monospace, monospace);
  white-space: pre-wrap;
}
</style>