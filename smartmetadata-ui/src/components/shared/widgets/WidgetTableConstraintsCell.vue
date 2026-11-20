<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { Button, Typography } from 'ant-design-vue';
import { EditOutlined, PlusOutlined } from '@ant-design/icons-vue';
import type { TableConstraint } from '@/types/api';
import { referredTableFqn } from '@/governance/tableWidgets';
import WidgetTableConstraintsModal from './WidgetTableConstraintsModal.vue';

/**
 * TableConstraints widget cell (D-2 batch 5a). Pin
 * `U/pages/TableDetailsPageV1/TableConstraints/TableConstraints.tsx:35`:
 * key constraints render as type label + column names; a foreign key
 * renders its columns plus referred columns as links to the parent
 * table; +/edit opens the constraints modal. The caller owns the gate
 * (`has-edit-access`, P1 `isAdminUser || canEditAll`) and the save.
 */
const props = defineProps<{
  constraints?: TableConstraint[];
  columnNames: string[];
  hasEditAccess: boolean;
  onSave: (values: TableConstraint[]) => Promise<unknown>;
  onReferredTableClick: (fqn: string) => void;
}>();

const { t } = useI18n();
const modalOpen = ref(false);

const typeLabelKey: Record<string, string> = {
  PRIMARY_KEY: 'asset.constraintPrimaryKey',
  FOREIGN_KEY: 'asset.constraintForeignKey',
  UNIQUE: 'asset.constraintUnique',
  DIST_KEY: 'asset.constraintDistKey',
  CLUSTER_KEY: 'asset.constraintClusterKey',
  SORT_KEY: 'asset.constraintSortKey',
};

const constraints = computed(() => props.constraints ?? []);

function typeLabel(constraint: TableConstraint): string {
  return t(typeLabelKey[constraint.constraintType] ?? 'asset.tableConstraints');
}
</script>

<template>
  <div data-testid="widget-table-constraints">
    <div class="widget-table-constraints__view">
      <div v-if="constraints.length" class="widget-table-constraints__groups">
        <div
          v-for="(constraint, index) in constraints"
          :key="`${constraint.constraintType}-${index}`"
          :data-testid="`${constraint.constraintType}-container`"
          class="widget-table-constraints__group"
        >
          <Typography.Text strong>{{ typeLabel(constraint) }}</Typography.Text>
          <Typography.Text data-testid="constraint-column-name">
            {{ (constraint.columns ?? []).join(', ') }}
          </Typography.Text>
          <div
            v-if="constraint.constraintType === 'FOREIGN_KEY' && constraint.referredColumns?.length"
            data-testid="referred-column-name-fqn"
          >
            <template v-for="referred in constraint.referredColumns" :key="referred">
              <a
                v-if="referredTableFqn(referred)"
                href="#"
                @click.prevent="onReferredTableClick(referredTableFqn(referred) as string)"
              >
                {{ referred }}
              </a>
              <span v-else>{{ referred }}</span>
            </template>
          </div>
        </div>
      </div>
      <Button
        v-if="hasEditAccess"
        type="text"
        size="small"
        :data-testid="constraints.length ? 'edit-table-constraint-button' : 'table-constraints-add-button'"
        @click="modalOpen = true"
      >
        <PlusOutlined v-if="!constraints.length" />
        <EditOutlined v-else />
      </Button>
    </div>
    <WidgetTableConstraintsModal
      :open="modalOpen"
      :constraints="constraints"
      :column-names="columnNames"
      :on-save="onSave"
      :on-close="() => { modalOpen = false; }"
    />
  </div>
</template>

<style scoped>
.widget-table-constraints__view {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
}
.widget-table-constraints__groups {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.widget-table-constraints__group {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
</style>
