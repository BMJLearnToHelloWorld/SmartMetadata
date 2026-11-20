<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { onBeforeRouteLeave, useRouter } from 'vue-router';
import { Button, Modal } from 'ant-design-vue';
import ObjectLayoutNotice from '@/views/admin/persona/editors/ObjectLayoutNotice.vue';
import CustomizeHomeModal from './CustomizeHomeModal.vue';
import HomeWidgetCard from './HomeWidgetCard.vue';
import { compactDisplayLayout } from './useTopicsView';
import {
  DEFAULT_LANDING_PAGE_LAYOUT,
  EXCLUDED_WIDGET_FQNS,
  LANDING_PAGE_MAX_GRID_SIZE,
  LANDING_PAGE_ROW_HEIGHT,
  LANDING_PAGE_WIDGET_KEYS,
  LANDING_PAGE_WIDGET_MARGIN,
  MY_DATA_WIDGET_KEYS,
  normalizeLandingPageLayout,
  type LandingPageLayoutItem,
} from './landingPageLayout';
import {
  EMPTY_WIDGET_PLACEHOLDER,
  getAddWidgetHandler,
  getLandingPageLayoutWithEmptyWidgetPlaceholder,
  getLayoutUpdateHandler,
  getRemoveWidgetHandler,
  getUniqueFilteredLayout,
  isLayoutDirty,
  type EditorLayoutItem,
} from './landingPageEditor';
import {
  MY_DATA_WIDGET_OPTIONS,
  resolveMyDataWidget,
  resolveMyDataWidgetBaseKey,
} from './landingPageWidgets';
import { DEFAULT_HEADER_BG_COLOR } from './landingHeaderColor';
import type { PersonaPage } from '@/types/persona';

/**
 * The persona landing-page editor, ported from the official framework
 * (openmetadata-ui `components/MyData/CustomizeMyData/CustomizeMyData.tsx`).
 *
 * The editor reads the persona's layout exactly as the home page
 * does (same five-parameter normalization), so it never offers an
 * arrangement the home page will not render. Save, reset and the
 * leave flow follow pin: save writes the filtered layout (the
 * placeholder is never persisted); reset restores the default layout,
 * clears the header colour, and saves with NO page argument, which
 * removes the LandingPage entry; leaving with unsaved changes asks
 * first (Save and exit / Discard / Cancel), and save errors stay on
 * the page.
 *
 * Drag is the self-built light drag decided in
 * ADR:2026-11-10-my-data-customize-page-drag (B-5 (b)): two columns,
 * uniform h=3, no resize. The drag handle is the card's
 * `.drag-widget-icon`; a dragover computes the target cell from the
 * pointer and reflows live through `getLayoutUpdateHandler`, the same
 * handler pin's grid feeds. `grid-layout-plus` is the named fallback
 * if live verification shows this cannot match the grid behaviour.
 *
 * C-4 §2.5: the save fallback pageType is the raw pageFqn from the
 * caller prop (no 'LandingPage' hardcode, no normalization).
 * C-4 §4.4/D2: a stored non-array layout renders the explicit
 * abnormal state (ObjectLayoutNotice) instead of a default grid.
 */
const props = defineProps<{
  personaName: string;
  personaFqn: string;
  /**
   * The raw pageFqn (caller-prop injection, C-4 §2.5(d)): the save
   * fallback pageType when no page is stored yet. Never normalized —
   * 'homepage' stays 'homepage', 'LandingPage' stays 'LandingPage'.
   * Required so a missing wire-up fails the type gate loudly.
   */
  pageFqn: string;
  initialPageData?: PersonaPage | null;
  backgroundColor: string;
  onSaveLayout: (newPage?: PersonaPage) => Promise<void>;
  onBackgroundColorUpdate: (color?: string) => Promise<void>;
  /**
   * O-ENTRY-2: exit ownership. Pin `CustomizeMyData` never navigates
   * — exit belongs to the parent (the settings-route header closes
   * to the persona detail page; the overlay shell closes the
   * overlay). When the parent supplies `onExit`, both the direct
   * and the leave-modal paths call it; without a parent, the
   * historical home navigation stays as the default.
   */
  onExit?: () => void;
}>();

const { t } = useI18n();
const router = useRouter();

