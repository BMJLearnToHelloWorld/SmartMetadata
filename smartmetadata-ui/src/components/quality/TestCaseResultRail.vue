<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
  Official TestCaseResultTab TestCaseSidePanel (data-testid="test-case-rail").
-->
<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import EntityDescriptionCell from '@/components/shared/EntityDescriptionCell.vue';
import WidgetDataProductsCell from '@/components/shared/widgets/WidgetDataProductsCell.vue';
import WidgetTagsCell from '@/components/shared/widgets/WidgetTagsCell.vue';
import TestCaseConfigurationCard from '@/components/quality/TestCaseConfigurationCard.vue';
import TestCaseTestSuitesCard from '@/components/quality/TestCaseTestSuitesCard.vue';
import type { AssetTagOption } from '@/types/governance';
import type { TestCase, TestDefinition } from '@/types/quality';
import type { TagLabelInput } from '@/governance/assetPatch';
import {
  buildConfigurationParameterRows,
  shouldShowComputeRowCount,
  shouldShowEditParameterButton,
  splitParameterValues,
  withComputeRowCountRow,
} from '@/quality/testCaseResultTab.utils';

const props = defineProps<{
  testCase: TestCase;
  testDefinition?: TestDefinition;
  tagOptions: AssetTagOption[];
  hasEditPermission: boolean;
  hasEditDescriptionPermission: boolean;
  hasEditTagsPermission: boolean;
  hasEditGlossaryTermsPermission: boolean;
  onDescriptionUpdate?: (description: string) => Promise<void>;
  onTagsChange: (tags: TagLabelInput[]) => Promise<void>;
  onDataProductsSave: (products: import('@/types/api').EntityRef[]) => Promise<void>;
  /** Official DataProductsContainer requireDomainForDataProduct. */
  requireDomainForDataProduct?: boolean;
}>();

const emit = defineEmits<{
  editParameter: [];
}>();

const { t } = useI18n();

const parameterRows = computed(() =>
  withComputeRowCountRow(
    buildConfigurationParameterRows(props.testCase, props.testDefinition),
    props.testCase,
    props.testDefinition,
    t,
  ),
);

const sqlSplit = computed(() => splitParameterValues(props.testCase.parameterValues ?? []));

const showEditParameter = computed(() =>
  shouldShowEditParameterButton(
    props.hasEditPermission,
    props.testCase,
    Boolean(props.testCase.dataQualityDimension),
    shouldShowComputeRowCount(props.testCase, props.testDefinition),
  ),
);

const entityName = computed(
  () => props.testCase.displayName?.trim() || props.testCase.name || props.testCase.fullyQualifiedName || '',
);
</script>

<template>
  <aside class="test-case-result-rail" data-testid="test-case-rail">
    <TestCaseConfigurationCard
      :test-case="testCase"
      :test-definition="testDefinition"
      :parameter-rows="parameterRows"
      :with-sql-params="sqlSplit.withSqlParams"
      :show-edit-button="showEditParameter"
      @edit-parameter="emit('editParameter')"
    />
    <div class="test-case-result-rail__widget" data-testid="widget-description">
      <EntityDescriptionCell
        :description="testCase.description"
        :entity-name="entityName"
        :has-edit-access="hasEditDescriptionPermission"
        :expanded="true"
        :on-description-update="onDescriptionUpdate"
      />
    </div>
    <TestCaseTestSuitesCard :test-suites="testCase.testSuites ?? []" />
    <div class="test-case-result-rail__widget">
      <WidgetTagsCell
        tag-type="Classification"
        test-id="widget-tags-classification"
        :tags="testCase.tags ?? []"
        :options="tagOptions"
        :has-edit-access="hasEditTagsPermission"
        :on-tags-change="onTagsChange"
      />
    </div>
    <div class="test-case-result-rail__widget">
      <WidgetTagsCell
        tag-type="Glossary"
        test-id="widget-tags-glossary"
        :tags="testCase.tags ?? []"
        :options="tagOptions"
        :has-edit-access="hasEditGlossaryTermsPermission"
        :on-tags-change="onTagsChange"
      />
    </div>
    <div class="test-case-result-rail__widget">
      <WidgetDataProductsCell
        test-id="widget-data-products-cell"
        :data-products="testCase.dataProducts ?? []"
        :domains="testCase.domains ?? []"
        :has-edit-access="hasEditPermission"
        :require-domain="requireDomainForDataProduct ?? true"
        :on-save="onDataProductsSave"
      />
    </div>
  </aside>
</template>

<style scoped>
.test-case-result-rail {
  display: flex;
  flex-direction: column;
  gap: 16px;
  min-width: 0;
}

.test-case-result-rail__widget {
  min-width: 0;
}
</style>