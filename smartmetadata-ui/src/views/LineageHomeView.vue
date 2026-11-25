<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute, useRouter } from 'vue-router';
import { Button, message, Spin, Tooltip } from 'ant-design-vue';
import { DownloadOutlined, SettingOutlined } from '@ant-design/icons-vue';
import { getDerivedPermissionFlags } from '@/api/permissions';
import { lineageLocation } from '@/catalog/entityRoutes';
import LineageCanvas from '@/components/lineage/LineageCanvas.vue';
import LineageConfigModal from '@/components/lineage/LineageConfigModal.vue';
import LineageEntitySearch from '@/components/lineage/LineageEntitySearch.vue';
import LineageMap from '@/components/lineage/LineageMap.vue';
import PageHeader from '@/components/shared/PageHeader.vue';
import PageLayout from '@/components/shared/PageLayout.vue';
import type { LineageCanvasConfig } from '@/lineage/config';
import {
  getLensLabelKey,
  getSceneRequestFromSearch,
  getSceneSearch,
  type LineageSceneRequest,
} from '@/lineage/scene';
import { useLineageStore } from '@/stores/lineage';
import { usePermissionStore } from '@/stores/permissions';

/**
 * Unified lineage page — pin pages/PlatformLineage/PlatformLineage.tsx
 * serves both `/lineage` (platform-wide) and `/lineage/:entityType/:fqn`
 * (focused) from one component; this view does the same. There is no
 * FQN form: pin has none, the search picker is the only entry point.
 *
 * The page owns the search picker, the export + config actions and the
 * per-entity permission check; the platform view is the scene map (pin
 * LineageMap, fed by GET lineage/scene) and the focused view keeps the
 * entity canvas. Config save writes the Pinia lineage store, which the
 * canvas watches and the map reads as props — the same store-write →
 * refetch shape as pin's Zustand store.
 */
const props = withDefaults(
  defineProps<{
    entityType?: string;
    fqn?: string;
  }>(),
  { entityType: '', fqn: '' },
);

const router = useRouter();
const route = useRoute();
const { t } = useI18n();
const permissionStore = usePermissionStore();

const focused = computed(() => Boolean(props.entityType && props.fqn));

// The scene request is the platform view's source of truth (pin
// PlatformLineage + LineageMap): it round-trips through
// ?lineageLens=/lineageBand=/lineageFocus=/lineageEntityType=, the
// platform root defaults to the Layer band, and the map owns its fetch
// from these props. The title uses pin's getLensLabelKey, exactly like
// pin's `t('label.platform-type-lineage', { platformType:
// t(getLensLabelKey(lens)) })`.
const lineageStore = useLineageStore();
lineageStore.hydrate();

function currentSearch(): string {
  const index = route.fullPath.indexOf('?');
  return index >= 0 ? route.fullPath.slice(index) : '';
}

const sceneRequest = ref<LineageSceneRequest>(
  getSceneRequestFromSearch(currentSearch(), {}, true),
);

const lens = computed(() => sceneRequest.value.lens);

const title = computed(() =>
  t('lineage.platformTitle', { platformType: t(getLensLabelKey(lens.value)) }),
);

function onSceneRequestChange(request: LineageSceneRequest): void {
  sceneRequest.value = request;
  void router.replace(`${route.path}${getSceneSearch(currentSearch(), request)}`);
}

// Pin pageTitle: the focused variant names the entity it is centred on
// (the FQN when no entity name was fetched); the platform variant is
// the plain lineage title.
const pageTitle = computed(() =>
  focused.value
    ? t('lineage.platformTitle', { platformType: props.fqn })
    : t('lineage.title'),
);

// Per-entity edit permission (pin useEntityPermissions → canEditLineage),
// read through the permission store like AssetDetailView: the resource
// is the route's entity type, so it must re-resolve when the route
// changes. Fail-closed: a failed read leaves editing disabled, and the
// failure is toasted once like pin's showErrorToast.
const canEditLineage = ref(false);
const permissionsLoading = ref(false);
const permissionsError = ref('');
let permissionSeq = 0;

async function loadPermissions(): Promise<void> {
  const seq = ++permissionSeq;
  if (!focused.value) {
    canEditLineage.value = false;
    permissionsLoading.value = false;
    permissionsError.value = '';
    return;
  }
  permissionsLoading.value = true;
  permissionsError.value = '';
  try {
    const ops = await permissionStore.getEntityPermissionByFqn(props.entityType, props.fqn);
    if (seq !== permissionSeq) {
      return;
    }
    canEditLineage.value = getDerivedPermissionFlags(ops).canEditLineage;
  } catch (error) {
    if (seq !== permissionSeq) {
      return;
    }
    canEditLineage.value = false;
    permissionsError.value =
      error instanceof Error ? error.message : t('lineage.permissionLoadFailed');
  } finally {
    if (seq === permissionSeq) {
      permissionsLoading.value = false;
    }
  }
}

watch(
  () => [props.entityType, props.fqn],
  () => {
    void loadPermissions();
  },
  { immediate: true },
);

watch(permissionsError, (value) => {
  if (value) {
    message.error(value);
  }
});