/**
 * D2 (S-C4STORE §3.2, binding): a present-but-non-array stored layout
 * is an explicit abnormal state, never silently defaulted. The grid
 * is hidden until the user explicitly confirms conversion; the
 * original field is preserved untouched until a save replaces it.
 * `{}` and non-empty objects are treated identically here.
 */
const hasObjectLayout = computed(() => {
  const stored = props.initialPageData?.layout;
  return stored !== undefined && !Array.isArray(stored);
});
const converted = ref(false);
watch(
  () => props.initialPageData,
  () => {
    converted.value = false;
  },
);

const savedLayout = computed(() =>
  Array.isArray(props.initialPageData?.layout)
    ? (props.initialPageData.layout as LandingPageLayoutItem[])
    : undefined,
);

/**
 * The loaded layout, normalized exactly as the home page reads it.
 * It follows the shell's saved document, so after a save the current
 * layout is the new baseline and Save disables itself again.
 */
const initialLayout = computed(() =>
  normalizeLandingPageLayout(
    savedLayout.value,
    DEFAULT_LANDING_PAGE_LAYOUT,
    EXCLUDED_WIDGET_FQNS,
    LANDING_PAGE_MAX_GRID_SIZE,
    MY_DATA_WIDGET_KEYS,
  ),
);

const layout = ref<EditorLayoutItem[]>(
  getLandingPageLayoutWithEmptyWidgetPlaceholder(initialLayout.value),
);
const placeholderWidgetKey = ref<string>(EMPTY_WIDGET_PLACEHOLDER);
const isWidgetModalOpen = ref(false);
const saving = ref(false);
const color = ref(props.backgroundColor || DEFAULT_HEADER_BG_COLOR);
const gridRef = ref<HTMLElement | null>(null);
const draggedKey = ref<string | null>(null);
const lastDragTarget = ref<{ x: number; y: number } | null>(null);

/** The leave flow: the action to run once the user chooses to leave. */
const pendingLeave = ref<(() => void) | null>(null);
const leaveModalOpen = ref(false);

/**
 * Pin NavigationBlocker (`hasConfirmedLeave`): once the user confirms
 * leaving — Discard, or Save-and-exit after a successful save — the
 * confirmed leave must not be re-intercepted. Without this, Discard
 * from the page Cancel path starts a fresh router.push while the
 * editor is still dirty, the route guard intercepts it again, and the
 * modal reopens forever (C-4 acceptance: Discard visibly stuck).
 */
const leaveConfirmed = ref(false);
/** Abort for the route navigation held by onBeforeRouteLeave, if any. */
const abortHeldNavigation = ref<(() => void) | null>(null);

const disableSave = computed(() => {
  if (hasObjectLayout.value) {
    // Unconverted: no edits are possible, save is unreachable.
    // Converted: any save replaces the object layout, so the editor
    // is always dirty until the save lands a new stored value.
    return !converted.value;
  }
  return !isLayoutDirty(initialLayout.value, layout.value);
});

function convertObjectLayout(): void {
  converted.value = true;
}

/**
 * What the grid renders. The working layout is already tightly packed
 * by `ensurePlaceholderAtEnd` on every path (load, add, remove, drag,
 * reset), so compaction is the identity here — it is a render-level
 * guard, so a gapped layout can never render overlapped the way the
 * home page did before T-1 (ADR:2026-11-11-home-style-compaction-and-tokens).
 * The saved layout is never rewritten by this: save still writes
 * `layout.value`.
 */
const displayLayout = computed(() => compactDisplayLayout(layout.value));

const addedWidgetsList = computed(() =>
  layout.value.filter((widget) => widget.i.startsWith('KnowledgePanel')).map((widget) => widget.i),
);

function isPlaceholder(item: EditorLayoutItem): boolean {
  return item.i.endsWith('.EmptyWidgetPlaceholder');
}

function cellStyle(item: EditorLayoutItem): Record<string, string> {
  return {
    gridColumn: `${item.x + 1} / span ${item.w}`,
    gridRow: `${item.y + 1} / span ${item.h}`,
  };
}

function widgetLabel(item: EditorLayoutItem): string {
  return (
    MY_DATA_WIDGET_OPTIONS.find((option) => item.i.startsWith(option.key))?.label ?? item.i
  );
}

