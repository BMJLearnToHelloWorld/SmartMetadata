<!--
  Copyright 2026 SmartMetadata authors.

  Licensed under the Apache License, Version 2.0 (the "License");
  you may not use this file except in compliance with the License.
  You may obtain a copy of the License at

      http://www.apache.org/licenses/LICENSE-2.0
-->
<template>
  <!-- Pin FrequentlyJoinedTables: empty joins render nothing — no
       empty-state message, the widget is filtered out of the layout. -->
  <Card v-if="joinedTables.length > 0" class="frequently-joined-tables" :title="t('usage.frequentlyJoinedTables')">
    <ul class="frequently-joined-tables__list">
      <li v-for="joined in visibleTables" :key="joined.fullyQualifiedName" data-testid="related-tables-data">
        <RouterLink :to="assetLocation('table', joined.fullyQualifiedName)">{{ joined.name }}</RouterLink>
        <span class="frequently-joined-tables__count">{{ joined.joinCount }}</span>
      </li>
    </ul>
    <Button v-if="joinedTables.length > FREQUENTLY_JOINED_LIST_SIZE" type="link" data-testid="read-button" @click="showAll = !showAll">
      {{ showAll ? t('usage.less') : t('usage.plusCountMore', { count: joinedTables.length - FREQUENTLY_JOINED_LIST_SIZE }) }}
    </Button>
  </Card>
</template>

<script setup lang="ts">
import { assetLocation } from '@/catalog/entityRoutes';
import { FREQUENTLY_JOINED_LIST_SIZE, getJoinsFromTableJoins } from '@/catalog/tableJoins';
import type { TableJoins } from '@/types/api';
import { Button, Card } from 'ant-design-vue';
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';

const props = defineProps<{
  /** The table's joins object; no separate API call — the pin reads it from the table in context. */
  joins?: TableJoins;
}>();

const { t } = useI18n();
const showAll = ref(false);

const joinedTables = computed(() => getJoinsFromTableJoins(props.joins));
const visibleTables = computed(() =>
  showAll.value ? joinedTables.value : joinedTables.value.slice(0, FREQUENTLY_JOINED_LIST_SIZE),
);
</script>

<style scoped>
.frequently-joined-tables__list {
  margin: 0;
  padding: 0;
  list-style: none;
}

.frequently-joined-tables__list li {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 4px 0;
}

.frequently-joined-tables__count {
  display: inline-block;
  padding: 0 6px;
  border-radius: var(--sm-border-radius);
  background: var(--sm-color-primary-bg);
  color: var(--sm-brand);
  font-size: 12px;
  line-height: 18px;
}
</style>
