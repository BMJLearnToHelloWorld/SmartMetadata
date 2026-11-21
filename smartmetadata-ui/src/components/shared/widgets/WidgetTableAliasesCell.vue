<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import SmTable from '@/components/shared/SmTable.vue';
import { aliasDisplayName } from '@/governance/tableWidgets';

/**
 * TableAliases widget cell (D-2 batch 5a). Pin
 * `U/pages/TableDetailsPageV1/TableAliases/TableAliases.component.tsx:51`:
 * a small table of alias names (last FQN segment, full FQN as the
 * hover title); empty removes the widget (pin `filterWidgets`), so
 * this cell renders nothing without aliases. Pin has no edit action
 * and no permission evaluation for this widget (BENCHMARK D-5a-2).
 */
const props = defineProps<{
  aliases?: string[];
}>();

const { t } = useI18n();

const rows = computed(() =>
  (props.aliases ?? []).map((alias) => ({
    key: alias,
    name: aliasDisplayName(alias),
    fqn: alias,
  })),
);

const columns = computed(() => [
  { title: t('asset.fields.name'), dataIndex: 'name', key: 'name' },
]);
</script>

<template>
  <div v-if="rows.length" data-testid="widget-table-aliases">
    <SmTable
      row-key="key"
      test-id="table-aliases-table"
      :columns="columns"
      :data-source="rows"
      :pagination="false"
      size="small"
    >
      <template #bodyCell="{ column, record }">
        <span v-if="column.key === 'name'" :title="(record as { fqn: string }).fqn">
          {{ (record as { name: string }).name }}
        </span>
      </template>
    </SmTable>
  </div>
</template>
