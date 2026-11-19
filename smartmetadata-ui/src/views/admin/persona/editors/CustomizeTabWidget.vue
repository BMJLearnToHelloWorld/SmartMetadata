<!--
  Copyright 2026 SmartMetadata authors.

  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { Button, Card, Dropdown, Input, Menu, Modal } from 'ant-design-vue';
import type { PersonaPage } from '@/types/persona';
import { entityTypeForPageType } from '@/composables/useCustomPages';
import AssetDetailPiece from '@/views/AssetDetailPiece.vue';
import AddWidgetModal from './AddWidgetModal.vue';
import CustomPropertiesTabSection from './CustomPropertiesTabSection.vue';
import DetailGridEditor from './DetailGridEditor.vue';
import ObjectLayoutNotice from './ObjectLayoutNotice.vue';
import {
  DetailPageWidgetKeys,
  TAB_GRID_MAX_COLUMNS,
  getCustomizableWidgetByPage,
  getDefaultTabs,
  getDefaultWidgetForTab,
  getDummyDataByPage,
} from './customizePageData';
import { parsePropertyLayout } from './customPropertiesLayout';
import type { CustomPropertyLayoutItem } from './customPropertiesLayout';
import {
  buildEditorPieceContext,
  pieceForEditorContentKey,
} from './editorWidgetContent';
import {
  getAddWidgetHandler,
  getLayoutWithEmptyWidgetPlaceholder,
  getUniqueFilteredLayout,
  mergeGridLayout,
} from './gridLayoutUtils';
import type { CommonWidgetType, CustomizeTab, WidgetConfig } from './customizeTypes';
import { asCustomizeTab, tabId, uniqueId } from './customizeTypes';
import { resolveTabLabel, widgetLabelFromKey, widgetTitle } from './tabLabels';
import { defaultTabLabelResolver } from './tabLabels';

/**
 * CustomizeTabWidget equivalent (official
 * components/Customization/CustomizeTabWidget/CustomizeTabWidget.tsx),
 * store-agnostic: the edited page arrives via props and every mutation
 * goes out through onUpdateCurrentPage (the entry flow wires the
 * customize store). No props are read for initial page data beyond
 * currentPage/currentPageType.
 *
 * Preserved verbatim: active-tab init + re-sync effect, placeholder
 * append (h=2, w=3) with strip-on-persist, add/remove/rename/reorder
 * tab handlers (including the dangling-key quirk when re-adding a
 * hidden system tab — the re-sync watch repairs it, as in official),
 * Custom Properties tab branch (single full-width widget with
 * config.propertyLayout), widget add/remove/config handlers, and the
 * D2 object-layout abnormal state per tab (see ObjectLayoutNotice).
 *
 * Tab chips open a menu on click (Edit widgets / Rename / Hide|Delete)
 * and reorder by drag, matching official TabItem (DraggableTabs).
 * Literals pending key registration are marked; see notes.
 */
const props = defineProps<{
  currentPage: PersonaPage | null;
  currentPageType: string;
  onUpdateCurrentPage: (page: PersonaPage) => void;
}>();

const emit = defineEmits<{
  'last-panel-widget-kept': [];
}>();

const { t } = useI18n();

const CUSTOM_PROPERTIES_TAB = 'custom_properties';

const systemTabs = computed(() =>
  getDefaultTabs(props.currentPageType, defaultTabLabelResolver(t)),
);
const items = computed<CustomizeTab[]>(() => {
  const tabs = props.currentPage?.tabs;
  if (Array.isArray(tabs)) {
    return tabs.map(asCustomizeTab);
  }
  return systemTabs.value;
});
const systemTabIds = computed(() => systemTabs.value.map((tab) => tabId(tab)));
const hiddenTabs = computed(() =>
  systemTabs.value.filter(
    (systemTab) => !items.value.some((item) => tabId(item) === tabId(systemTab)),
  ),
);

const activeKey = ref<string | null>(null);
const showAddTabModal = ref(false);
const newTabName = ref(t('persona.newTab'));
const editableItem = ref<CustomizeTab | null>(null);
const isWidgetModalOpen = ref(false);
const placeholderWidgetKey = ref('');

watch(
  items,
  (nextItems) => {
    if (activeKey.value && nextItems.some((item) => tabId(item) === activeKey.value)) {
      return;
    }
    const nextKey =
      nextItems.find((item) => item.editable)?.id ?? nextItems[0]?.id ?? null;
    if (nextKey) {
      activeKey.value = nextKey;
    }
  },
  { immediate: true },
);

