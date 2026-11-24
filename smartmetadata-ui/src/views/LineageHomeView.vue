<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute, useRouter } from 'vue-router';
import { Button, message, Spin, Tooltip } from 'ant-design-vue';
import { getDerivedPermissionFlags } from '@/api/permissions';
import { assetLocation, lineageLocation } from '@/catalog/entityRoutes';
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
  type LineageSceneNode,
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

function openSceneAsset(node: LineageSceneNode): void {
  if (!node.entityType || !node.fullyQualifiedName) {
    return;
  }
  void router.push(assetLocation(node.entityType, node.fullyQualifiedName));
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

// The page buttons delegate to whichever graph is mounted, mirroring
// pin's page-level actions (pin's LineageExportButton is a PNG export
// of the drawn graph; the map has its own Export PNG button too). The
// focused view keeps the canvas's modal; the platform view renders the
// same modal at page level because the canvas is not mounted there.
const canvasRef = ref<{
  exportPng: () => Promise<void>;
  openConfig: () => void;
} | null>(null);
const mapRef = ref<{ exportPng: () => Promise<void> } | null>(null);
const configModalOpen = ref(false);

async function onExportPng(): Promise<void> {
  try {
    if (focused.value) {
      await canvasRef.value?.exportPng();
    } else {
      await mapRef.value?.exportPng();
    }
  } catch {
    message.error(t('lineage.exportPngFailed'));
  }
}

function onOpenConfig(): void {
  if (focused.value) {
    canvasRef.value?.openConfig();
  } else {
    configModalOpen.value = true;
  }
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
    <PageHeader :header="title" :sub-header="t('lineage.platformLead')" learning-page-id="lineage" />
    <div class="lineage-page__toolbar" data-testid="platform-lineage-toolbar">
      <div data-testid="search-entity-select">
        <LineageEntitySearch :placeholder="focused ? fqn : undefined" @select="openTarget" />
      </div>
      <div class="lineage-page__actions">
        <Tooltip :title="t('lineage.exportAsPng')" placement="top">
          <Button data-testid="export-button" :aria-label="t('lineage.exportAsPng')" @click="onExportPng">
            {{ t('lineage.exportPng') }}
          </Button>
        </Tooltip>
        <Tooltip :title="t('lineage.config')" placement="top">
          <Button data-testid="lineage-config" :aria-label="t('lineage.config')" @click="onOpenConfig">
            {{ t('lineage.config') }}
          </Button>
        </Tooltip>
      </div>
    </div>
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
        @navigate="openSceneAsset"
      />
      <LineageCanvas
        v-else
        ref="canvasRef"
        :entity-type="entityType"
        :fqn="fqn"
        :show-header="false"
        :has-edit-access="canEditLineage"
        variant="page"
      />
    </Spin>
    <LineageConfigModal
      v-if="!focused"
      :open="configModalOpen"
      :config="lineageStore.config"
      @ok="onConfigSave"
      @cancel="configModalOpen = false"
    />
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
</style>
