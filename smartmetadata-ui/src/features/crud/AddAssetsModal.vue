<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { Checkbox, Input, Typography, message } from 'ant-design-vue';
import FormModal from '@/components/shared/FormModal.vue';
import SmTable from '@/components/shared/SmTable.vue';
import { searchAssets } from '@/api/search';
import { entityLabel } from '@/features/crud/paging';
import type { EntityRef } from '@/types/api';
import type { SearchHit } from '@/types/api';

const props = defineProps<{
  open: boolean;
  /** Entity type label for the modal title, e.g. the data product name. */
  ownerName: string;
  /** FQNs already attached, hidden from the picker. */
  existingFqns: string[];
}>();

const emit = defineEmits<{
  (event: 'confirm', assets: EntityRef[]): void;
  (event: 'cancel'): void;
}>();

const { t } = useI18n();
const query = ref('');
const searching = ref(false);
const searchError = ref('');
const hits = ref<SearchHit[]>([]);
const selected = ref<Set<string>>(new Set());

const columns = computed(() => [
  { title: '', key: 'pick', width: 40 },
  { title: t('crud.name'), key: 'name' },
  { title: t('crud.type'), key: 'type', width: 140 },
  { title: t('crud.fqn'), key: 'fqn' },
]);

async function onSearch(): Promise<void> {
  searching.value = true;
  searchError.value = '';
  try {
    const page = await searchAssets(query.value, 0, 25);
    hits.value = page.hits.filter(
      (hit) => hit.id && !props.existingFqns.includes(hit.fullyQualifiedName),
    );
  } catch (error) {
    hits.value = [];
    searchError.value = error instanceof Error ? error.message : t('crud.loadFailed');
  } finally {
    searching.value = false;
  }
}

function toggle(hit: SearchHit, checked: boolean): void {
  const next = new Set(selected.value);
  const key = hit.fullyQualifiedName;
  if (checked) {
    next.add(key);
  } else {
    next.delete(key);
  }
  selected.value = next;
}

function onConfirm(): void {
  const chosen = hits.value.filter((hit) => selected.value.has(hit.fullyQualifiedName));
  if (!chosen.length) {
    message.warning(t('governance.assets.pickAtLeastOne'));
    return;
  }
  emit(
    'confirm',
    chosen.map((hit) => ({
      id: hit.id as string,
      type: hit.entityType,
      name: hit.name,
      fullyQualifiedName: hit.fullyQualifiedName,
      displayName: hit.displayName,
    })),
  );
}

function onCancel(): void {
  query.value = '';
  hits.value = [];
  selected.value = new Set();
  emit('cancel');
}
</script>

<template>
  <FormModal
    :open="open"
    :title="t('governance.assets.addTitle', { name: ownerName })"
    :ok-text="t('crud.add')"
    :cancel-text="t('crud.cancel')"
    :ok-disabled="selected.size === 0"
    @ok="onConfirm"
    @cancel="onCancel"
  >
    <Input.Search
      v-model:value="query"
      data-testid="add-assets-search"
      :placeholder="t('governance.assets.searchPlaceholder')"
      :loading="searching"
      @search="onSearch"
    />
    <Typography.Text v-if="searchError" type="danger" data-testid="add-assets-error">
      {{ searchError }}
    </Typography.Text>
    <SmTable
      row-key="fullyQualifiedName"
      :columns="columns"
      :data-source="hits"
      :loading="searching"
      :pagination="false"
      size="small"
    >
      <template #bodyCell="{ column, record }">
        <template v-if="column.key === 'pick'">
          <Checkbox
            :checked="selected.has((record as SearchHit).fullyQualifiedName)"
            :disabled="!(record as SearchHit).id"
            @change="(e: { target: { checked: boolean } }) => toggle(record as SearchHit, e.target.checked)"
          />
        </template>
        <template v-else-if="column.key === 'name'">
          {{ entityLabel(record as SearchHit) }}
        </template>
        <template v-else-if="column.key === 'type'">
          {{ (record as SearchHit).entityType }}
        </template>
        <template v-else-if="column.key === 'fqn'">
          {{ (record as SearchHit).fullyQualifiedName }}
        </template>
      </template>
    </SmTable>
    <Typography.Paragraph v-if="!hits.length && !searching" type="secondary">
      {{ t('governance.assets.searchHint') }}
    </Typography.Paragraph>
  </FormModal>
</template>