const activeTab = computed(
  () => items.value.find((item) => tabId(item) === activeKey.value) ?? null,
);
const isCustomPropertiesTab = computed(() => activeKey.value === CUSTOM_PROPERTIES_TAB);

/** D2: a present-but-non-array tab layout is an abnormal state, not a grid. */
const activeTabObjectLayout = computed(() => {
  const layout = activeTab.value?.layout;
  return layout !== undefined && !Array.isArray(layout) ? layout : null;
});

const tabLayouts = computed<WidgetConfig[]>(() => {
  if (activeTabObjectLayout.value !== null) {
    return [];
  }
  const stored = activeTab.value?.layout;
  const layout: WidgetConfig[] = Array.isArray(stored)
    ? (stored as WidgetConfig[])
    : getDefaultWidgetForTab(props.currentPageType, activeKey.value ?? 'overview');
  const hasPlaceholder = layout.some(
    (widget) => widget.i === DetailPageWidgetKeys.EMPTY_WIDGET_PLACEHOLDER,
  );
  return hasPlaceholder ? layout : getLayoutWithEmptyWidgetPlaceholder(layout, 2, 3);
});

const persistedTabLayouts = computed(() =>
  tabLayouts.value.filter(
    (widget) => widget.i !== DetailPageWidgetKeys.EMPTY_WIDGET_PLACEHOLDER,
  ),
);

const leftPanelWidget = computed(() =>
  tabLayouts.value.find((widget) =>
    widget.i.startsWith(DetailPageWidgetKeys.LEFT_PANEL),
  ),
);

const customPropertiesTabLayout = computed<CustomPropertyLayoutItem[]>(() => {
  const widget = tabLayouts.value.find(
    (candidate) =>
      candidate.i === DetailPageWidgetKeys.CUSTOM_PROPERTIES ||
      candidate.i.startsWith(`${DetailPageWidgetKeys.CUSTOM_PROPERTIES}-`),
  );
  const config = widget?.config as Record<string, unknown> | undefined;
  return parsePropertyLayout(config?.propertyLayout);
});

// R-EDIT-2: the Custom Properties section fetches the entity's
// definitions, so it needs the entity type for the page being edited
// (official getEntityTypeFromPageType).
const customPropertiesEntityType = computed(() =>
  entityTypeForPageType(props.currentPageType),
);

// R-EDIT-1: live widget content from the page's dummy data (official
// GenericWidget renders its matched component with
// getDummyDataByPage data, read-only). The dummy context carries no
// network calls: every piece is prop-driven.
const editorPieceContext = computed(() =>
  buildEditorPieceContext(
    getDummyDataByPage(props.currentPageType),
    customPropertiesEntityType.value ?? '',
  ),
);

const widgetsList = computed(() => getCustomizableWidgetByPage(props.currentPageType));

function updatePage(tabs: CustomizeTab[]): void {
  props.onUpdateCurrentPage({
    ...(props.currentPage ?? { pageType: props.currentPageType }),
    tabs: tabs as PersonaPage['tabs'],
  } as PersonaPage);
}

function updateActiveTabLayout(layout: WidgetConfig[]): void {
  updatePage(
    items.value.map((item) =>
      tabId(item) === activeKey.value ? { ...item, layout } : item,
    ),
  );
}

function onChange(tabKey: string): void {
  activeKey.value = tabKey;
}

function add(item?: CustomizeTab): void {
  const newActiveKey = uniqueId('custom');
  const newTab: CustomizeTab =
    item ?? { name: newTabName.value, layout: [], id: newActiveKey, editable: true };
  updatePage([...items.value, newTab]);
  // QUIRK (verbatim): the dangling key for the re-add case is repaired
  // by the re-sync watch, exactly as official's effect repairs it.
  onChange(newActiveKey);
  showAddTabModal.value = false;
}

function remove(targetKey: string): void {
  let newActiveKey = activeKey.value;
  let lastIndex = -1;
  items.value.forEach((item, i) => {
    if (tabId(item) === targetKey) {
      lastIndex = i - 1;
    }
  });
  const newPanes = items.value.filter((item) => tabId(item) !== targetKey);
  if (newPanes.length && newActiveKey === targetKey) {
    if (lastIndex >= 0) {
      newActiveKey = tabId(newPanes[lastIndex]);
    } else {
      newActiveKey = tabId(newPanes[0]);
    }
  }
  updatePage(newPanes);
  if (newActiveKey && newActiveKey !== activeKey.value) {
    onChange(newActiveKey);
  }
}

