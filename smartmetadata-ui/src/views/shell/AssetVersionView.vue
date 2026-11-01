<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { fetchAssetDetail, listEntityVersions, type EntityVersion } from '@/api/entities';
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
      :columns="[
        { title: t('asset.versionsTitle'), key: 'version', dataIndex: 'version' },
        { title: t('asset.columns.timestamp'), key: 'updatedAt', dataIndex: 'updatedAt' },
      ]"
      :data-source="
        versions.map((version, index) => ({
          key: String(version.version ?? index),
          version: version.version ?? '—',
          updatedAt: version.updatedAt ? new Date(version.updatedAt).toISOString() : '—',
        }))
      "
    />
    <div>
      <a href="#" @click.prevent="router.push({ name: 'asset', params: { entityType, fqn } })">{{ title }}</a>
    </div>
  </PageLayout>
</template>
