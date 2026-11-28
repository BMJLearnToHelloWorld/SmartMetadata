<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import EntityVersionMainContent from '@/components/entityVersion/EntityVersionMainContent.vue';
import EntityVersionShell from '@/components/entityVersion/EntityVersionShell.vue';
import type { ParentEntityVersionProps } from '@/components/entityVersion/entityVersionProps';
import { ENTITY_VERSION_CONTENT, ENTITY_VERSION_MAIN_TAB } from '@/catalog/entityVersion';

const props = defineProps<ParentEntityVersionProps>();
const { t } = useI18n();
const tab = ENTITY_VERSION_MAIN_TAB['directory'];
const contentKind = ENTITY_VERSION_CONTENT['directory'];
</script>

<template>
  <EntityVersionShell
    entity-type="directory"
    :current-version-data="props.currentVersionData"
    :deleted="props.deleted"
    :entity-permissions="props.entityPermissions"
    :is-version-loading="props.isVersionLoading"
    :main-tab-key="tab.key"
    :main-tab-label="t(tab.labelKey)"
    :tab="props.tab"
    :version="props.version"
    :version-list="props.versionList"
    @back="props.backHandler"
    @select-version="props.versionHandler"
  >
    <EntityVersionMainContent
      entity-type="directory"
      :content-kind="contentKind"
      :current-version-data="props.currentVersionData"
      :is-version-loading="props.isVersionLoading"
    />
  </EntityVersionShell>
</template>