function handleTabEditClick(key: string): void {
  editableItem.value = items.value.find((item) => tabId(item) === key) ?? null;
}

function handleRenameSave(): void {
  if (editableItem.value) {
    const renamed = editableItem.value;
    updatePage(
      items.value.map((item) => (tabId(item) === tabId(renamed) ? renamed : item)),
    );
    editableItem.value = null;
  }
}

function handleRenameChange(displayName: string): void {
  if (editableItem.value) {
    editableItem.value = { ...editableItem.value, displayName };
  }
}

function handleRemoveWidget(widgetKey: string): void {
  // A panel child is removed from the panel's children (official
  // reaches the same end state through the nested grid's layout
  // update); a top-level widget is removed from the tab layout.
  const isTopLevel = persistedTabLayouts.value.some((widget) => widget.i === widgetKey);
  if (isTopLevel) {
    updateActiveTabLayout(
      persistedTabLayouts.value.filter((widget) => widget.i !== widgetKey),
    );
    return;
  }
  updateActiveTabLayout(
    persistedTabLayouts.value.map((widget) =>
      widget.i.startsWith(DetailPageWidgetKeys.LEFT_PANEL)
        ? {
            ...widget,
            children: (widget.children ?? []).filter((child) => child.i !== widgetKey),
          }
        : widget,
    ),
  );
}

function handleLayoutUpdate(updatedLayout: WidgetConfig[]): void {
  if (tabLayouts.value.length === 0 || updatedLayout.length === 0) {
    return;
  }
  const storedPanelHeight = leftPanelWidget.value?.h;
  const storedPanelKey = leftPanelWidget.value?.i;
  const layout = mergeGridLayout(getUniqueFilteredLayout(updatedLayout), tabLayouts.value).map(
    (widget) =>
      storedPanelKey && widget.i === storedPanelKey
        ? { ...widget, h: storedPanelHeight as number }
        : widget,
  );
  updateActiveTabLayout(layout);
}

function handleWidgetConfigChange(
  widgetKey: string,
  config: WidgetConfig['config'],
  width?: number,
): void {
  // J-1: a widget nested in the left panel writes through the same
  // path (the grid renders the #widget slot for panel children too,
  // so a Custom Properties widget there must persist its layout).
  updateActiveTabLayout(
    persistedTabLayouts.value.map((widget) => {
      if (widget.i === widgetKey) {
        return { ...widget, config, w: width ?? widget.w };
      }
      if (widget.i.startsWith(DetailPageWidgetKeys.LEFT_PANEL)) {
        return {
          ...widget,
          children: (widget.children ?? []).map((child) =>
            child.i === widgetKey ? { ...child, config, w: width ?? child.w } : child,
          ),
        };
      }
      return widget;
    }),
  );
}

function handleWidgetWidth(widgetKey: string, width: number): void {
  const widget = persistedTabLayouts.value.find((candidate) => candidate.i === widgetKey);
  handleWidgetConfigChange(widgetKey, widget?.config, width);
}

// J-1 (pin GenericWidget.tsx:139-213): the Custom Properties widget
// renders the interactive layout editor in any tab's grid cell —
// never the read-only piece — with the page's entity type and the
// widget's own config.propertyLayout, as in the custom_properties tab.
function isCustomPropertiesWidget(widget: WidgetConfig): boolean {
  return (
    widget.i === DetailPageWidgetKeys.CUSTOM_PROPERTIES ||
    widget.i.startsWith(`${DetailPageWidgetKeys.CUSTOM_PROPERTIES}-`)
  );
}

function customPropertiesWidgetLayout(widget: WidgetConfig): CustomPropertyLayoutItem[] {
  const config = widget.config as Record<string, unknown> | undefined;
  return parsePropertyLayout(config?.propertyLayout);
}

function handleGridCustomPropertiesLayoutChange(
  widget: WidgetConfig,
  propertyLayout: CustomPropertyLayoutItem[],
): void {
  handleWidgetConfigChange(widget.i, {
    ...(widget.config ?? {}),
    propertyLayout,
  });
}

function handleMainPanelAddWidget(
  newWidgetData: CommonWidgetType,
  placeholderKey: string,
  widgetSize: number,
  extraConfig?: WidgetConfig['config'],
): void {
  const newLayout = getAddWidgetHandler(
    newWidgetData,
    placeholderKey,
    widgetSize,
    props.currentPageType,
    extraConfig,
  )(tabLayouts.value);
  // The placeholder is a grid affordance, not saved layout: strip it
  // before writing (official relies on the grid's onLayoutChange to
  // strip it; this engine emits no mount/update layout event, so the
  // writer strips it here). The display memo re-appends it.
  updateActiveTabLayout(
    newLayout.filter(
      (widget) => widget.i !== DetailPageWidgetKeys.EMPTY_WIDGET_PLACEHOLDER,
    ),
  );
  isWidgetModalOpen.value = false;
}

