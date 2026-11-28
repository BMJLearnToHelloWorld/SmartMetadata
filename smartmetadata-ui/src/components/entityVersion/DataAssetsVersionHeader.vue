<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { Button, Divider, Tooltip } from 'ant-design-vue';
import type { TextDiffResult } from '@/ingestion/versionDiff';
import type { DiffLabel, DiffReference, TierDisplay } from '@/ingestion/versionDiff';
import { getEntityName } from '@/components/shared/profilePictureUtils';
import SmBreadcrumb from '@/components/shared/SmBreadcrumb.vue';
import VersionDiffText from '@/components/ingestion/VersionDiffText.vue';
import type { AssetDetail } from '@/types/api';

const props = defineProps<{
  breadcrumbLinks?: { name: string; path?: string }[];
  version: string;
  deleted?: boolean;
  displayName: TextDiffResult;
  currentVersionData: AssetDetail;
  ownerDisplayName?: Map<string, DiffLabel>;
  tierDisplayName?: TierDisplay;
  ownerRef?: DiffReference[];
  domainDisplayName?: DiffLabel[];
  domains?: DiffReference[];
  entityType: string;
  serviceName?: string;
}>();

const emit = defineEmits<{ versionClick: [] }>();
const { t } = useI18n();

const entityName = computed(() => getEntityName(props.currentVersionData) || props.currentVersionData.name);
const crumbs = computed(() =>
  (props.breadcrumbLinks ?? []).map((link) => ({ label: link.name, to: link.path })),
);

function ownerLabel(owner: DiffReference): DiffLabel | string {
  const key = owner.id || owner.fullyQualifiedName || owner.name || '';
  return props.ownerDisplayName?.get(key) ?? getEntityName(owner) ?? owner.name ?? '';
}

function isDiffLabel(value: unknown): value is DiffLabel {
  return Boolean(value && typeof value === 'object' && 'text' in (value as object) && 'change' in (value as object));
}

function tierText(value: TierDisplay | undefined): string {
  if (!value) {
    return '';
  }
  if (typeof value === 'string') {
    return value;
  }
  if (isDiffLabel(value)) {
    return value.text;
  }
  return String(value);
}
</script>

<template>
  <div class="data-assets-version-header" data-testid="data-assets-version-header">
    <div class="data-assets-version-header__main">
      <SmBreadcrumb v-if="crumbs.length" :items="crumbs" />
      <div class="data-assets-version-header__title">
        <h1 data-testid="entity-header-name">
          <VersionDiffText :diff="displayName" />
        </h1>
        <span v-if="currentVersionData.name && currentVersionData.name !== entityName" class="data-assets-version-header__name">
          {{ currentVersionData.name }}
        </span>
        <span v-if="deleted" class="data-assets-version-header__deleted" data-testid="deleted-badge">
          {{ t('label.deleted') }}
        </span>
      </div>
      <div class="data-assets-version-header__meta" data-testid="entity-header-info">
        <template v-if="entityType !== 'metadataService'">
          <span class="data-assets-version-header__domains" data-testid="domain">
            <template v-if="domains?.length">
              <span v-for="(domain, index) in domains" :key="domain.id || domain.fullyQualifiedName || index">
                {{ isDiffLabel(domainDisplayName?.[index]) ? domainDisplayName?.[index]?.text : (getEntityName(domain) || domain.name) }}
              </span>
            </template>
            <span v-else>{{ t('label.no-entity', { entity: t('label.domain-plural') }) }}</span>
          </span>
          <Divider type="vertical" />
        </template>
        <span class="data-assets-version-header__owners" data-testid="owner-label">
          <template v-if="(ownerRef ?? currentVersionData.owners)?.length">
            <span v-for="owner in (ownerRef ?? currentVersionData.owners)" :key="owner.id || owner.name">
              {{ isDiffLabel(ownerLabel(owner)) ? (ownerLabel(owner) as DiffLabel).text : ownerLabel(owner) }}
            </span>
          </template>
          <span v-else>{{ t('label.no-entity', { entity: t('label.owner-plural') }) }}</span>
        </span>
        <Divider type="vertical" />
        <span data-testid="Tier" class="data-assets-version-header__tier">
          {{ tierText(tierDisplayName) || t('label.no-entity', { entity: t('label.tier') }) }}
        </span>
      </div>
    </div>
    <div class="data-assets-version-header__actions">
      <Tooltip :title="t('label.exit-version-history')">
        <Button data-testid="version-button" @click="emit('versionClick')">
          {{ version }}
        </Button>
      </Tooltip>
    </div>
  </div>
</template>

<style scoped>
.data-assets-version-header {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
  align-items: flex-start;
}
.data-assets-version-header__main {
  flex: 1 1 70%;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.data-assets-version-header__title {
  display: flex;
  align-items: baseline;
  gap: 8px;
  flex-wrap: wrap;
}
.data-assets-version-header__title h1 {
  margin: 0;
  font-size: 20px;
  font-weight: 600;
  color: var(--sm-color-text, inherit);
}
.data-assets-version-header__name,
.data-assets-version-header__meta {
  color: var(--sm-color-text-secondary, var(--sm-color-text, inherit));
}
.data-assets-version-header__deleted {
  padding: 0 8px;
  border-radius: 4px;
  background: var(--sm-color-danger-bg, rgba(255, 77, 79, 0.12));
  color: var(--sm-color-danger, #cf1322);
  font-size: 12px;
}
.data-assets-version-header__meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  font-weight: 500;
}
.data-assets-version-header__actions {
  flex: 0 0 auto;
}
</style>