// The page buttons delegate to the platform map, mirroring pin's
// page-level actions: pin PlatformLineage renders Export PNG and
// Lineage configuration exactly once, in the page header (a3012259ca
// `pages/PlatformLineage/PlatformLineage.tsx:214,218-224`), and the map
// itself has no export button. The focused view's export/config live in
// the canvas header (pin `CustomControls`), so the page toolbar hides
// its actions there and the canvas ref is gone.
const mapRef = ref<{ exportPng: () => Promise<void> } | null>(null);
const configModalOpen = ref(false);

async function onExportPng(): Promise<void> {
  try {
    await mapRef.value?.exportPng();
  } catch {
    message.error(t('lineage.exportPngFailed'));
  }
}

function onOpenConfig(): void {
  configModalOpen.value = true;
}

function onConfigSave(next: LineageCanvasConfig): void {
  configModalOpen.value = false;
  // The map reads depths from the store via props; it has no layer
  // overlays to re-seed, unlike the canvas.
  lineageStore.update(next);
}

function openTarget(target: { entityType: string; fqn: string }): void {
  void router.push(lineageLocation(target.entityType, target.fqn));
}
</script>

<template>
  <PageLayout :document-title="pageTitle" test-id="platform-lineage-page">
    <div :class="focused ? undefined : 'lineage-page__platform'">
      <PageHeader :header="title" :sub-header="t('lineage.platformLead')" learning-page-id="lineage" />
      <div class="lineage-page__toolbar" data-testid="platform-lineage-toolbar">
        <div data-testid="search-entity-select">
          <LineageEntitySearch :placeholder="focused ? fqn : undefined" @select="openTarget" />
        </div>
        <div v-if="!focused" class="lineage-page__actions">
          <Tooltip :title="t('lineage.exportAsPng')" placement="top">
            <Button data-testid="export-button" :aria-label="t('lineage.exportAsPng')" @click="onExportPng">
              <template #icon><DownloadOutlined /></template>
            </Button>
          </Tooltip>
          <Tooltip :title="t('lineage.config')" placement="top">
            <Button data-testid="lineage-config" :aria-label="t('lineage.config')" @click="onOpenConfig">
              <template #icon><SettingOutlined /></template>
            </Button>
          </Tooltip>
        </div>
      </div>
      <!-- The height-chain hook is a native div, never a class on
        <Spin>: antd Spin is inheritAttrs:false and folds a fallthrough
        class onto the spinner element, which only renders while
        spinning — in the platform view (never spinning) the class
        vanishes from the DOM and the flex rules below never match
        (live 2026-11-25: home canvas 0px). -->
      <div class="lineage-page__spin">
        <Spin :spinning="permissionsLoading">
          <LineageMap
            v-if="!focused"
            ref="mapRef"
            :lens="sceneRequest.lens"
            :band="sceneRequest.band"
            :focus-fqn="sceneRequest.focusFqn"
            :entity-type="sceneRequest.entityType"
            :upstream-depth="lineageStore.config.upstreamDepth"
            :downstream-depth="lineageStore.config.downstreamDepth"
            @request-change="onSceneRequestChange"
          />
          <LineageCanvas
            v-else
            :entity-type="entityType"
            :fqn="fqn"
            :show-header="false"
            :has-edit-access="canEditLineage"
            variant="page"
          />
        </Spin>
      </div>
      <LineageConfigModal
        v-if="!focused"
        :open="configModalOpen"
        :config="lineageStore.config"
        @ok="onConfigSave"
        @cancel="configModalOpen = false"
      />
    </div>
  </PageLayout>
</template>

<style scoped>
.lineage-page__toolbar {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
  margin: 12px 0;
}
.lineage-page__actions {
  display: flex;
  gap: 8px;
  flex-shrink: 0;
}
/* Platform map height (pin `pages/PlatformLineage/platform-lineage.less`):
   pin gives the lineage container a viewport-derived height
   (`calc(100vh - navbar - 98px)`) and the card inside is a flex column
   whose map container flexes to fill it. The product's chrome above this
   page is the 64px app header plus the 16px shell content margins, so
   the platform wrapper takes the same shape: a fixed viewport height,
   flex column, header + toolbar at natural height, the map flexing to
   fill the rest. Focused (entity) view keeps the scrolling page: the
   wrapper is a plain div there and the canvas is untouched. */
.lineage-page__platform {
  display: flex;
  flex-direction: column;
  height: calc(100vh - var(--sm-header-height) - 32px);
  min-height: 0;
}
.lineage-page__platform .lineage-page__toolbar {
  flex-shrink: 0;
}
.lineage-page__platform .lineage-page__spin {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  min-height: 0;
}
/* The Spin root is a plain block flex-item of the host div, so it
   needs its own flex rule too — the host alone is not enough: without
   this the root stays at content height (~106px toolbar) and the
   container's flex:1 has nothing to distribute. Both :deep() rules
   are required because antd renders both elements, not this SFC. */
.lineage-page__platform .lineage-page__spin :deep(.ant-spin-nested-loading) {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  min-height: 0;
}
.lineage-page__platform .lineage-page__spin :deep(.ant-spin-container) {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  min-height: 0;
}
</style>