function handleCustomPropertiesTabLayoutChange(
  propertyLayout: CustomPropertyLayoutItem[],
): void {
  updatePage(
    items.value.map((item) =>
      tabId(item) === CUSTOM_PROPERTIES_TAB
        ? {
            ...item,
            layout: [
              {
                i: DetailPageWidgetKeys.CUSTOM_PROPERTIES,
                x: 0,
                y: 0,
                w: TAB_GRID_MAX_COLUMNS,
                h: 1,
                config: { propertyLayout },
              },
            ],
          }
        : item,
    ),
  );
}

function convertObjectLayout(): void {
  updateActiveTabLayout(
    getDefaultWidgetForTab(props.currentPageType, activeKey.value ?? 'overview'),
  );
}

function moveTab(fromIndex: number, toIndex: number): void {
  const newItems = [...items.value];
  const [movedItem] = newItems.splice(fromIndex, 1);
  newItems.splice(toIndex, 0, movedItem);
  updatePage(newItems);
}

const draggedTabIndex = ref<number | null>(null);

function onTabDragStart(index: number): void {
  draggedTabIndex.value = index;
}

function onTabDragOver(index: number): void {
  if (draggedTabIndex.value === null || draggedTabIndex.value === index) {
    return;
  }
  moveTab(draggedTabIndex.value, index);
  draggedTabIndex.value = index;
}

function tabMenuItems(item: CustomizeTab): Array<{ key: string; label: string }> {
  const isEditable =
    Boolean(item.editable) || tabId(item) === CUSTOM_PROPERTIES_TAB;
  const menu: Array<{ key: string; label: string }> = [];
  if (isEditable) {
    menu.push({ key: 'edit', label: t('home.editWidget') });
  }
  menu.push({ key: 'rename', label: t('persona.renameTabAction') });
  menu.push({
    key: 'delete',
    label: systemTabIds.value.includes(tabId(item)) ? t('persona.hideTab') : t('crud.delete'),
  });
  return menu;
}

function onTabMenuClick(item: CustomizeTab, key: string): void {
  if (key === 'edit') {
    onChange(tabId(item));
  } else if (key === 'rename') {
    handleTabEditClick(tabId(item));
  } else if (key === 'delete') {
    remove(tabId(item));
  }
}

function openAddWidgetModal(placeholderKey?: string): void {
  if (placeholderKey) {
    placeholderWidgetKey.value = placeholderKey;
  }
  isWidgetModalOpen.value = true;
}
</script>