/**
 * Props for the widget in an editor cell. Every widget takes its
 * instance key plus `editView` (which falls through the widget to its
 * root HomeWidgetCard); CuratedAssets additionally reads its saved
 * config off the layout by that key. YoursAndFollowed has no central
 * props in the editor, so it renders its empty state — the editor is
 * for arranging widgets, not for their data.
 */
function editorWidgetProps(item: EditorLayoutItem): Record<string, unknown> {
  const baseKey = resolveMyDataWidgetBaseKey(item.i);
  const base: Record<string, unknown> = { widgetKey: item.i, editView: true };
  switch (baseKey) {
    case LANDING_PAGE_WIDGET_KEYS.YOURS_AND_FOLLOWED:
      return {
        ...base,
        owned: [],
        followed: [],
        ownedTotal: 0,
        followedTotal: 0,
        sort: 'latest',
        sortOptions: [
          { value: 'latest', label: t('home.sortLatest') },
          { value: 'name', label: t('home.sortName') },
        ],
      };
    case LANDING_PAGE_WIDGET_KEYS.CURATED_ASSETS:
      return { ...base, currentLayout: layout.value };
    default:
      return base;
  }
}

function handleRemoveWidget(widgetKey: string): void {
  layout.value = getRemoveWidgetHandler(widgetKey)(layout.value);
}

function handleAddWidget(
  widgetFqn: string,
  placeholderKey: string,
  widgetWidth: number,
): void {
  layout.value = getAddWidgetHandler(
    widgetFqn,
    placeholderKey,
    widgetWidth,
    LANDING_PAGE_MAX_GRID_SIZE,
  )(layout.value);
}

async function handleBackgroundColorUpdate(nextColor?: string): Promise<void> {
  await props.onBackgroundColorUpdate(nextColor);
  color.value = nextColor ?? DEFAULT_HEADER_BG_COLOR;
}

function openWidgetModal(placeholderKey?: string): void {
  if (placeholderKey) {
    placeholderWidgetKey.value = placeholderKey;
  }
  isWidgetModalOpen.value = true;
}

async function handleSave(updatedLayout?: EditorLayoutItem[]): Promise<void> {
  saving.value = true;
  try {
    await props.onSaveLayout({
      ...(props.initialPageData ?? { pageType: props.pageFqn }),
      layout: getUniqueFilteredLayout(updatedLayout ?? layout.value),
    });
  } finally {
    saving.value = false;
  }
}

function handleReset(): void {
  Modal.confirm({
    title: t('home.resetDefaultLayout'),
    content: t('home.resetLayoutConfirmation'),
    okText: t('home.reset'),
    cancelText: t('crud.cancel'),
    onOk: async () => {
      // Reset restores the default layout, clears the header colour,
      // and saves with NO page argument — which removes the
      // LandingPage entry, so the home page falls back to the default.
      layout.value = getLandingPageLayoutWithEmptyWidgetPlaceholder(
        normalizeLandingPageLayout(
          undefined,
          DEFAULT_LANDING_PAGE_LAYOUT,
          EXCLUDED_WIDGET_FQNS,
          LANDING_PAGE_MAX_GRID_SIZE,
          MY_DATA_WIDGET_KEYS,
        ),
      );
      await handleBackgroundColorUpdate(undefined);
      await props.onSaveLayout();
    },
  });
}

function exit(): void {
  if (props.onExit) {
    props.onExit();
    return;
  }
  void router.push({ name: 'home' });
}

function requestExit(): void {
  if (disableSave.value) {
    exit();
    return;
  }
  pendingLeave.value = exit;
  leaveModalOpen.value = true;
}

async function onLeaveSaveAndExit(): Promise<void> {
  const leave = pendingLeave.value;
  pendingLeave.value = null;
  abortHeldNavigation.value = null;
  // Pin NavigationBlocker handleSaveAndLeave: the modal stays open
  // while the save runs (the Save button shows the loading state) and
  // only closes once the save succeeds; a failed save keeps the user
  // on the page with the modal open, never navigating away and
  // dropping the edits (pin CustomizablePage: only a rejecting save
  // stays on the page).
  await handleSave().catch(() => undefined);
  if (!disableSave.value) {
    return;
  }
  leaveModalOpen.value = false;
  leaveConfirmed.value = true;
  leave?.();
}

