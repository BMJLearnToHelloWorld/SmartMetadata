<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { fetchAssetDetail, listEntityVersions, type ChangeField, type EntityVersion } from '@/api/entities';
import PageHeader from '@/components/shared/PageHeader.vue';
import PageLayout from '@/components/shared/PageLayout.vue';
import SmState from '@/components/shared/SmState.vue';
import SmTable from '@/components/shared/SmTable.vue';

const props = defineProps<{
  entityType: string;
  fqn: string;
}>();

const router = useRouter();
const { t } = useI18n();

const loading = ref(true);
const errorMessage = ref('');
const versions = ref<EntityVersion[]>([]);
const title = ref(props.fqn);
const selectedVersion = ref<EntityVersion | null>(null);

interface DiffRow {
  key: string;
  field: string;
  change: string;
  oldValue: string;
  newValue: string;
}

function renderValue(value: unknown): string {
  if (value === undefined || value === null) {
    return '—';
  }
  return typeof value === 'string' ? value : JSON.stringify(value);
}

// The diff is a straight presentation of the backend changeDescription:
// fieldsAdded / fieldsDeleted / fieldsUpdated, values verbatim. When the
// backend returns no changeDescription, the diff area stays honestly empty
// instead of comparing snapshots the backend never supplied.
const diffRows = computed<DiffRow[]>(() => {
  const change = selectedVersion.value?.changeDescription;
  if (!change) {
    return [];
  }
  const rows: DiffRow[] = [];
  const collect = (items: ChangeField[] | undefined, changeKind: string) => {
    (items ?? []).forEach((item, index) => {
      rows.push({
        key: `${changeKind}-${item.field ?? index}`,
        field: item.field ?? '—',
        change: changeKind,
        oldValue: renderValue(item.oldValue),
        newValue: renderValue(item.newValue),
      });
    });
  };
  collect(change.fieldsAdded, 'added');
  collect(change.fieldsDeleted, 'deleted');
  collect(change.fieldsUpdated, 'updated');
  return rows;
});

async function load(): Promise<void> {
  loading.value = true;
  errorMessage.value = '';
  try {
    const asset = await fetchAssetDetail(props.entityType, props.fqn);
    title.value = asset.displayName || asset.name || props.fqn;
    if (!asset.id) {
      versions.value = [];
      return;
    }
    versions.value = await listEntityVersions(props.entityType, asset.id);
  } catch (error) {
    versions.value = [];
    errorMessage.value = error instanceof Error ? error.message : t('asset.versionsFailed');
  } finally {
    loading.value = false;
  }
}

onMounted(() => {
  void load();
});
</script>

<template>
  <PageLayout>
    <PageHeader :header="t('asset.versionsTitle')" :sub-header="t('asset.versionsLead')" />
    <SmState
      v-if="loading || errorMessage || !versions.length"
      :state="loading ? 'loading' : errorMessage ? 'error' : 'empty'"
      :error-text="errorMessage || undefined"
      :empty-text="t('asset.versionsEmpty')"
      test-id="asset-versions-state"
    />
    <SmTable
      v-else
      test-id="asset-versions-table"
      row-key="key"
      :custom-row="
        (record) => ({
          onClick: () => {
            selectedVersion =
              versions.find(
                (version) => String(version.version) === (record as { versionValue?: string }).versionValue,
              ) ?? null;
          },
        })
      "
      :columns="[
        { title: t('asset.versionsTitle'), key: 'version', dataIndex: 'version' },
        { title: t('asset.columns.timestamp'), key: 'updatedAt', dataIndex: 'updatedAt' },
      ]"
      :data-source="
        versions.map((version, index) => ({
          key: String(version.version ?? index),
          version: version.version ?? '—',
          versionValue: String(version.version ?? ''),
          updatedAt: version.updatedAt ? new Date(version.updatedAt).toISOString() : '—',
        }))
      "
    />
    <div v-if="selectedVersion">
      <h3 data-testid="asset-version-diff-title">
        {{ t('asset.versionDiffTitle') }} — {{ selectedVersion.version ?? '—' }}
      </h3>
      <SmState
        v-if="!diffRows.length"
        state="empty"
        :empty-text="t('asset.versionNoChange')"
        test-id="asset-version-diff-empty"
      />
      <SmTable
        v-else
        test-id="asset-version-diff-table"
        row-key="key"
        :columns="[
          { title: t('asset.versionField'), key: 'field', dataIndex: 'field' },
          { title: t('asset.versionOldValue'), key: 'oldValue', dataIndex: 'oldValue' },
          { title: t('asset.versionNewValue'), key: 'newValue', dataIndex: 'newValue' },
        ]"
        :data-source="diffRows"
      />
    </div>
    <div>
      <a href="#" @click.prevent="router.push({ name: 'asset', params: { entityType, fqn } })">{{ title }}</a>
    </div>
  </PageLayout>
</template>
