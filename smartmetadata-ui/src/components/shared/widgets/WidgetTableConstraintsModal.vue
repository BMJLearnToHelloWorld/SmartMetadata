<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { Button, Input, Modal, Select, Typography, message } from 'ant-design-vue';
import { DeleteOutlined, PlusOutlined } from '@ant-design/icons-vue';
import type { TableConstraint } from '@/types/api';
import {
  EMPTY_FOREIGN_CONSTRAINT,
  KEY_FIELD_BY_CONSTRAINT_TYPE,
  TABLE_CONSTRAINT_TYPES,
  TABLE_RELATIONSHIP_TYPES,
  buildTableConstraints,
  toConstraintFormValues,
  type ConstraintKeyField,
  type ForeignConstraintFormValues,
  type TableConstraintType,
} from '@/governance/tableWidgets';

/**
 * TableConstraints edit modal (D-2 batch 5a). Pin
 * `U/pages/TableDetailsPageV1/TableConstraints/TableConstraintsModal/TableConstraintsModal.component.tsx`:
 * a constraint-type dropdown (Primary / Foreign / Unique / Dist /
 * Cluster / Sort), a multi-select of table columns for the active key
 * type, and foreign-key rows (column + relationship type + related
 * column) with add/remove; saving assembles the constraint objects
 * (empty key lists save as nothing, incomplete foreign rows are
 * dropped). The modal has no field-level permission gates in pin —
 * only the entry button is gated, by the caller.
 */
const props = defineProps<{
  open: boolean;
  constraints: TableConstraint[];
  columnNames: string[];
  onSave: (values: TableConstraint[]) => Promise<unknown>;
  onClose: () => void;
}>();

const { t } = useI18n();

const constraintType = ref<TableConstraintType>('PRIMARY_KEY');
const keyValues = ref<Record<ConstraintKeyField, string[]>>({
  primaryConstraints: [],
  uniqueConstraints: [],
  sortConstraints: [],
  distConstraints: [],
  clusterConstraints: [],
});
const foreignRows = ref<ForeignConstraintFormValues[]>([{ ...EMPTY_FOREIGN_CONSTRAINT }]);
const saving = ref(false);

function reset(): void {
  const form = toConstraintFormValues(props.constraints);
  constraintType.value = form.constraintType ?? 'PRIMARY_KEY';
  keyValues.value = {
    primaryConstraints: [...(form.primaryConstraints ?? [])],
    uniqueConstraints: [...(form.uniqueConstraints ?? [])],
    sortConstraints: [...(form.sortConstraints ?? [])],
    distConstraints: [...(form.distConstraints ?? [])],
    clusterConstraints: [...(form.clusterConstraints ?? [])],
  };
  foreignRows.value = form.foreignConstraints.map((row) => ({ ...row }));
}

watch(
  () => props.open,
  (open) => {
    if (open) {
      reset();
    }
  },
  { immediate: true },
);

const typeLabelKey: Record<TableConstraintType, string> = {
  PRIMARY_KEY: 'asset.constraintPrimaryKey',
  FOREIGN_KEY: 'asset.constraintForeignKey',
  UNIQUE: 'asset.constraintUnique',
  DIST_KEY: 'asset.constraintDistKey',
  CLUSTER_KEY: 'asset.constraintClusterKey',
  SORT_KEY: 'asset.constraintSortKey',
};

const keyFieldLabelKey: Record<ConstraintKeyField, string> = {
  primaryConstraints: 'asset.constraintPrimaryKeys',
  uniqueConstraints: 'asset.constraintUniqueKeys',
  sortConstraints: 'asset.constraintSortKeys',
  distConstraints: 'asset.constraintDistKeys',
  clusterConstraints: 'asset.constraintClusterKeys',
};

const keyFieldTestId: Record<ConstraintKeyField, string> = {
  primaryConstraints: 'primary-constraint-type-select',
  uniqueConstraints: 'unique-constraint-type-select',
  sortConstraints: 'sort-constraint-type-select',
  distConstraints: 'dist-constraint-type-select',
  clusterConstraints: 'cluster-constraint-type-select',
};

const relationshipLabelKey: Record<string, string> = {
  ONE_TO_ONE: 'asset.relationshipOneToOne',
  ONE_TO_MANY: 'asset.relationshipOneToMany',
  MANY_TO_ONE: 'asset.relationshipManyToOne',
  MANY_TO_MANY: 'asset.relationshipManyToMany',
};

const activeKeyField = computed<ConstraintKeyField | undefined>(() =>
  constraintType.value === 'FOREIGN_KEY'
    ? undefined
    : KEY_FIELD_BY_CONSTRAINT_TYPE[constraintType.value],
);