function onLeaveDiscard(): void {
  const leave = pendingLeave.value;
  pendingLeave.value = null;
  abortHeldNavigation.value = null;
  leaveModalOpen.value = false;
  // Disarm the guard before leaving (pin NavigationBlocker
  // hasConfirmedLeave): the fresh navigation exit() starts must not
  // be re-intercepted while the editor is still dirty.
  leaveConfirmed.value = true;
  leave?.();
}

function onLeaveCancel(): void {
  pendingLeave.value = null;
  // Pin NavigationBlocker handleModalClose drops the pending
  // navigation: abort the held route navigation instead of leaving
  // it hanging. No-op on the page-Cancel path, where nothing is held.
  abortHeldNavigation.value?.();
  abortHeldNavigation.value = null;
  leaveModalOpen.value = false;
}

onBeforeRouteLeave((_to, _from, next) => {
  if (leaveConfirmed.value || disableSave.value) {
    next();
    return;
  }
  // Hold the navigation until the user chooses in the leave modal.
  pendingLeave.value = () => next();
  abortHeldNavigation.value = () => next(false);
  leaveModalOpen.value = true;
});

function onBeforeUnload(event: BeforeUnloadEvent): void {
  if (!disableSave.value) {
    event.preventDefault();
  }
}

onMounted(() => {
  window.addEventListener('beforeunload', onBeforeUnload);
});

onBeforeUnmount(() => {
  window.removeEventListener('beforeunload', onBeforeUnload);
});

/** The drag handle is the only draggable node; find its widget cell. */
function onDragStart(event: DragEvent): void {
  const target = event.target as HTMLElement | null;
  const cell = target?.closest('[data-widget-key]');
  const key = cell?.getAttribute('data-widget-key');
  if (!key || !event.dataTransfer) {
    event.preventDefault();
    return;
  }
  draggedKey.value = key;
  lastDragTarget.value = null;
  event.dataTransfer.effectAllowed = 'move';
  event.dataTransfer.setData('text/plain', key);
}

function onDragOver(event: DragEvent): void {
  if (!draggedKey.value || !gridRef.value) {
    return;
  }
  const rect = gridRef.value.getBoundingClientRect();
  const colWidth = (rect.width - LANDING_PAGE_WIDGET_MARGIN) / LANDING_PAGE_MAX_GRID_SIZE;
  const col = Math.max(
    0,
    Math.min(
      LANDING_PAGE_MAX_GRID_SIZE - 1,
      Math.floor((event.clientX - rect.left) / (colWidth + LANDING_PAGE_WIDGET_MARGIN)),
    ),
  );
  const row = Math.max(
    0,
    Math.floor(
      (event.clientY - rect.top) /
        (LANDING_PAGE_ROW_HEIGHT + LANDING_PAGE_WIDGET_MARGIN),
    ),
  );
  const last = lastDragTarget.value;
  if (last && last.x === col && last.y === row) {
    return;
  }
  lastDragTarget.value = { x: col, y: row };
  // Live reflow: the dragged widget at the pointer cell, the rest
  // repacked around it — the same handler pin's grid feeds.
  const updatedLayout = layout.value.map((item) =>
    item.i === draggedKey.value ? { ...item, x: col, y: row } : item,
  );
  layout.value = getLayoutUpdateHandler(updatedLayout)(layout.value);
}

function onDragEnd(): void {
  draggedKey.value = null;
  lastDragTarget.value = null;
}
</script>