<template>
  <div class="customize-tab-widget">
    <Card data-testid="customize-tab-card">
      <template #title>
        <span>{{ t('persona.customizeTabs') }}</span>
      </template>
      <template #extra>
        <Button
          type="primary"
          data-testid="add-tab-button"
          @click="showAddTabModal = true"
        >
          {{ t('persona.addTab') }}
        </Button>
      </template>
      <div class="customize-tab-widget__chips">
        <div
          v-for="(item, index) in items"
          :key="tabId(item)"
          class="customize-tab-widget__chip"
          draggable="true"
          @dragstart="onTabDragStart(index)"
          @dragover.prevent="onTabDragOver(index)"
          @dragend="draggedTabIndex = null"
        >
          <Dropdown :trigger="['click']">
            <Button
              :type="tabId(item) === activeKey ? 'primary' : 'default'"
              :data-testid="`tab-${item.name}`"
            >
              {{ resolveTabLabel(t, item) }}
            </Button>
            <template #overlay>
              <Menu @click="({ key }) => onTabMenuClick(item, key as string)">
                <Menu.Item
                  v-for="menuItem in tabMenuItems(item)"
                  :key="menuItem.key"
                  :data-testid="`tab-menu-${menuItem.key}-${item.name}`"
                >
                  {{ menuItem.label }}
                </Menu.Item>
              </Menu>
            </template>
          </Dropdown>
        </div>
        <div
          v-for="item in hiddenTabs"
          :key="tabId(item)"
          class="customize-tab-widget__chip"
        >
          <Dropdown :trigger="['click']">
            <Button :data-testid="`tab-${item.name}`">
              {{ resolveTabLabel(t, item) }}
            </Button>
            <template #overlay>
              <Menu @click="() => add(item)">
                <Menu.Item key="show" :data-testid="`tab-menu-show-${item.name}`">
                  {{ t('persona.showTab') }}
                </Menu.Item>
              </Menu>
            </template>
          </Dropdown>
        </div>
      </div>
    </Card>

    <Card class="customize-tab-widget__grid-card">
      <template #title>
        <span>{{ activeTab ? resolveTabLabel(t, activeTab) : '' }}</span>
      </template>
      <template v-if="!isCustomPropertiesTab" #extra>
        <Button
          type="primary"
          data-testid="add-widget-button"
          @click="openAddWidgetModal()"
        >
          {{ t('home.addWidget') }}
        </Button>
      </template>
      <CustomPropertiesTabSection
        v-if="isCustomPropertiesTab"
        :entity-type="customPropertiesEntityType"
        :property-layout="customPropertiesTabLayout"
        @change="handleCustomPropertiesTabLayoutChange"
      />
      <ObjectLayoutNotice
        v-else-if="activeTabObjectLayout !== null"
        :stored-value="activeTabObjectLayout"
        @convert="convertObjectLayout"
      />
      <DetailGridEditor
        v-else
        :layout="tabLayouts"
        :cols="TAB_GRID_MAX_COLUMNS"
        :page-type="currentPageType"
        :widget-title="widgetTitle"
        @layout-change="handleLayoutUpdate"
        @remove="handleRemoveWidget"
        @widget-width="handleWidgetWidth"
        @placeholder-click="openAddWidgetModal"
        @last-panel-widget-kept="emit('last-panel-widget-kept')"
      >
        <!-- R-EDIT-1: live content from dummy data, read-only inside
             the cell (the grid's pointer-events-none live area);
             widgets with no piece keep their title chrome.
             J-1 (pin GenericWidget): a Custom Properties widget in
             any tab's cell renders the interactive layout editor
             instead — the wrapper re-enables pointer events inside
             the live area, since pin renders the editor outside the
             read-only container. -->
        <template #widget="{ widget, contentKey }">
          <div
            v-if="isCustomPropertiesWidget(widget)"
            class="customize-tab-widget__cell-editor"
          >
            <CustomPropertiesTabSection
              :entity-type="customPropertiesEntityType"
              :property-layout="customPropertiesWidgetLayout(widget)"
              @change="(layout) => handleGridCustomPropertiesLayoutChange(widget, layout)"
            />
          </div>
          <AssetDetailPiece
            v-else-if="pieceForEditorContentKey(contentKey)"
            :piece="pieceForEditorContentKey(contentKey)"
            :context="editorPieceContext"
          />
        </template>
      </DetailGridEditor>
    </Card>

    <AddWidgetModal
      v-if="currentPageType"
      :open="isWidgetModalOpen"
      :widgets-list="widgetsList"
      :placeholder-widget-key="placeholderWidgetKey"
      :widget-label="(widget) => widgetLabelFromKey(widget.fullyQualifiedName)"
      @add-widget="handleMainPanelAddWidget"
      @close="isWidgetModalOpen = false"
    />

    <Modal
      :open="showAddTabModal"
      :title="t('persona.addTab')"
      :ok-text="t('crud.add')"
      :cancel-text="t('crud.cancel')"
      @ok="add()"
      @cancel="showAddTabModal = false"
    >
      <Input
        v-model:value="newTabName"
        data-testid="add-tab-input"
        :aria-label="t('crud.name')"
      />
    </Modal>

    <Modal
      :open="editableItem !== null"
      :title="t('persona.renameTab')"
      :ok-text="t('crud.save')"
      :cancel-text="t('crud.cancel')"
      @ok="handleRenameSave"
      @cancel="editableItem = null"
    >
      <Input
        :value="editableItem ? resolveTabLabel(t, editableItem) : ''"
        :aria-label="t('crud.name')"
        @update:value="(value) => handleRenameChange(value as string)"
      />
    </Modal>
  </div>
</template>

<style scoped>
.customize-tab-widget {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.customize-tab-widget__chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.customize-tab-widget__chip {
  cursor: grab;
}
.customize-tab-widget__grid-card {
  margin-top: 0;
}
/* J-1: the Custom Properties cell editor is interactive inside the
   grid's pointer-events-none live area (pin GenericWidget renders
   the editor outside the read-only container). */
.customize-tab-widget__cell-editor {
  pointer-events: auto;
}
</style>
