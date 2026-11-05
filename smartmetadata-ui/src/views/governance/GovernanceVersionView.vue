<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { Button, Descriptions } from 'ant-design-vue';
import type { ChangeField, EntityVersion } from '@/api/entities';
import { getGovernanceVersion, listGovernanceVersions } from '@/api/governanceVersions';
import { getGovernanceDetailPath, getGovernanceVersionPath, type GovernanceVersionKind } from '@/catalog/versionPaths';
import PageHeader from '@/components/shared/PageHeader.vue';
import PageLayout from '@/components/shared/PageLayout.vue';
import SmMarkdown from '@/components/shared/SmMarkdown.vue';
import SmState from '@/components/shared/SmState.vue';
import SmTable from '@/components/shared/SmTable.vue';

const props = defineProps<{
  kind: GovernanceVersionKind;
  id: string;
  version: string;
  tab?: string;
}>();

const router = useRouter();
const { t } = useI18n();

const loading = ref(true);
const errorMessage = ref('');
const versions = ref<EntityVersion[]>([]);
const snapshot = ref<Record<string, unknown> | null>(null);

function renderValue(value: unknown): string {
  if (value === undefined || value === null) {
    return '—';
  }
  return typeof value === 'string' ? value : JSON.stringify(value);
}

const snapshotName = computed(() => {
  const raw = snapshot.value ?? {};
  const displayName = typeof raw.displayName === 'string' ? raw.displayName : '';
  const name = typeof raw.name === 'string' ? raw.name : '';
  return displayName || name || props.id;
});

const snapshotDescription = computed(() => {
  const raw = snapshot.value ?? {};
  return typeof raw.description === 'string' ? raw.description : '';
});

interface DiffRow {
  key: string;
  field: string;
  change: string;
  oldValue: string;
  newValue: string;
}

const diffRows = computed<DiffRow[]>(() => {
  const entry = versions.value.find((item) => String(item.version) === String(props.version));
  const change = entry?.changeDescription;
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

// Rich-text (markdown) fields render as plain text here on purpose:
// the product has no markdown renderer yet, and the renderer choice is
// shared with the marketplace detail (A10) — this group must not mint
// a second one. The note below marks the spot for the unified
// renderer once group 1 lands it.
const descriptionDiff = computed(() => diffRows.value.find((row) => row.field === 'description'));

async function load(): Promise<void> {
  loading.value = true;
  errorMessage.value = '';
  try {
    const [list, snap] = await Promise.all([
      listGovernanceVersions(props.kind, props.id),
      getGovernanceVersion(props.kind, props.id, props.version),
    ]);
    versions.value = list;
    snapshot.value = snap;
  } catch (error) {
    versions.value = [];
    snapshot.value = null;
    errorMessage.value = error instanceof Error ? error.message : t('asset.versionsFailed');
  } finally {
    loading.value = false;
  }
}

function onSelectVersion(version: string): void {
  void router.push(getGovernanceVersionPath(props.kind, props.id, version, props.tab));
}

function onBack(): void {
  void router.push(getGovernanceDetailPath(props.kind, props.id));
}

watch(
  () => [props.kind, props.id, props.version],
  () => {
    void load();
  },
);

onMounted(() => {
  void load();
});
</script>

<template>
  <PageLayout>
    <PageHeader :header="t('governance.versions.title')" :sub-header="t('governance.versions.lead')" />
    <Button data-testid="governance-version-back" @click="onBack">
      {{ t('governance.versions.back') }}
    </Button>
    <SmState
      v-if="loading || errorMessage || !snapshot"
      :state="loading ? 'loading' : errorMessage ? 'error' : 'empty'"
      :error-text="errorMessage || undefined"
      :empty-text="t('governance.versions.empty')"
      test-id="governance-version-state"
    />
    <template v-else>
      <Descriptions bordered :column="1" size="small" class="version-snapshot">
        <Descriptions.Item :label="t('crud.name')">{{ snapshotName }}</Descriptions.Item>
        <Descriptions.Item :label="t('crud.description')">{{ snapshotDescription || '—' }}</Descriptions.Item>
        <Descriptions.Item :label="t('asset.versionsTitle')">{{ props.version }}</Descriptions.Item>
      </Descriptions>
      <div class="version-timeline">
        <Button
          v-for="entry in versions"
          :key="String(entry.version)"
          :type="String(entry.version) === String(props.version) ? 'primary' : 'default'"
          :data-testid="`governance-version-${entry.version}`"
          @click="onSelectVersion(String(entry.version))"
        >
          {{ entry.version }}
        </Button>
      </div>
      <div v-if="diffRows.length">
        <h3 data-testid="governance-version-diff-title">
          {{ t('asset.versionDiffTitle') }} — {{ props.version }}
        </h3>
        <SmTable
          test-id="governance-version-diff-table"
          row-key="key"
          :columns="[
            { title: t('asset.versionField'), key: 'field', dataIndex: 'field' },
            { title: t('asset.versionOldValue'), key: 'oldValue', dataIndex: 'oldValue' },
            { title: t('asset.versionNewValue'), key: 'newValue', dataIndex: 'newValue' },
          ]"
          :data-source="diffRows"
        />
        <div v-if="descriptionDiff" data-testid="governance-version-richtext-diff">
          <SmMarkdown :markdown="descriptionDiff.oldValue" test-id="governance-version-richtext-old" />
          <SmMarkdown :markdown="descriptionDiff.newValue" test-id="governance-version-richtext-new" />
        </div>
      </div>
      <SmState
        v-else
        state="empty"
        :empty-text="t('asset.versionNoChange')"
        test-id="governance-version-diff-empty"
      />
    </template>
  </PageLayout>
</template>

<style scoped>
.version-snapshot {
  margin: 16px 0;
}
.version-timeline {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin: 16px 0;
}
</style>
