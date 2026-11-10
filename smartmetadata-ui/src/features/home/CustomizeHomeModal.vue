<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { Checkbox, Modal, Tabs, Tag, message } from 'ant-design-vue';
import HeaderTheme from './HeaderTheme.vue';
import { EMPTY_WIDGET_PLACEHOLDER } from './landingPageEditor';
import { MY_DATA_WIDGET_OPTIONS } from './landingPageWidgets';
import { LANDING_PAGE_WIDGET_KEYS } from './landingPageLayout';
import { DEFAULT_HEADER_BG_COLOR } from './landingHeaderColor';

/**
 * The customize-home modal, ported from the official framework
 * (openmetadata-ui `components/MyData/CustomizableComponents/CustomiseHomeModal/`).
 *
 * Two tabs: Header Theme (the colour picker + preview) and All
 * Widgets (the registry allowlist — pin fetches KnowledgePanel seed
 * docs and filters them through the same allowlist; the product
 * builds the list from the registry directly, R-W3G11D-2).
 *
 * Selection semantics, per pin: the already-added widgets show as
 * added and cannot be selected again (prefix match, except
 * CuratedAssets, which is multi-instance and can always be added
 * again). Apply is disabled unless something changed, and applies
 * the colour change (when changed) plus one add per newly selected
 * widget, through the placeholder key when one is set.
 *
 * One deliberate difference from pin's literal code: pin's
 * `hasChanges` counts the pre-selected display state, so its Apply
 * is enabled on open; here `hasChanges` counts only a colour change
 * or a newly selected widget, so the disabled state is meaningful —
 * the applied result is identical.
 */
const props = defineProps<{
  open: boolean;
  addedWidgetsList: string[];
  placeholderWidgetKey?: string;
  currentBackgroundColor?: string;
  /** The tab the modal opens on; the editor opens on All Widgets. */
  defaultTab?: 'header-theme' | 'all-widgets';
  onAddWidget: (widgetFqn: string, placeholderWidgetKey: string, width: number) => void;
  onBackgroundColorUpdate: (color: string) => Promise<void> | void;
}>();

const emit = defineEmits<{ (event: 'close'): void }>();

const { t } = useI18n();

const selectedColor = ref(props.currentBackgroundColor ?? DEFAULT_HEADER_BG_COLOR);
const selectedTab = ref<'header-theme' | 'all-widgets'>(props.defaultTab ?? 'header-theme');
const newlySelected = ref<string[]>([]);
const applying = ref(false);

watch(
  () => props.open,
  (open) => {
    if (open) {
      selectedColor.value = props.currentBackgroundColor ?? DEFAULT_HEADER_BG_COLOR;
      selectedTab.value = props.defaultTab ?? 'header-theme';
      newlySelected.value = [];
    }
  },
);

function isAlreadyAdded(widgetKey: string): boolean {
  return props.addedWidgetsList.some(
    (added) =>
      added.startsWith(widgetKey) && !added.includes(LANDING_PAGE_WIDGET_KEYS.CURATED_ASSETS),
  );
}

function handleSelectWidget(widgetKey: string): void {
  if (isAlreadyAdded(widgetKey)) {
    return;
  }
  newlySelected.value = newlySelected.value.includes(widgetKey)
    ? newlySelected.value.filter((key) => key !== widgetKey)
    : [...newlySelected.value, widgetKey];
}

const hasChanges = computed(
  () =>
    selectedColor.value !== (props.currentBackgroundColor ?? DEFAULT_HEADER_BG_COLOR) ||
    newlySelected.value.length > 0,
);

async function handleApply(): Promise<void> {
  applying.value = true;
  try {
    if (selectedColor.value !== (props.currentBackgroundColor ?? DEFAULT_HEADER_BG_COLOR)) {
      await props.onBackgroundColorUpdate(selectedColor.value);
    }
    for (const widgetKey of newlySelected.value) {
      props.onAddWidget(
        widgetKey,
        props.placeholderWidgetKey ?? EMPTY_WIDGET_PLACEHOLDER,
        1,
      );
    }
    newlySelected.value = [];
    emit('close');
  } catch (error) {
    message.error(error instanceof Error ? error.message : String(error));
  } finally {
    applying.value = false;
  }
}
</script>

<template>
  <Modal
    :open="props.open"
    :title="t('home.customizeHomePage')"
    :width="960"
    :ok-text="t('crud.apply')"
    :cancel-text="t('crud.cancel')"
    :ok-button-props="{ disabled: !hasChanges, loading: applying }"
    @ok="handleApply"
    @cancel="emit('close')"
  >
    <Tabs v-model:active-key="selectedTab">
      <Tabs.TabPane key="header-theme" :tab="t('home.headerTheme')">
        <HeaderTheme
          :selected-color="selectedColor"
          @update:selected-color="selectedColor = $event"
        />
      </Tabs.TabPane>
      <Tabs.TabPane key="all-widgets" :tab="t('home.allWidgets')">
        <div class="customize-home-modal__widgets">
          <label
            v-for="option in MY_DATA_WIDGET_OPTIONS"
            :key="option.key"
            class="customize-home-modal__widget"
            :data-widget-key="option.key"
          >
            <Checkbox
              :checked="isAlreadyAdded(option.key) || newlySelected.includes(option.key)"
              :disabled="isAlreadyAdded(option.key)"
              :data-testid="`customize-widget-${option.key}`"
              @change="handleSelectWidget(option.key)"
            >
              {{ option.label }}
            </Checkbox>
            <Tag v-if="isAlreadyAdded(option.key)" color="default">
              {{ t('home.added') }}
            </Tag>
          </label>
        </div>
      </Tabs.TabPane>
    </Tabs>
  </Modal>
</template>

<style scoped>
.customize-home-modal__widgets {
  display: flex;
  flex-direction: column;
  gap: 4px;
  max-height: 50vh;
  overflow-y: auto;
}
.customize-home-modal__widget {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 8px 4px;
  border-bottom: 1px solid var(--sm-border-secondary);
  cursor: pointer;
}
</style>