<template>
  <div class="customize-my-data" data-testid="customize-my-data">
    <div class="customize-my-data__header">
      <div class="customize-my-data__heading">
        <h1 class="customize-my-data__title">{{ t('home.customizeLandingPage') }}</h1>
        <p class="customize-my-data__subtitle">
          {{ t('home.customizeHomePageForPersona', { persona: props.personaName }) }}
        </p>
      </div>
      <div class="customize-my-data__actions">
        <Button
          type="primary"
          data-testid="customize-add-widget"
          :disabled="hasObjectLayout && !converted"
          @click="openWidgetModal()"
        >
          {{ t('home.addWidget') }}
        </Button>
        <Button data-testid="customize-reset-layout" @click="handleReset">
          {{ t('home.reset') }}
        </Button>
        <Button
          type="primary"
          data-testid="customize-save-layout"
          :disabled="disableSave"
          :loading="saving"
          @click="handleSave()"
        >
          {{ t('crud.save') }}
        </Button>
        <Button data-testid="customize-cancel" @click="requestExit">
          {{ t('crud.cancel') }}
        </Button>
      </div>
    </div>

    <ObjectLayoutNotice
      v-if="hasObjectLayout && !converted"
      :stored-value="initialPageData?.layout"
      @convert="convertObjectLayout"
    />

    <div
      v-else
      ref="gridRef"
      class="customize-my-data__grid"
      dir="ltr"
      data-testid="customize-my-data-grid"
      :style="{ gridAutoRows: `${LANDING_PAGE_ROW_HEIGHT}px` }"
      @dragstart="onDragStart"
      @dragover.prevent="onDragOver"
      @drop.prevent="onDragEnd"
      @dragend="onDragEnd"
    >
      <div
        v-for="item in displayLayout"
        :key="item.i"
        class="customize-my-data__cell"
        :data-widget-key="item.i"
        :data-testid="
          isPlaceholder(item)
            ? 'customize-placeholder-cell'
            : `customize-widget-cell-${resolveMyDataWidgetBaseKey(item.i)}`
        "
        :style="cellStyle(item)"
      >
        <button
          v-if="isPlaceholder(item)"
          type="button"
          class="customize-my-data__placeholder"
          :data-testid="`customize-placeholder-${item.x}-${item.y}`"
          @click="openWidgetModal(item.i)"
        >
          <span class="customize-my-data__placeholder-label">+ {{ t('home.addWidget') }}</span>
        </button>
        <Suspense v-else>
          <component
            :is="resolveMyDataWidget(item.i)"
            v-bind="editorWidgetProps(item)"
            @remove="handleRemoveWidget(item.i)"
          />
          <template #fallback>
            <HomeWidgetCard :title="widgetLabel(item)" :is-loading="true" />
          </template>
        </Suspense>
      </div>
    </div>

    <CustomizeHomeModal
      :open="isWidgetModalOpen"
      :added-widgets-list="addedWidgetsList"
      :placeholder-widget-key="placeholderWidgetKey"
      :current-background-color="color"
      default-tab="all-widgets"
      :on-add-widget="handleAddWidget"
      :on-background-color-update="handleBackgroundColorUpdate"
      @close="isWidgetModalOpen = false"
    />

    <Modal
      :open="leaveModalOpen"
      :title="t('home.unsavedChanges')"
      :closable="false"
      :mask-closable="false"
      @cancel="onLeaveCancel"
    >
      <p>{{ t('home.unsavedChangesMessage') }}</p>
      <template #footer>
        <Button data-testid="customize-leave-cancel" @click="onLeaveCancel">
          {{ t('crud.cancel') }}
        </Button>
        <Button data-testid="customize-leave-discard" @click="onLeaveDiscard">
          {{ t('home.discardChanges') }}
        </Button>
        <Button
          type="primary"
          data-testid="customize-leave-save-exit"
          :loading="saving"
          @click="onLeaveSaveAndExit"
        >
          {{ t('home.saveAndExit') }}
        </Button>
      </template>
    </Modal>
  </div>
</template>

<style scoped>
.customize-my-data {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 16px;
}
.customize-my-data__header {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  justify-content: space-between;
  gap: 16px;
}
.customize-my-data__title {
  margin: 0;
  font-size: 20px;
  font-weight: 600;
}
.customize-my-data__subtitle {
  margin: 4px 0 0;
  font-size: 13px;
  color: var(--sm-text-secondary);
}
.customize-my-data__actions {
  display: flex;
  gap: 8px;
}
.customize-my-data__grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
  min-width: 0;
}
.customize-my-data__cell {
  display: flex;
  min-width: 0;
  min-height: 0;
}
.customize-my-data__cell > * {
  flex: 1 1 auto;
  min-width: 0;
  min-height: 0;
}
.customize-my-data__placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  min-height: 96px;
  border: 1.5px dashed var(--sm-border-secondary);
  border-radius: var(--sm-radius-card);
  background: transparent;
  color: var(--sm-text-secondary);
  cursor: pointer;
}
.customize-my-data__placeholder:hover {
  border-color: var(--sm-text-secondary);
  color: var(--sm-text-primary);
}
.customize-my-data__placeholder-label {
  font-size: 14px;
  font-weight: 600;
}
</style>