function addForeignRow(): void {
  foreignRows.value = [...foreignRows.value, { ...EMPTY_FOREIGN_CONSTRAINT }];
}

function removeForeignRow(index: number): void {
  foreignRows.value = foreignRows.value.filter((_, i) => i !== index);
}

async function save(): Promise<void> {
  saving.value = true;
  try {
    await props.onSave(
      buildTableConstraints({
        constraintType: constraintType.value,
        primaryConstraints: keyValues.value.primaryConstraints,
        uniqueConstraints: keyValues.value.uniqueConstraints,
        sortConstraints: keyValues.value.sortConstraints,
        distConstraints: keyValues.value.distConstraints,
        clusterConstraints: keyValues.value.clusterConstraints,
        foreignConstraints: foreignRows.value,
      }),
    );
    props.onClose();
  } catch (error) {
    message.error(error instanceof Error ? error.message : t('crud.updateFailed'));
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <Modal
    :open="open"
    :closable="false"
    :mask-closable="false"
    :keyboard="false"
    :title="constraints.length ? t('asset.tableConstraintsUpdate') : t('asset.tableConstraintsAdd')"
    data-testid="table-constraint-modal"
    @cancel="onClose"
  >
    <div class="widget-constraints-modal__field">
      <Typography.Text>{{ t('asset.constraintType') }}</Typography.Text>
      <Select
        v-model:value="constraintType"
        data-testid="constraint-type-select"
        style="width: 100%"
      >
        <Select.Option v-for="type in TABLE_CONSTRAINT_TYPES" :key="type" :value="type">
          {{ t(typeLabelKey[type]) }}
        </Select.Option>
      </Select>
    </div>

    <div v-if="activeKeyField" class="widget-constraints-modal__field">
      <Typography.Text>{{ t(keyFieldLabelKey[activeKeyField]) }}</Typography.Text>
      <Select
        v-model:value="keyValues[activeKeyField]"
        mode="multiple"
        allow-clear
        :data-testid="keyFieldTestId[activeKeyField]"
        style="width: 100%"
      >
        <Select.Option v-for="column in columnNames" :key="column" :value="column">
          {{ column }}
        </Select.Option>
      </Select>
    </div>

    <template v-if="constraintType === 'FOREIGN_KEY'">
      <div
        v-for="(row, index) in foreignRows"
        :key="index"
        class="widget-constraints-modal__fk-row"
      >
        <div class="widget-constraints-modal__field">
          <Typography.Text>{{ t('asset.constraintColumns') }}</Typography.Text>
          <Select
            v-model:value="row.columns"
            :data-testid="`${index}-column-type-select`"
            style="width: 100%"
          >
            <Select.Option v-for="column in columnNames" :key="column" :value="column">
              {{ column }}
            </Select.Option>
          </Select>
        </div>
        <div class="widget-constraints-modal__field">
          <Typography.Text>{{ t('asset.constraintRelationshipType') }}</Typography.Text>
          <Select
            v-model:value="row.relationshipType"
            :data-testid="`${index}-relationship-type-select`"
            style="width: 100%"
          >
            <Select.Option
              v-for="type in TABLE_RELATIONSHIP_TYPES"
              :key="type"
              :value="type"
            >
              {{ t(relationshipLabelKey[type]) }}
            </Select.Option>
          </Select>
        </div>
        <div class="widget-constraints-modal__field">
          <Typography.Text>{{ t('asset.constraintReferredColumn') }}</Typography.Text>
          <Input
            v-model:value="row.referredColumns"
            :data-testid="`${index}-related-column-select`"
            :placeholder="t('asset.constraintReferredColumnPlaceholder')"
          />
        </div>
        <Button
          type="text"
          danger
          :data-testid="`${index}-delete-constraint-button`"
          @click="removeForeignRow(index)"
        >
          <DeleteOutlined />
        </Button>
      </div>
      <Button type="link" data-testid="add-constraint-button" @click="addForeignRow">
        <PlusOutlined /> {{ t('asset.constraintAddRow') }}
      </Button>
    </template>

    <template #footer>
      <Button data-testid="cancel-btn" @click="onClose">{{ t('crud.cancel') }}</Button>
      <Button type="primary" data-testid="save-btn" :loading="saving" @click="save">
        {{ t('crud.save') }}
      </Button>
    </template>
  </Modal>
</template>

<style scoped>
.widget-constraints-modal__field {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-bottom: 12px;
}
.widget-constraints-modal__fk-row {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-bottom: 12px;
  padding: 12px;
  border: 1px solid var(--sm-color-border);
  border-radius: 6px;
}
</style>
