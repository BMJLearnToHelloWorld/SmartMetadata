<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { Button, Dropdown, Space, TreeSelect } from 'ant-design-vue';
import SmIcon from '@/components/shared/SmIcon.vue';
import {
  loadGlossaryPickerChildren,
  loadGlossaryPickerRoots,
  type GlossaryTreeSelectNode,
} from '@/governance/glossaryTreeSelect';

/**
 * Official GlossaryTermPicker on the Data Quality dashboard
 * (commitMode staged, triggerVariant button). Tree roots are glossaries;
 * terms load lazily. Glossary rows are not selectable values.
 */
const props = withDefaults(
  defineProps<{
    modelValue: string[];
    label?: string;
    testId?: string;
  }>(),
  { label: undefined, testId: 'dq-dashboard-filter-glossary' },
);

const emit = defineEmits<{ 'update:modelValue': [value: string[]] }>();

const { t } = useI18n();
const open = ref(false);
const treeData = ref<GlossaryTreeSelectNode[]>([]);
const loadingRoots = ref(false);
const draft = ref<string[]>([]);

const displayLabel = computed(() => props.label ?? t('label.glossary-term'));

const summary = computed(() => {
  if (!props.modelValue.length) {
    return '';
  }
  return props.modelValue.join(', ');
});

async function ensureRoots(): Promise<void> {
  if (treeData.value.length || loadingRoots.value) {
    return;
  }
  loadingRoots.value = true;
  try {
    treeData.value = await loadGlossaryPickerRoots();
  } catch {
    treeData.value = [];
  } finally {
    loadingRoots.value = false;
  }
}

async function onLoadData(treeNode: { dataRef?: GlossaryTreeSelectNode }): Promise<void> {
  const node = treeNode.dataRef;
  if (!node || node.children) {
    return;
  }
  const parentFqn = String(node.value);
  const children = await loadGlossaryPickerChildren(parentFqn);
  node.children = children;
  node.isLeaf = children.length === 0;
  treeData.value = [...treeData.value];
}

function onOpenChange(next: boolean): void {
  open.value = next;
  if (next) {
    draft.value = [...props.modelValue];
    void ensureRoots();
  }
}

function apply(): void {
  emit('update:modelValue', [...draft.value]);
  open.value = false;
}

function cancel(): void {
  draft.value = [...props.modelValue];
  open.value = false;
}

watch(
  () => props.modelValue,
  (value) => {
    if (!open.value) {
      draft.value = [...value];
    }
  },
);
</script>

<template>
  <Dropdown :open="open" :trigger="['click']" placement="bottomLeft" @update:open="onOpenChange">
    <Button class="dq-dashboard__filter dq-dashboard__filter-trigger" :data-testid="testId">
      <span class="dq-dashboard__filter-trigger-label">
        {{ displayLabel }}
        <template v-if="modelValue.length">
          :
          <span class="dq-dashboard__filter-trigger-value">{{ summary }}</span>
        </template>
      </span>
      <SmIcon icon-key="action-chevron-down" />
    </Button>
    <template #overlay>
      <div class="glossary-term-filter-picker" data-testid="glossary-term-filter-picker-panel">
        <TreeSelect
          v-model:value="draft"
          :tree-data="treeData"
          :load-data="onLoadData"
          tree-checkable
          show-checked-strategy="SHOW_CHILD"
          multiple
          allow-clear
          :loading="loadingRoots"
          tree-node-filter-prop="title"
          :placeholder="t('label.select-field', { field: t('label.glossary-term-plural') })"
          style="width: 100%"
          popup-class-name="glossary-term-filter-picker__dropdown"
          :get-popup-container="(node) => node.parentElement ?? document.body"
        />
        <Space class="glossary-term-filter-picker__actions">
          <Button size="small" data-testid="glossary-term-filter-cancel" @click="cancel">
            {{ t('label.cancel') }}
          </Button>
          <Button type="primary" size="small" data-testid="glossary-term-filter-apply" @click="apply">
            {{ t('label.apply') }}
          </Button>
        </Space>
      </div>
    </template>
  </Dropdown>
</template>

<style scoped>
.dq-dashboard__filter-trigger {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  max-width: 280px;
}
.dq-dashboard__filter-trigger-label {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.dq-dashboard__filter-trigger-value {
  font-weight: 600;
  color: var(--sm-color-primary);
}
.glossary-term-filter-picker {
  padding: 12px;
  width: 360px;
  background: var(--sm-color-bg-container, #fff);
  box-shadow: 0 6px 16px rgba(0, 0, 0, 0.08);
}
.glossary-term-filter-picker__actions {
  margin-top: 8px;
  justify-content: flex-end;
  width: 100%;
}
</style>