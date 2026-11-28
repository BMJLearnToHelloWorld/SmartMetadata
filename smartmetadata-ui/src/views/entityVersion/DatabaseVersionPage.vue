<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { ref } from 'vue';
import { useI18n } from 'vue-i18n';
import EntityVersionMainContent from '@/components/entityVersion/EntityVersionMainContent.vue';
import EntityVersionShell from '@/components/entityVersion/EntityVersionShell.vue';
import PermissionPlaceholder from '@/components/shared/PermissionPlaceholder.vue';
import { ENTITY_VERSION_CONTENT, ENTITY_VERSION_MAIN_TAB } from '@/catalog/entityVersion';
import { useSelfContainedVersionPage, type EntityVersionRouteProps } from '@/views/entityVersion/selfContainedVersionPage';

const props = defineProps<EntityVersionRouteProps>();
const { t } = useI18n();
const tab = ENTITY_VERSION_MAIN_TAB['database'];
const contentKind = ENTITY_VERSION_CONTENT['database'];
const {
  entityPermissions,
  hasViewAccess,
  isLoading,
  isVersionLoading,
  currentVersionData,
  versionList,
  versionHandler,
  backHandler,
} = useSelfContainedVersionPage({
  entityType: 'database',
  fqn: () => props.fqn,
  version: () => props.version,
  tab: () => props.tab,
});
const childRows = ref<{ id?: string; name?: string; displayName?: string; fullyQualifiedName?: string; description?: string }[]>([]);
const childLoading = ref(false);

</script>

<template>
  <PermissionPlaceholder
    v-if="!isLoading && !hasViewAccess"
    data-testid="permission-error-placeholder"
    :permission-value="t('label.view-entity', { entity: t('label.database-version') })"
  />
  <EntityVersionShell
    v-else-if="!isLoading && hasViewAccess"
    entity-type="database"
    :current-version-data="currentVersionData"
    :deleted="currentVersionData.deleted"
    :entity-permissions="entityPermissions"
    :is-version-loading="isVersionLoading"
    :main-tab-key="tab.key"
    :main-tab-label="t(tab.labelKey)"
    :tab="props.tab"
    :version="props.version"
    :version-list="versionList"
    @back="backHandler"
    @select-version="versionHandler"
  >
    <EntityVersionMainContent
      entity-type="database"
      :child-loading="childLoading"
      :child-rows="childRows.length ? childRows : undefined"
      :content-kind="contentKind"
      :current-version-data="currentVersionData"
      :is-version-loading="isVersionLoading"
    />
  </EntityVersionShell>
</template>
