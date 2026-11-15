<!--
  Copyright 2026 SmartMetadata authors.

  Licensed under the Apache License, Version 2.0 (the "License");
  you may not use this file except in compliance with the License.
  You may obtain a copy of the License at

      http://www.apache.org/licenses/LICENSE-2.0
-->
<template>
  <!-- Pin schema-table column affordance: renders only when this column
       has joins; the label comes from the caller in the pin, so it is
       rendered here as part of the affordance block. -->
  <div v-if="joinedWith.length > 0" class="frequently-joined-columns" data-testid="frequently-joined-columns">
    <span class="frequently-joined-columns__label">{{ t('usage.frequentlyJoinedColumns') }}:</span>
    <span v-for="(joined, index) in visibleJoins" :key="joined.fullyQualifiedName" class="frequently-joined-columns__link">
      <RouterLink :to="assetLocation('table', parentTableFqn(joined.fullyQualifiedName))">
        {{ getPartialNameFromTableFQN(joined.fullyQualifiedName, ['database', 'table', 'schema', 'column'], '.') }}
      </RouterLink>
      <span v-if="index < visibleJoins.length - 1">, </span>
    </span>
    <Popover v-if="joinedWith.length > FREQUENTLY_JOINED_COLUMN_VIEW_CAP">
      <template #content>
        <ul class="frequently-joined-columns__popover">
          <li v-for="joined in remainingJoins" :key="joined.fullyQualifiedName">
            <!-- Pin popover links use the default `/` separator (no
                 explicit separator argument), unlike the inline links
                 above, which pass the FQN separator `.`. -->
            <RouterLink :to="assetLocation('table', parentTableFqn(joined.fullyQualifiedName))">
              {{ getPartialNameFromTableFQN(joined.fullyQualifiedName, ['database', 'table', 'column']) }}
            </RouterLink>
          </li>
        </ul>
      </template>
      <Button type="link" size="small">...</Button>
    </Popover>
  </div>
</template>

<script setup lang="ts">
import { assetLocation } from '@/catalog/entityRoutes';
import {
  checkIfJoinsAvailable,
  getFrequentlyJoinedWithColumns,
  getPartialNameFromTableFQN,
  getTableFQNFromColumnFQN,
} from '@/catalog/tableJoins';
import type { TableJoins } from '@/types/api';
import { Button, Popover } from 'ant-design-vue';
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';

/** Pin EntityColumnUtils: the first 3 joined columns render inline, the rest go behind the popover. */
const FREQUENTLY_JOINED_COLUMN_VIEW_CAP = 3;

const props = defineProps<{
  joins?: TableJoins;
  columnName: string;
}>();

const { t } = useI18n();

const joinedWith = computed(() =>
  checkIfJoinsAvailable(props.columnName, props.joins?.columnJoins)
    ? getFrequentlyJoinedWithColumns(props.columnName, props.joins?.columnJoins)
    : [],
);
const visibleJoins = computed(() => joinedWith.value.slice(0, FREQUENTLY_JOINED_COLUMN_VIEW_CAP));
const remainingJoins = computed(() => joinedWith.value.slice(FREQUENTLY_JOINED_COLUMN_VIEW_CAP));

// The fork has no column-anchored detail route, so column links resolve
// to the parent table (the pin passes the column FQN to its detail page).
function parentTableFqn(columnFqn: string): string {
  return getTableFQNFromColumnFQN(columnFqn);
}
</script>

<style scoped>
.frequently-joined-columns {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px;
  margin-top: 4px;
  font-size: 12px;
}

.frequently-joined-columns__label {
  color: var(--sm-color-text-secondary);
}

.frequently-joined-columns__popover {
  margin: 0;
  padding: 0;
  list-style: none;
}
</style>
