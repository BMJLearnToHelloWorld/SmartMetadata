<!--
  Copyright 2026 SmartMetadata authors.

  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { Switch, Tree, message } from 'ant-design-vue';
import type { DataNode } from 'ant-design-vue/es/tree';
import { NAV_ENTRIES, type NavEntry } from '@/layouts/nav';
import type { Persona } from '@/types/persona';
import CustomizeLeaveModal from './CustomizeLeaveModal.vue';
import CustomizePageHeader from './CustomizePageHeader.vue';
import { deepEqualJson } from './customizeTypes';
import {
  getHiddenKeysFromNavigationItems,
  getNavigationItems,
  getTreeDataForNavigationItems,
  moveNavigationItem,
  type NavigationItem,
  type NavigationTreeNode,
  type SidebarBaseItem,
} from './navigationUtils';
import { useSaveLeaveGuard } from './useSaveLeaveGuard';

/**
 * SettingsNavigationPage equivalent (official
 * pages/SettingsNavigationPage/SettingsNavigationPage.tsx).
 *
 * - Loads null/missing navigation as the default tree (never empty).
 * - Editing is tree drag + per-item visibility Toggle.
 * - Save serializes via getNavigationItems(treeData, hiddenKeys).
 * - Reset regenerates from null, local-only, zero requests; a
 *   subsequent Save writes the default-tree serialization (never
 *   navigation:null, never a key delete, never "reset means save").
 * - Dirty compare is isEqual against the stored value; leave
 *   interception runs the throwing save on Save-and-leave.
 * - Titles are label keys, translated at render (official
 *   Tree.Item textValue={t(node.title)}); the base tree comes from
 *   layouts/nav.ts NAV_ENTRIES (footer entries excluded).
 */
const props = defineProps<{
  persona: Persona;
  navigation?: NavigationItem[] | null;
  onSave: (navigationList: NavigationItem[]) => Promise<void>;
}>();

defineEmits<{
  close: [];
}>();

const { t } = useI18n();
const saving = ref(false);

const personaName = computed(
  () => props.persona.displayName ?? props.persona.name ?? props.persona.fullyQualifiedName ?? '',
);

function toBaseItem(entry: NavEntry): SidebarBaseItem {
  if (entry.kind === 'section') {
    return {
      key: entry.key,
      title: entry.titleKey,
      children: entry.items.map((item) => ({ key: item.key, title: item.titleKey })),
    };
  }
  return { key: entry.key, title: entry.titleKey };
}

const baseItems = computed<SidebarBaseItem[]>(() => NAV_ENTRIES.map(toBaseItem));

const treeData = ref<NavigationTreeNode[]>(
  getTreeDataForNavigationItems(props.navigation, baseItems.value),
);
const hiddenKeys = ref<string[]>(
  getHiddenKeysFromNavigationItems(props.navigation, baseItems.value),
);

const serialized = computed(() => getNavigationItems(treeData.value, hiddenKeys.value));
const disableSave = computed(() =>
  deepEqualJson(props.navigation ?? null, serialized.value),
);

function toAntTreeData(nodes: NavigationTreeNode[]): DataNode[] {
  return nodes.map((node) => ({
    key: node.key,
    title: node.title,
    children: node.children ? toAntTreeData(node.children) : undefined,
  }));
}

const antTreeData = computed(() => toAntTreeData(treeData.value));

async function save(): Promise<void> {
  saving.value = true;
  try {
    await props.onSave(getNavigationItems(treeData.value, hiddenKeys.value));
  } finally {
    saving.value = false;
  }
}

async function saveFromButton(): Promise<void> {
  try {
    await save();
  } catch {
    message.error(t('persona.saveFailed'));
  }
}

function reset(): void {
  treeData.value = getTreeDataForNavigationItems(null, baseItems.value);
  hiddenKeys.value = getHiddenKeysFromNavigationItems(null, baseItems.value);
}

function onDrop(info: {
  dragNode: { key: string | number };
  node: { key: string | number };
  dropPosition: number;
  dropToGap?: boolean;
}): void {
  const sourceKey = String(info.dragNode.key);
  const targetKey = String(info.node.key);
  const dropPosition = !info.dropToGap ? 'on' : info.dropPosition === -1 ? 'before' : 'after';
  treeData.value = moveNavigationItem(treeData.value, sourceKey, targetKey, dropPosition);
}

function onToggle(checked: boolean, key: string): void {
  hiddenKeys.value = checked
    ? hiddenKeys.value.filter((item) => item !== key)
    : [...hiddenKeys.value, key];
}

const guard = useSaveLeaveGuard({
  isDirty: () => !disableSave.value,
  onSaveAndLeave: save,
});
</script>

<template>
  <div data-testid="navigation-editor">
    <CustomizePageHeader
      page-label="navigation"
      :persona-name="personaName"
      :disable-save="disableSave"
      :saving="saving"
      @save="saveFromButton()"
      @reset="reset()"
      @close="$emit('close')"
    />
    <Tree
      :tree-data="antTreeData"
      :selectable="false"
      :draggable="true"
      :default-expand-all="true"
      :block-node="true"
      @drop="onDrop"
    >
      <template #title="{ title, key }">
        <span class="navigation-editor__node">
          <span class="navigation-editor__label">{{ t(title as string) }}</span>
          <span @click.stop>
            <Switch
              :checked="!hiddenKeys.includes(key as string)"
              :data-testid="`navigation-switch-${key}`"
              @change="(checked) => onToggle(checked as boolean, key as string)"
            />
          </span>
        </span>
      </template>
    </Tree>
    <CustomizeLeaveModal
      :open="guard.showLeaveModal.value"
      :saving="saving"
      @save-and-exit="guard.saveAndLeave()"
      @discard="guard.discardAndLeave()"
      @cancel="guard.cancelLeave()"
    />
  </div>
</template>

<style scoped>
.navigation-editor__node {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  width: 100%;
}
.navigation-editor__label {
  flex: 1 1 auto;
}
</style>
